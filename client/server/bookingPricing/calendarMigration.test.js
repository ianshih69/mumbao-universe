import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
const sql = name => readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const migration = sql("2026-09-20-booking-pricing-calendar-discounts");
async function database(withGuest = true) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table booking_requests(id integer primary key);
    create function set_booking_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;`);
  await db.exec(sql("2026-08-20-booking-pricing").replace("create extension if not exists pgcrypto;", ""));
  if (withGuest) await db.exec(sql("2026-09-20-booking-guest-base-pricing"));
  await db.exec(`insert into booking_requests(id,pricing_breakdown) values(1,'{"total":25000}');`);
  return db;
}
describe("calendar migration on isolated PostgreSQL",()=>{
  it("adds configurable defaults without changing special dates, rates, orders or ACL",async()=>{
    const db=await database();
    try {
      const rates=(await db.query("select * from booking_package_rates order by id")).rows;
      const security=(await db.query("select relname,relrowsecurity,relacl from pg_class where relname in ('booking_price_rule_sets','booking_special_dates') order by relname")).rows;
      await db.exec(migration);
      const rule=(await db.query("select * from booking_price_rule_sets")).rows[0];
      expect(Number(rule.guest_11_18_fee)).toBe(1250);
      expect([rule.weekday_discount_rate,rule.friday_discount_rate,rule.saturday_discount_rate,rule.holiday_discount_rate].map(Number)).toEqual([0.8,0.9,0.9,0.9]);
      expect((await db.query("select day_type,is_active from booking_special_dates where date='2026-12-31'")).rows).toEqual([]);
      expect((await db.query("select * from booking_package_rates order by id")).rows).toEqual(rates);
      expect((await db.query("select pricing_breakdown from booking_requests")).rows).toEqual([{pricing_breakdown:{total:25000}}]);
      expect((await db.query("select relname,relrowsecurity,relacl from pg_class where relname in ('booking_price_rule_sets','booking_special_dates') order by relname")).rows).toEqual(security);
      for(const field of ["weekday_discount_rate","friday_discount_rate","saturday_discount_rate","holiday_discount_rate"]) {
        for(const value of ["null","0","0.0099","-0.1","1.1"]) await expect(db.exec(`update booking_price_rule_sets set ${field}=${value}`)).rejects.toThrow();
        for(const value of ["0.01","0.8","0.9","1"]) await db.exec(`update booking_price_rule_sets set ${field}=${value}`);
      }
      await db.exec("insert into booking_special_dates(rule_set_id,date,day_type) select id,'2026-11-02','weekday' from booking_price_rule_sets");
      for(const value of ["0","0.0099","-0.1","1.1"]) await expect(db.exec(`update booking_special_dates set calendar_discount_rate_override=${value}`)).rejects.toThrow();
      for(const value of ["null","0.01","0.8","0.9","1"]) await db.exec(`update booking_special_dates set calendar_discount_rate_override=${value}`);
      await db.exec("update booking_price_rule_sets set weekday_discount_rate=0.85; update booking_special_dates set calendar_discount_rate_override=null;");
      expect(Number((await db.query("select weekday_discount_rate from booking_price_rule_sets")).rows[0].weekday_discount_rate)).toBe(0.85);
    } finally {await db.close();}
  },20000);
  it("requires the guest-base migration first",async()=>{
    const db=await database(false);
    try {await expect(db.exec(migration)).rejects.toThrow(/guest-base-pricing/);await db.exec("rollback");}
    finally{await db.close();}
  },20000);
  it("preserves an existing holiday row instead of duplicating it",async()=>{
    const db=await database();
    try {
      await db.exec("insert into booking_special_dates(rule_set_id,date,day_type,label,base_price_override) select id,'2026-12-31','holiday','Owner label',45000 from booking_price_rule_sets");
      await db.exec(migration);
      expect((await db.query("select label,base_price_override from booking_special_dates where date='2026-12-31'")).rows).toEqual([{label:"Owner label",base_price_override:45000}]);
    } finally{await db.close();}
  },20000);
  it.each([true,false])("preserves owner classification without activating a holiday (active=%s)",async active=>{
    const db=await database();
    try {
      await db.exec(`insert into booking_special_dates(rule_set_id,date,day_type,is_active) select id,'2026-12-31','weekday',${active} from booking_price_rule_sets`);
      const before=(await db.query("select * from booking_special_dates order by id")).rows;
      await db.exec(migration);
      const after=(await db.query("select * from booking_special_dates order by id")).rows;
      expect(after.map(({calendar_discount_rate_override,...original})=>original)).toEqual(before);
      expect(after.every(row=>row.calendar_discount_rate_override===null)).toBe(true);
      expect((await db.query("select pricing_breakdown from booking_requests")).rows).toEqual([{pricing_breakdown:{total:25000}}]);
      expect((await db.query("select guest_11_18_fee from booking_price_rule_sets")).rows).toEqual([{guest_11_18_fee:1250}]);
    } finally{await db.close();}
  },20000);
  it("does not reactivate or duplicate an inactive holiday during schema expansion",async()=>{
    const db=await database();
    try {
      await db.exec("insert into booking_special_dates(rule_set_id,date,day_type,is_active) select id,'2026-12-31','holiday',false from booking_price_rule_sets");
      await db.exec(migration);
      expect((await db.query("select is_active from booking_special_dates")).rows).toEqual([{is_active:false}]);
    } finally{await db.close();}
  },20000);
  it("rolls back every new default column on a later DDL failure",async()=>{
    const db=await database();
    try {
      await db.exec("alter table booking_special_dates add column calendar_discount_rate_override numeric(5,4)");
      const before=(await db.query("select * from booking_price_rule_sets order by id")).rows;
      await expect(db.exec(migration)).rejects.toThrow(/already exists/);
      await db.exec("rollback");
      expect((await db.query("select column_name from information_schema.columns where table_name='booking_price_rule_sets' and column_name like '%discount_rate'")).rows).toEqual([]);
      expect((await db.query("select * from booking_price_rule_sets order by id")).rows).toEqual(before);
    } finally{await db.close();}
  },20000);
  it.each(["alter table booking_special_dates drop column base_price_override", "alter table booking_price_rule_sets alter column guest_11_18_fee drop not null"])("rejects an incomplete guest-base schema: %s",async change=>{
    const db=await database();
    try {
      await db.exec(change);
      await expect(db.exec(migration)).rejects.toThrow(/guest-base-pricing/);
      await db.exec("rollback");
      expect((await db.query("select column_name from information_schema.columns where table_name='booking_price_rule_sets' and column_name='weekday_discount_rate'")).rows).toEqual([]);
    } finally{await db.close();}
  },20000);
  it("initializes all existing rule sets including inactive ones, never leaving NULL configuration",async()=>{
    const db=await database(false);
    try {
      await db.exec(`insert into booking_price_rule_sets(id,name,effective_from,effective_to,is_active)
        values('00000000-0000-4000-8000-000000000222','Synthetic inactive','2025-11-01','2026-02-01',false);
        insert into booking_package_rates(rule_set_id,guest_count,day_type,nightly_price)
        select '00000000-0000-4000-8000-000000000222',guest_count,day_type,nightly_price+(guest_count-10)*250
        from booking_package_rates where rule_set_id <> '00000000-0000-4000-8000-000000000222';`);
      await db.exec(sql("2026-09-20-booking-guest-base-pricing"));
      await db.exec(migration);
      const rows=(await db.query("select guest_11_18_fee,weekday_discount_rate,friday_discount_rate,saturday_discount_rate,holiday_discount_rate from booking_price_rule_sets order by guest_11_18_fee")).rows;
      expect(rows.map(row=>row.guest_11_18_fee)).toEqual([1250,1500]);
      for(const row of rows) expect(Object.values(row).map(Number)).toEqual([row.guest_11_18_fee,0.8,0.9,0.9,0.9]);
      expect((await db.query("select column_name from information_schema.columns where table_name='booking_price_rule_sets' and column_name in ('guest_11_18_fee','weekday_discount_rate','friday_discount_rate','saturday_discount_rate','holiday_discount_rate') and is_nullable='NO'")).rows).toHaveLength(5);
    } finally{await db.close();}
  },20000);
});
