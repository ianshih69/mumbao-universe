import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const sql = name => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = sql("2026-09-20-booking-seed-2026-new-years-eve");
async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table booking_requests(id integer primary key);
    create function set_booking_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;`);
  await db.exec(sql("2026-08-20-booking-pricing").replace("create extension if not exists pgcrypto;", ""));
  await db.exec(sql("2026-09-20-booking-guest-base-pricing"));
  await db.exec(sql("2026-09-20-booking-pricing-calendar-discounts"));
  return db;
}
describe("independently authorized 12/31 data activation (isolated PostgreSQL)",()=>{
  it("seeds once, preserving unrelated prices, defaults and security",async()=>{
    const db=await database();
    try {
      const rules=(await db.query("select * from booking_price_rule_sets order by id")).rows;
      const rates=(await db.query("select * from booking_package_rates order by id")).rows;
      const acl=(await db.query("select relacl,relrowsecurity from pg_class where oid='public.booking_special_dates'::regclass")).rows;
      expect((await db.query("select * from booking_special_dates")).rows).toEqual([]);
      await db.exec(migration);
      const after=(await db.query("select * from booking_special_dates")).rows;
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({day_type:"holiday",is_active:true,base_price_override:null,calendar_discount_rate_override:null});
      await db.exec(migration);
      expect((await db.query("select * from booking_special_dates")).rows).toEqual(after);
      expect((await db.query("select * from booking_price_rule_sets order by id")).rows).toEqual(rules);
      expect((await db.query("select * from booking_package_rates order by id")).rows).toEqual(rates);
      expect((await db.query("select relacl,relrowsecurity from pg_class where oid='public.booking_special_dates'::regclass")).rows).toEqual(acl);
    } finally{await db.close();}
  },20000);
  it("reuses an active owner holiday without changing its label or overrides",async()=>{
    const db=await database();
    try {
      await db.exec("insert into booking_special_dates(rule_set_id,date,day_type,label,base_price_override,calendar_discount_rate_override) select id,'2026-12-31','holiday','Owner holiday',42000,0.85 from booking_price_rule_sets");
      const before=(await db.query("select * from booking_special_dates")).rows;
      await db.exec(migration);
      expect((await db.query("select * from booking_special_dates")).rows).toEqual(before);
    } finally{await db.close();}
  },20000);
  it.each([["holiday",false,"inactive"],["weekday",true,"non-holiday"],["weekday",false,"non-holiday"],["friday",true,"non-holiday"]])("stops for %s active=%s without touching rows",async(dayType,active,error)=>{
    const db=await database();
    try {
      await db.query("insert into booking_special_dates(rule_set_id,date,day_type,is_active) select id,'2026-12-31',$1,$2 from booking_price_rule_sets",[dayType,active]);
      const before=(await db.query("select * from booking_special_dates")).rows;
      await expect(db.exec(migration)).rejects.toThrow(error);
      await db.exec("rollback");
      expect((await db.query("select * from booking_special_dates")).rows).toEqual(before);
    } finally{await db.close();}
  },20000);
  it("fails closed on duplicate rows even if an old database lacks its unique index",async()=>{
    const db=await database();
    try {
      await db.exec("drop index booking_special_dates_active_unique_idx; insert into booking_special_dates(rule_set_id,date,day_type) select id,'2026-12-31','holiday' from booking_price_rule_sets cross join generate_series(1,2)");
      const before=(await db.query("select * from booking_special_dates order by id")).rows;
      await expect(db.exec(migration)).rejects.toThrow(/duplicate/);
      await db.exec("rollback");
      expect((await db.query("select * from booking_special_dates order by id")).rows).toEqual(before);
    } finally{await db.close();}
  },20000);
  it("stops on overlapping active periods rather than creating ambiguous holidays",async()=>{
    const db=await database();
    try {
      await db.exec("insert into booking_price_rule_sets(name,effective_from,effective_to) values('Synthetic overlap','2026-12-01','2027-01-10')");
      await expect(db.exec(migration)).rejects.toThrow(/overlapping/);
      await db.exec("rollback");
      expect((await db.query("select * from booking_special_dates")).rows).toEqual([]);
    } finally{await db.close();}
  },20000);
  it("rolls back on an insertion failure and leaves no partial seed",async()=>{
    const db=await database();
    try {
      await db.exec(`create function test_reject_seed() returns trigger language plpgsql as $$begin raise exception 'synthetic seed failure'; end;$$;
        create trigger test_reject_seed after insert on booking_special_dates for each row execute function test_reject_seed();`);
      await expect(db.exec(migration)).rejects.toThrow(/synthetic seed failure/);
      await db.exec("rollback");
      expect((await db.query("select * from booking_special_dates")).rows).toEqual([]);
      expect((await db.query("select guest_11_18_fee from booking_price_rule_sets")).rows).toEqual([{guest_11_18_fee:1250}]);
    } finally{await db.close();}
  },20000);
});
