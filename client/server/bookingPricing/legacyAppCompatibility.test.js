import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBookingQuote } from "./index.js";

const productionSha = "4939d3afaffbf0d55f30fe90144d3bd7031c5272";
const root = fileURLToPath(new URL("../../..", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const sql = name => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migrations = ["2026-09-20-booking-guest-base-pricing", "2026-09-20-booking-pricing-calendar-discounts"];
const fields = ["guest_11_18_fee", "weekday_discount_rate", "friday_discount_rate", "saturday_discount_rate", "holiday_discount_rate"];
let adminFactory, bookingFactory, currentAdminFactory, db, shared, admin, booking, currentAdmin, writes, savedRequest;

// Compile the immutable Production source in memory, not the dirty working tree.
// Only DB/auth and unrelated management side effects are replaced with local boundaries.
async function legacyFactory(entry, revision = productionSha) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs",
    plugins: [{ name: "pinned-production-source", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const path = args.kind === "entry-point" ? posix.normalize(args.path)
          : args.path.startsWith(".") ? posix.normalize(posix.join(posix.dirname(args.importer), args.path)) : null;
        if (!path) return { path: args.path, external: true };
        if (path === "client/server/shopShared.js") return { path: "test:shared", external: true };
        if (path === "client/server/bookingManagement.js") return { path: "test:management", external: true };
        return { path, namespace: "production-git" };
      });
      builder.onLoad({ filter: /.*/, namespace: "production-git" }, args => ({
        contents: revision ? execFileSync("git", ["show", `${revision}:${args.path}`], { cwd: root, encoding: "utf8" })
          : readFileSync(new URL(args.path, new URL("../../../", import.meta.url)), "utf8"), loader: "js",
      }));
    } }],
  });
  return boundaries => {
    const module = { exports: {} };
    const require = name => name === "test:shared" ? boundaries
      : name === "test:management" ? { createManagementSessionForBooking: vi.fn() }
        : nativeRequire(name);
    new Function("require", "module", "exports", result.outputFiles[0].text)(require, module, module.exports);
    return module.exports.default;
  };
}

// Small PostgREST boundary backed by real, isolated PostgreSQL constraints/defaults.
// It only exposes synthetic pricing rows; no network or production credentials exist here.
async function request(path, options) {
  const url = new URL(path, "https://synthetic.invalid");
  const table = url.pathname.slice(1);
  if (table === "admin_profiles") return [{ is_active: true, role_code: "admin" }];
  if (["booking_admin_audit_logs", "booking_availability_alerts"].includes(table)) return [];
  if (table === "booking_settings") return [{ booking_window_months: 6, allow_villa_booking: true, allow_room_booking: false, total_room_count: 5, allow_pets: true }];
  if (["booking_availability_blocks", "booking_reservations"].includes(table)) return [];
  expect(["booking_price_rule_sets", "booking_package_rates", "booking_special_dates"]).toContain(table);
  const metadata = (await db.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows;
  const columns = new Set(metadata.map(r => r.column_name));
  const dateColumns = new Set(metadata.filter(r=>r.data_type==="date").map(r=>r.column_name));
  if (options) {
    const payload = JSON.parse(options.body);
    writes.push({ table, method: options.method, payload });
    const keys = Object.keys(payload);
    keys.forEach(key => expect(columns.has(key)).toBe(true));
    const values = Object.values(payload);
    if (options.method === "POST") return (await db.query(`insert into ${table} (${keys.join(",")}) values (${keys.map((_,i)=>`$${i+1}`).join(",")}) returning *`, values)).rows;
    expect(options.method).toBe("PATCH");
    const id = url.searchParams.get("id");
    expect(id).toMatch(/^eq\./);
    return (await db.query(`update ${table} set ${keys.map((key,i)=>`${key}=$${i+1}`).join(",")} where id=$${values.length+1} returning *`, [...values,id.slice(3)])).rows;
  }
  let rows = (await db.query(`select * from ${table}`)).rows.map(row=>Object.fromEntries(
    Object.entries(row).map(([key,value])=>[key,value instanceof Date ? (dateColumns.has(key) ? value.toISOString().slice(0,10) : value.toISOString()) : value])
  ));
  for (const [key,filter] of url.searchParams) {
    if (["select","order","limit"].includes(key)) continue;
    expect(columns.has(key)).toBe(true);
    const [op,...parts] = filter.split(".");
    const value = parts.join(".");
    rows = rows.filter(row => {
      if (op === "eq") return String(row[key]) === value;
      if (op === "lte") return row[key] <= value;
      if (op === "gte") return row[key] >= value;
      if (op === "in") return value.slice(1,-1).split(",").includes(String(row[key]));
      throw new Error(`Unsupported local filter ${op}`);
    });
  }
  if (url.searchParams.has("limit")) rows = rows.slice(0,Number(url.searchParams.get("limit")));
  const select = url.searchParams.get("select");
  if (select && select !== "*") {
    const selected = select.split(",");
    selected.forEach(key => expect(columns.has(key)).toBe(true));
    rows = rows.map(row => Object.fromEntries(selected.map(key => [key,row[key]])));
  }
  return rows;
}

async function call(handler, action, body = {}, method = "POST") {
  const req = { method, query: { action, ...(method === "GET" ? body : {}) }, headers: handler !== booking ? { authorization: "Bearer synthetic-admin-only" } : {}, body };
  const res = { statusCode: 0, setHeader() {}, end(text) { this.payload = JSON.parse(text); } };
  await handler(req,res);
  return res;
}
async function expandSchema() { for (const name of migrations) await db.exec(sql(name)); }
const oldPayload = { name: "Synthetic old admin", effective_from: "2027-03-01", effective_to: "2027-04-01", is_active: false, deposit_rate: 0.3, notes: null };
const stay = { check_in: "2026-12-31", check_out: "2027-01-02", adults: 19, children: 1, infants: 0, stay_type: "villa", dog10To20kgCount: 1 };

beforeAll(async () => {
  adminFactory = await legacyFactory("client/api/admin-bookings.js");
  bookingFactory = await legacyFactory("client/api/booking.js");
  currentAdminFactory = await legacyFactory("client/api/admin-bookings.js", null);
},30000);
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-20T04:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async url => {
    expect(url).toBe("https://synthetic.invalid/auth/v1/user");
    return new Response(JSON.stringify({ id: "synthetic-admin" }), { status: 200 });
  }));
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table booking_requests(id integer primary key);
    create function set_booking_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;`);
  await db.exec(sql("2026-08-20-booking-pricing").replace("create extension if not exists pgcrypto;", ""));
  writes = []; savedRequest = null;
  shared = {
    firstQueryValue: value => Array.isArray(value) ? value[0] : value,
    getServerEnv: name => name === "SUPABASE_URL" ? "https://synthetic.invalid" : "synthetic-only",
    readBody: async req => req.body,
    sendJson: (res,status,body) => { res.statusCode=status; res.end(JSON.stringify(body)); },
    supabaseRequest: request,
    supabaseRpc: vi.fn(async (name,args) => {
      if (name === "get_public_booking_unavailable_ranges") return [];
      expect(name).toBe("acquire_villa_booking_hold");
      savedRequest = structuredClone(args.p_request);
      await db.query("insert into booking_requests(id,pricing_breakdown,quoted_total) values(1,$1,$2)", [savedRequest.pricing_breakdown,savedRequest.quoted_total]);
      return { ok: true, request: { id: "synthetic-booking", booking_reference: "synthetic-only", status: "payment_hold" } };
    }),
  };
  admin = adminFactory(shared); booking = bookingFactory(shared); currentAdmin = currentAdminFactory(shared);
});
afterEach(async () => { await db?.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe(`legacy Production ${productionSha} across schema expansion`, () => {
  it("old Admin POST omits all new fields and DB supplies safe defaults", async () => {
    await expandSchema();
    const result = await call(admin,"pricing-rule-set",oldPayload);
    expect(result.statusCode).toBe(200);
    const payload = writes.find(w=>w.table==="booking_price_rule_sets").payload;
    fields.forEach(field=>expect(payload).not.toHaveProperty(field));
    const row=(await db.query("select * from booking_price_rule_sets where id=$1",[result.payload.ruleSet.id])).rows[0];
    expect(fields.map(field=>Number(row[field]))).toEqual([1250,0.8,0.9,0.9,0.9]);
  });
  it("old Admin PATCH preserves customized new fields",async()=>{
    await expandSchema();
    const id=(await db.query("select id from booking_price_rule_sets")).rows[0].id;
    await db.query("update booking_price_rule_sets set guest_11_18_fee=1500,weekday_discount_rate=0.75,friday_discount_rate=0.85,saturday_discount_rate=0.95,holiday_discount_rate=1 where id=$1",[id]);
    const result=await call(admin,"pricing-rule-set",{...oldPayload,id});
    expect(result.statusCode).toBe(200);
    fields.forEach(field=>expect(writes.at(-1).payload).not.toHaveProperty(field));
    const row=(await db.query("select * from booking_price_rule_sets where id=$1",[id])).rows[0];
    expect(fields.map(field=>Number(row[field]))).toEqual([1500,0.75,0.85,0.95,1]);
  });
  it("old Admin reads expanded pricing without losing base rows or dates",async()=>{
    const before=await call(admin,"pricing",{},"GET");
    await expandSchema();
    const after=await call(admin,"pricing",{},"GET");
    expect(after.statusCode).toBe(200);
    expect(after.payload.rates).toEqual(before.payload.rates);
    expect(after.payload.specialDates).toEqual(before.payload.specialDates);
    expect(after.payload.ruleSets[0].guest_11_18_fee).toBe(1250);
  });
  it("old booking page calendar endpoint still loads unchanged",async()=>{
    const before=await call(booking,"calendar",{from:"2026-11-01"},"GET");
    await expandSchema();
    const after=await call(booking,"calendar",{from:"2026-11-01"},"GET");
    expect(after.statusCode).toBe(200);
    const {requestId:ignoredBefore,...previous}=before.payload;
    const {requestId:ignoredAfter,...current}=after.payload;
    expect(current).toEqual(previous);
  });
  it("old quote ignores new discounts and 12/31 classification stays unchanged",async()=>{
    const before=await call(booking,"quote",stay,"GET");
    expect(before.statusCode).toBe(200);
    expect(before.payload.pricing.status).toBe("resolved");
    await expandSchema();
    const after=await call(booking,"quote",stay,"GET");
    expect(after.statusCode).toBe(200);
    expect(after.payload.pricing).toEqual(before.payload.pricing);
    expect(after.payload.pricing.breakdown[0].dayType).toBe("weekday");
    expect(after.payload.pricing.breakdown[0]).not.toHaveProperty("calendarDiscountRate");
    expect((await db.query("select * from booking_special_dates where date='2026-12-31'")).rows).toEqual([]);
  });
  it("old booking submit retains its quote and persists the original snapshot",async()=>{
    const before=await call(booking,"quote",stay,"GET");
    await expandSchema();
    const result=await call(booking,"request",{...stay,guest_name:"Synthetic Test",email:"test@example.com"});
    expect(result.statusCode).toBe(200);
    expect(shared.supabaseRpc).toHaveBeenCalledTimes(1);
    expect(savedRequest.pricing_breakdown).toEqual(before.payload.pricing);
    expect((await db.query("select pricing_breakdown,quoted_total from booking_requests where id=1")).rows[0]).toEqual({pricing_breakdown:before.payload.pricing,quoted_total:before.payload.pricing.total});
  });
  it("new Admin reads and customizes DB defaults through its actual handler",async()=>{
    await expandSchema();
    const created=await call(admin,"pricing-rule-set",oldPayload);
    const id=created.payload.ruleSet.id;
    const before=await call(currentAdmin,"pricing",{},"GET");
    expect(before.statusCode).toBe(200);
    expect(before.payload.ruleSets.find(row=>row.id===id).guest_11_18_fee).toBe(1250);
    const custom={guest_11_18_fee:1500,weekday_discount_rate:0.85,friday_discount_rate:0.88,saturday_discount_rate:0.95,holiday_discount_rate:1};
    expect((await call(currentAdmin,"pricing-rule-set",{...oldPayload,id,...custom})).statusCode).toBe(200);
    const row=(await db.query("select * from booking_price_rule_sets where id=$1",[id])).rows[0];
    expect(fields.map(field=>Number(row[field]))).toEqual(fields.map(field=>custom[field]));
  });
  it("only the new engine applies DB default discounts, using the same expanded DB",async()=>{
    const input={check_in:"2026-11-02",check_out:"2026-11-03",adults:15};
    const original=await call(booking,"quote",input,"GET");
    expect(original.payload.pricing.status).toBe("resolved");
    await expandSchema();
    const legacy=await call(booking,"quote",input,"GET");
    const current=await calculateBookingQuote(input,{supabaseRequest:request});
    expect(legacy.payload.pricing).toEqual(original.payload.pricing);
    expect(current.pricing.status).toBe("resolved");
    expect(current.pricing.total).toBe(Math.round(original.payload.pricing.total*0.8));
    expect(current.pricing.breakdown[0]).toMatchObject({guest11To18Fee:1250,calendarDiscountRate:0.8});
  });
});
