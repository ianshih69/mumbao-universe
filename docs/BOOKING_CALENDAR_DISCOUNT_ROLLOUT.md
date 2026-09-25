# Booking Calendar Discount Rollout

Gate A completed on 2026-09-25 for Production project `jgmgniftiwngvljdeytt`. Migrations 1 and 2 were applied and verified; Migration 3 was NOT executed. The existing app quote remained 31,250 + 29,688 = 60,938. Matrix/order fingerprints were unchanged, special dates and 2026-12-31 each had zero rows, and DB Health was Healthy. Gate B application release remains subject to Preview verification and approval gates below.

## Sources

- `booking_package_rates.guest_count=10`: default base by existing weekday/friday/holiday classification.
- `booking_price_rule_sets.guest_11_18_fee`: configurable guest increment. Existing rows must be derived from their validated matrices. Only AFTER that backfill, DB DEFAULT 1250 protects future inserts from the old Admin that omit this field; it never substitutes for invalid legacy data.
- `bookingGuestRules.extraAdultUnitPrice`: existing guest 19-20 fee (800).
- `booking_price_rule_sets.weekday_discount_rate`, `friday_discount_rate`, `saturday_discount_rate`, `holiday_discount_rate`: calendar multipliers, initialized by migration to 0.80/0.90/0.90/0.90. Admin can change them without code edits.
- `booking_special_dates.base_price_override` and `calendar_discount_rate_override`: nullable per-day overrides. NULL inherits. A non-null base must be a positive integer, at most 10000000; zero and negative bases are invalid. A zero calendar discount is invalid. Blank Admin inputs are normalized to NULL. Inactive rows are ignored.
- An active special-date row with `day_type=holiday` marks a special holiday. Ordinary Saturdays without that row use the Saturday discount. Selecting the holiday classification in the date editor intentionally takes priority over the normal weekday/Saturday discount.

## Calculation and Snapshots

1. Resolve daily base override, otherwise the date-type 10-person base.
2. Apply the existing guest increments, including all guests 11-18 before guests 19-20.
3. Calendar multiplier: daily override, special holiday, Friday, Saturday, Sunday-Thursday. Day-type-only AI quotes use their requested category, not the synthetic calculation date.
4. Round the lodging amount to whole TWD, then apply the existing night-2+ 95% lodging discount and rounding.
5. Child/pet fees retain their existing night-2+ discount rules. Calendar discounts do not apply to them or breakfast. Deposits and balances use the final total.

Existing `adultLodgingPreDiscountAmount`, `base10GuestRate`, guest fee fields and `preDiscountPrice` retain their pre-calendar meanings. Added nightly fields: `calendarDiscountRate`, `calendarDiscountSource`, `calendarDiscountAmount`, `priceAfterCalendarDiscount`. Existing `discountRate`/`discountAmount` describe only the subsequent consecutive-stay discount. `price` remains the final night total including children and pets.

The existing quote/submit engine writes these values into `pricing_breakdown` and `submitted_snapshot`. No migration recalculates orders. Historical injected rule objects without any calendar fields retain their no-calendar-discount behavior; actual database queries explicitly require the new columns. Partial or invalid configuration fails closed.

Admin percent inputs support 1-100 with two decimal places; 100 means no discount. Negative, zero, sub-1-percent and over-100-percent values are rejected by Admin and API validation. Storage uses multipliers 0.01-1 with four decimal places and DB CHECK constraints. Daily NULL/blank inherits the default; the four defaults are required, not nullable. Admin draft previews use authenticated `POST /api/admin-bookings?action=pricing-preview` and the same `calculateBookingQuote`, one independent 10-person night per day, without saving drafts or applying an artificial consecutive-night discount. No new Function entrypoint is added.

## Required Deployment Order

Do not deploy the new application before schema migrations 1 and 2 and schema verification succeed. Gate A has satisfied that schema prerequisite; do not rerun the successful migrations. The 12/31 data activation is a THIRD, separately authorized artifact, not part of schema expansion. It remains prohibited during Gate B.

1. Separately authorize and apply `client/supabase/migrations/2026-09-20-booking-guest-base-pricing.sql`.
2. Verify the guest fee and base override columns. The migration aborts if existing matrices are incomplete, nonlinear or inconsistent across date types; do not invent a replacement increment.
3. Apply `client/supabase/migrations/2026-09-20-booking-pricing-calendar-discounts.sql`.
4. Read-only verify guest fee DEFAULT 1250, all four NOT NULL calendar defaults (multipliers 0.80/0.90/0.90/0.90), CHECK 0.01-1, and a nullable daily override with NO default. Verify original matrix rows, special-date rows, RLS/ACL and order snapshots remain unchanged.
5. Separately authorize application deployment and smoke tests. Until then, the old app retains its old matrix and date classification. Its INSERT omitting the new fields uses DB defaults; PATCH omitting them preserves existing values. New discounts are only interpreted by the new engine.
6. Separately approve `client/supabase/migrations/2026-09-20-booking-seed-2026-new-years-eve.sql` AFTER the new app rollout. It may change prices on both old and new apps and MUST NOT be included in a blind migration push with steps 1-3. Re-run the read-only date preflight immediately before this activation. Active holiday rows are reused unchanged; any non-holiday, inactive row, duplicate per-rule date or overlapping applicable active rule sets STOP the seed. No automatic repair is permitted.
7. Verify 2026-12-31 has one active holiday for the applicable active period. If no active period covers the date, the seed inserts zero rows; that is not a successful date activation. Establish the period separately before a separately approved seed. No hardcoded runtime date exception is introduced.

After a new deployment, verify weekday/Friday/Saturday/holiday, daily overrides, 19-20 guests, multi-night order, Admin draft vs actual quote equivalence and submitted snapshot. Retain prior deployment and order snapshots; do not repeat successful migrations blindly.

## Read-only Production Date Preflight (Reusable for a Separately Approved Seed)

```sql
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
select s.id, s.rule_set_id, s.date, s.day_type, s.label, s.is_active,
       r.name as rule_set_name, r.is_active as rule_set_active,
       r.effective_from, r.effective_to
from public.booking_special_dates s
join public.booking_price_rule_sets r on r.id = s.rule_set_id
where s.date = date '2026-12-31'
order by s.rule_set_id, s.is_active desc, s.id;
commit;
```

No rows: the separately approved THIRD migration may seed applicable active periods. Existing active holiday: preserve its row and values. Any non-holiday/inactive/ambiguous row: STOP and report it to the owner. Schema migrations do not seed, rewrite or reactivate any special dates; the independent seed enforces these collision gates inside its transaction.

All three files use explicit BEGIN/COMMIT with 10s statement and 2s lock timeouts. Execute each approved file with ON_ERROR_STOP=1. Each file is atomic, not one transaction across all files: a previously committed migration stays committed if a later file fails. Guest matrix/backfill failure rolls back guest columns and prior backfill; calendar DDL/constraint failure rolls back all columns/defaults in that file; seed conflict/insertion failure rolls back that file. The seed takes short write-conflicting locks on the two pricing tables before checking/inserting, preventing concurrent Admin writes from bypassing the checks. Stop on failure; do not blindly rerun a successful prefix.

The first migration derives a valid increment for EVERY existing rule set, including inactive sets; incomplete/nonlinear matrices abort before setting the future-insert default. The second requires the integer NOT NULL guest fee and integer base override schema, validates existing fees, and initializes all four NOT NULL discount defaults for every row. Gate A verified the actual fee 1250, all four defaults 0.80/0.90/0.90/0.90, the constraints and unchanged Production matrix. Recheck current 12/31 state before any future separately authorized seed. No change to existing order snapshots is permitted.

## Local Compatibility Evidence

`legacyAppCompatibility.test.js` compiles Admin and Booking handlers and their pricing dependencies directly from immutable Production SHA `4939d3afaffbf0d55f30fe90144d3bd7031c5272`, in memory. An isolated PGlite database executes the actual SQL migrations; auth, transport and unrelated booking-hold side effects use synthetic local boundaries. Tests cover old POST defaults, old PATCH preserving custom values, Admin reads, booking-page calendar API, unchanged old quote behavior including 12/31, and persisted booking pricing snapshots. They also exercise current Admin reads/writes and current-engine consumption of DB defaults. This is local integration evidence, not Production smoke or real concurrent-session certification.

Do not edit pricing with the old matrix editor during the deployment window: those old edits cannot synchronize the newly derived guest fee automatically. This rollout guard avoids treating the compatibility DEFAULT as a second live pricing source. No automatic matrix synchronization or new pricing architecture is introduced.
