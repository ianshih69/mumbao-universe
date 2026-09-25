import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const original = readFileSync(new URL("../../supabase/migrations/2026-08-20-booking-pricing.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/2026-09-20-booking-guest-base-pricing.sql", import.meta.url), "utf8");
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.booking_requests(id integer primary key);
    create function public.set_booking_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;`);
  // PGlite has gen_random_uuid built in but does not ship pgcrypto.
  await db.exec(original.replace("create extension if not exists pgcrypto;", ""));
  await db.exec(`insert into public.booking_requests(id,pricing_breakdown) values (1,'{"total":25000}');`);
  return db;
}
describe("guest fee migration (isolated PostgreSQL)", () => {
  it("allows inherited or positive daily Base but rejects zero and negatives in PostgreSQL",async()=>{
    const db=await database();
    try {
      await db.exec(migration);
      await db.exec("insert into booking_special_dates(rule_set_id,date,day_type) select id,'2026-11-02','weekday' from booking_price_rule_sets");
      expect((await db.query("select base_price_override from booking_special_dates")).rows).toEqual([{base_price_override:null}]);
      for(const value of [0,-1,10000001]) await expect(db.exec(`update booking_special_dates set base_price_override=${value}`)).rejects.toThrow(/check constraint/);
      await db.exec("update booking_special_dates set base_price_override=1");
      expect((await db.query("select base_price_override from booking_special_dates")).rows).toEqual([{base_price_override:1}]);
      await db.exec("update booking_special_dates set base_price_override=null");
      expect((await db.query("select base_price_override from booking_special_dates")).rows).toEqual([{base_price_override:null}]);
    } finally {await db.close();}
  },20000);
  it("derives fees without rewriting rates, snapshots or ACL", async () => {
    const db = await database();
    try {
      const before = await db.query("select * from booking_package_rates order by id");
      await db.exec(migration);
      expect((await db.query("select guest_11_18_fee from booking_price_rule_sets")).rows).toEqual([{guest_11_18_fee:1250}]);
      expect((await db.query("select * from booking_package_rates order by id")).rows).toEqual(before.rows);
      expect((await db.query("select pricing_breakdown from booking_requests")).rows).toEqual([{pricing_breakdown:{total:25000}}]);
      expect((await db.query("select relrowsecurity from pg_class where oid='public.booking_price_rule_sets'::regclass")).rows[0].relrowsecurity).toBe(true);
      expect((await db.query("select has_table_privilege('anon','public.booking_price_rule_sets','SELECT') as allowed")).rows[0].allowed).toBe(false);
      await expect(db.exec("update booking_price_rule_sets set guest_11_18_fee=-1")).rejects.toThrow();
      await expect(db.exec("update booking_price_rule_sets set guest_11_18_fee=null")).rejects.toThrow();
      await db.exec("update booking_price_rule_sets set guest_11_18_fee=1500");
      expect((await db.query("select guest_11_18_fee from booking_price_rule_sets")).rows[0].guest_11_18_fee).toBe(1500);
    } finally { await db.close(); }
  },20000);
  it.each(["delete from booking_package_rates where guest_count=11 and day_type='friday'", "update booking_package_rates set nightly_price=nightly_price+1 where guest_count=11", "update booking_package_rates set nightly_price=nightly_price+(guest_count-10)*50 where day_type='friday'"])("fails closed for incompatible matrix: %s", async sql => {
    const db=await database();
    try {
      await db.exec(sql);
      await expect(db.exec(migration)).rejects.toThrow(/Guest pricing migration requires/);
      await db.exec("rollback");
      expect((await db.query("select column_name from information_schema.columns where table_name='booking_price_rule_sets' and column_name='guest_11_18_fee'")).rows).toEqual([]);
    } finally { await db.close(); }
  },20000);
  it("rolls back columns and backfill when the final fee constraint fails", async () => {
    const db = await database();
    try {
      await db.exec("update booking_package_rates set nightly_price=25000+(guest_count-10)*10000001");
      const before = (await db.query("select * from booking_price_rule_sets order by id")).rows;
      await expect(db.exec(migration)).rejects.toThrow(/check constraint/);
      await db.exec("rollback");
      expect((await db.query("select column_name from information_schema.columns where table_schema='public' and column_name in ('guest_11_18_fee','base_price_override')")).rows).toEqual([]);
      expect((await db.query("select * from booking_price_rule_sets order by id")).rows).toEqual(before);
    } finally { await db.close(); }
  }, 20000);
  it.each([true,false])("leaves existing 12/31 data unchanged during schema expansion (active=%s)",async active=>{
    const db=await database();
    try {
      await db.exec(`insert into booking_special_dates(rule_set_id,date,day_type,is_active) select id,'2026-12-31','weekday',${active} from booking_price_rule_sets`);
      const before=(await db.query("select * from booking_special_dates order by id")).rows;
      await db.exec(migration);
      expect((await db.query("select column_name from information_schema.columns where table_schema='public' and column_name in ('guest_11_18_fee','base_price_override')")).rows).toHaveLength(2);
      const after=(await db.query("select * from booking_special_dates order by id")).rows;
      expect(after.map(({base_price_override,...original})=>original)).toEqual(before);
      expect(after.every(row=>row.base_price_override===null)).toBe(true);
    } finally{await db.close();}
  },20000);
});
