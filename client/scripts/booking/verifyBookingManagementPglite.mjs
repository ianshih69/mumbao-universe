import { createHash, randomBytes } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execChild = promisify(execFileCallback);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    parsed[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const usesPglite = Boolean(args.pglite);
if (usesPglite) {
  assert(process.env.BOOKING_MANAGEMENT_SMOKE_CONFIRM === "isolated-pglite", "Missing isolated PGlite confirmation guard.");
} else {
  assert(process.env.BOOKING_MANAGEMENT_SMOKE_CONFIRM === "isolated-postgresql17", "Missing isolated PostgreSQL confirmation guard.");
  assert(args.psql, "--psql must point to psql.");
  assert(args.connection, "--connection must point to the isolated PostgreSQL database.");
  const connectionUrl = new URL(args.connection);
  assert(["127.0.0.1", "localhost"].includes(connectionUrl.hostname), "PostgreSQL verification must use localhost.");
  assert(connectionUrl.pathname.replace(/^\//, "") === "booking_management_test", "Unexpected PostgreSQL database name.");
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bindSql(sql, params) {
  return sql.replace(/\$(\d+)/g, (_match, index) => sqlLiteral(params[Number(index) - 1]));
}

function parsePsqlValue(value) {
  if (value === "[NULL]") return null;
  if (value === "t") return true;
  if (value === "f") return false;
  if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

class PsqlDatabase {
  constructor(psqlPath, connection) {
    this.psqlPath = psqlPath;
    this.connection = connection;
    this.waitReady = Promise.resolve();
  }

  async run(extraArgs, input = null) {
    const commandArgs = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", this.connection, ...extraArgs];
    const cwd = fileURLToPath(new URL("./", import.meta.url));
    if (input === null) {
      const { stdout } = await execChild(this.psqlPath, commandArgs, {
        cwd,
        maxBuffer: 20 * 1024 * 1024,
      });
      return stdout.trim();
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.psqlPath, commandArgs, { cwd, windowsHide: true });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(`psql exited ${code}: ${stderr.trim()}`));
      });
      child.stdin.end(input);
    });
  }

  async exec(sql) {
    await this.run([], sql);
  }

  async query(sql, params = []) {
    const output = await this.run([
      "-A",
      "-F",
      "\t",
      "-P",
      "footer=off",
      "-P",
      "null=[NULL]",
    ], bindSql(sql, params));
    if (!output) return { rows: [] };
    const [header, ...lines] = output.split(/\r?\n/);
    const columns = header.split("\t");
    return {
      rows: lines.map((line) => Object.fromEntries(
        line.split("\t").map((value, index) => [columns[index], parsePsqlValue(value)]),
      )),
    };
  }

  async close() {}
}

let db;
if (usesPglite) {
  const { PGlite } = await import(pathToFileURL(args.pglite).href);
  db = new PGlite();
} else {
  db = new PsqlDatabase(String(args.psql), String(args.connection));
}
await db.waitReady;

const scriptBase = new URL("./", import.meta.url);
const schemaPath = new URL("./bookingPaymentTestSchema.sql", scriptBase);
const migrationPaths = [
  new URL("../../supabase/migrations/2026-08-30-booking-payment-hold.sql", scriptBase),
  new URL("../../supabase/migrations/2026-09-01-booking-bank-transfer-payment-review.sql", scriptBase),
  new URL("../../supabase/migrations/2026-09-02-booking-payment-admin-audit.sql", scriptBase),
  new URL("../../supabase/migrations/2026-09-03-booking-management-cancellation.sql", scriptBase),
];
const rollbackPath = new URL(
  "../../supabase/rollbacks/2026-09-03-booking-management-cancellation.rollback.sql",
  scriptBase,
);

async function execFile(fileUrl, transform = (sql) => sql) {
  await db.exec(transform(await readFile(fileUrl, "utf8")));
}

async function query(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

async function scalar(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

async function result(sql, params = []) {
  return scalar(sql, params);
}

async function attempt(sql, params = []) {
  try {
    return { ok: true, value: await result(sql, params), error: "" };
  } catch (error) {
    return { ok: false, value: null, error: String(error) };
  }
}

function pgliteSchema(sql) {
  return sql
    .replace(
      "create extension if not exists pgcrypto with schema extensions;",
      `create or replace function extensions.gen_random_bytes(p_length integer)
       returns bytea
       language sql
       volatile
       as $function$
         select decode(
           string_agg(substr(md5(random()::text || clock_timestamp()::text || value::text), 1, 2), ''),
           'hex'
         )
         from generate_series(1, p_length) as value;
       $function$;`,
    )
    .replace("alter database booking_payment_test", "alter database postgres");
}

function postgresSchema(sql) {
  return sql.replace("alter database booking_payment_test", "alter database booking_management_test");
}

function buildHoldPayload(label, checkIn, checkOut) {
  const recoveryToken = randomBytes(32).toString("base64url");
  return {
    recoveryToken,
    request: {
      recovery_token_hash: sha256(recoveryToken),
      submitted_snapshot: {
        pricing: {
          quotedTotal: 40000,
          depositRate: 0.3,
          depositAmount: 12000,
          balanceAmount: 28000,
          pricingBreakdown: { status: "resolved", total: 40000 },
        },
        summary: { adultCount: 8, childCount: 2, infantCount: 1, breakfastAddonEntries: [] },
      },
      guest_name: `Management ${label}`,
      guest_email: `${label}@example.invalid`,
      guest_phone: "0912345678",
      check_in: checkIn,
      check_out: checkOut,
      guest_count: 10,
      stay_type: "villa",
      adults: 8,
      children: 2,
      room_count: 5,
      has_pets: false,
      pet_count: 0,
      source: "official_site",
      raw_payload: { infants: 1, breakfast_addons: [] },
      selected_package_type: "villa_10",
      quoted_total: 40000,
      deposit_rate: 0.3,
      deposit_amount: 12000,
      balance_amount: 28000,
      pricing_breakdown: { status: "resolved", total: 40000 },
      quoted_at: new Date().toISOString(),
    },
  };
}

async function acquire(payload) {
  return result("select public.acquire_villa_booking_hold($1::jsonb) as result", [JSON.stringify(payload.request)]);
}

async function reportPayment(payload) {
  return result(
    "select public.report_booking_bank_transfer($1, '12345', 'DB Tester', 'isolated test', 120) as result",
    [sha256(payload.recoveryToken)],
  );
}

async function createSession(bookingId, label) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const created = await result(
    "select public.create_booking_management_session($1::uuid, $2, $3, $4) as result",
    [bookingId, tokenHash, sha256(`ip:${label}`), `Isolated DB ${label}`],
  );
  assert(created?.ok, `${label}: management session creation failed`);
  assert(rawToken.length === 43 && /^[A-Za-z0-9_-]+$/.test(rawToken), `${label}: management token is not 32-byte base64url`);
  const stored = (await query(
    `select token_hash,
            extract(epoch from (expires_at - created_at))::integer as lifetime_seconds
       from public.booking_management_sessions
      where token_hash = $1`,
    [tokenHash],
  ))[0];
  assert(stored?.token_hash === tokenHash && stored.token_hash !== rawToken, `${label}: database did not store only the token hash`);
  assert(Number(stored.lifetime_seconds) === 1800, `${label}: management session lifetime is not fixed at 30 minutes`);
  return tokenHash;
}

async function unavailableCount(checkIn, checkOut) {
  return Number(await scalar(
    "select count(*)::integer from public.get_public_booking_unavailable_ranges($1::date, $2::date)",
    [checkIn, checkOut],
  ));
}

async function cancellationAuditCount(bookingId, action = null) {
  return Number(await scalar(
    `select count(*)::integer
       from public.booking_cancellation_audit_logs
      where booking_request_id = $1::uuid
        and ($2::text is null or action = $2::text)`,
    [bookingId, action],
  ));
}

async function makeConfirmed(adminId, label, checkIn, checkOut) {
  const payload = buildHoldPayload(label, checkIn, checkOut);
  const hold = await acquire(payload);
  assert(hold?.ok, `${label}: hold setup failed`);
  const payment = await reportPayment(payload);
  assert(payment?.ok && payment.request.status === "payment_review", `${label}: payment report failed`);
  const confirmed = await result(
    "select public.review_booking_bank_transfer($1::uuid, $2::uuid, 'confirmed') as result",
    [hold.request.id, adminId],
  );
  assert(confirmed?.ok && confirmed.request.status === "confirmed", `${label}: payment confirmation failed`);
  return { payload, hold, payment, confirmed };
}

const report = Object.fromEntries([
  ["version", ""],
  ["migration", false],
  ["preservation", false],
  ["sessionContract", false],
  ["rateLimitPrivacy", false],
  ["failureAtomicity", false],
  ["security", false],
  ..."ABCDEFGHIJKLMNOPQRS".split("").map((key) => [key, false]),
  ["rollback", false],
  ["rollbackRerun", false],
]);

try {
  report.version = String(await scalar("select version()"));
  assert(report.version.includes("PostgreSQL 17."), `Expected PostgreSQL 17, received ${report.version}`);

  await execFile(schemaPath, usesPglite ? pgliteSchema : postgresSchema);
  for (const migrationPath of migrationPaths.slice(0, -1)) await execFile(migrationPath);
  await db.exec(`
    insert into public.booking_requests (
      guest_name, guest_email, guest_phone, check_in, check_out, guest_count, adults, children, status
    ) values (
      'Legacy Lookup', 'legacy@example.invalid', '0900111222', '2028-01-01', '2028-01-03', 10, 10, 0, 'pending_review'
    );
  `);
  const historicalCancelledId = await scalar(`
    insert into public.booking_requests (
      guest_name, guest_email, guest_phone, check_in, check_out, guest_count, adults, children, status
    ) values (
      'Historical Cancelled', 'historical@example.invalid', '0900333444', '2028-01-05', '2028-01-07', 10, 10, 0, 'cancelled'
    ) returning id
  `);
  const adminId = await scalar(`
    insert into public.admin_profiles (auth_user_id, display_name, email, is_active)
    values (gen_random_uuid(), 'Cancellation Admin', 'cancel-admin@example.invalid', true)
    returning id
  `);
  const preMigrationConfirmed = await makeConfirmed(adminId, "pre-management", "2028-01-20", "2028-01-22");
  const preservationBefore = await result(`
    select jsonb_build_object(
      'legacy_id', (select id from public.booking_requests where guest_name = 'Legacy Lookup'),
      'legacy_reference', (select booking_reference from public.booking_requests where guest_name = 'Legacy Lookup'),
      'historical_cancelled_id', $1::uuid,
      'historical_cancelled_reference', (select booking_reference from public.booking_requests where id = $1::uuid),
      'confirmed_id', $2::uuid,
      'confirmed_reference', (select booking_reference from public.booking_requests where id = $2::uuid),
      'payment_rows', (select count(*) from public.booking_payment_records),
      'payment_audit_rows', (select count(*) from public.booking_payment_admin_audit_logs)
    )
  `, [historicalCancelledId, preMigrationConfirmed.hold.request.id]);

  await execFile(migrationPaths.at(-1));
  await execFile(migrationPaths.at(-1));
  report.migration = true;

  const preservationAfter = await result(`
    select jsonb_build_object(
      'legacy_id', (select id from public.booking_requests where guest_name = 'Legacy Lookup'),
      'legacy_reference', (select booking_reference from public.booking_requests where guest_name = 'Legacy Lookup'),
      'historical_cancelled_id', $1::uuid,
      'historical_cancelled_reference', (select booking_reference from public.booking_requests where id = $1::uuid),
      'confirmed_id', $2::uuid,
      'confirmed_reference', (select booking_reference from public.booking_requests where id = $2::uuid),
      'payment_rows', (select count(*) from public.booking_payment_records),
      'payment_audit_rows', (select count(*) from public.booking_payment_admin_audit_logs)
    )
  `, [historicalCancelledId, preMigrationConfirmed.hold.request.id]);
  assert(JSON.stringify(preservationAfter) === JSON.stringify(preservationBefore), "Management migration changed durable Phase 2A.1 data");
  assert(await cancellationAuditCount(historicalCancelledId) === 0, "Management migration fabricated historical cancellation audit");
  report.preservation = true;

  const legacy = (await query("select * from public.booking_requests where guest_name = 'Legacy Lookup'"))[0];
  assert(/^\d{10}$/.test(legacy.booking_reference), "Legacy booking reference was not backfilled");

  const lookupByEmail = await query(
    `select id from public.booking_requests
      where booking_reference = $1
        and lower(trim(guest_email)) = lower(trim($2::text))`,
    [legacy.booking_reference, " LEGACY@EXAMPLE.INVALID "],
  );
  assert(lookupByEmail.length === 1, "A: valid reference + email lookup failed");
  report.A = true;

  const lookupByPhone = await query(
    `select id from public.booking_requests
      where booking_reference = $1
        and regexp_replace(guest_phone, '[^0-9+]', '', 'g') = regexp_replace($2::text, '[^0-9+]', '', 'g')`,
    [legacy.booking_reference, "0900-111-222"],
  );
  assert(lookupByPhone.length === 1, "B: valid reference + phone lookup failed");
  report.B = true;

  assert((await query(
    "select id from public.booking_requests where booking_reference = $1 and lower(guest_email) = lower($2::text)",
    [legacy.booking_reference, "wrong@example.invalid"],
  )).length === 0, "C: wrong contact matched");
  report.C = true;

  assert((await query(
    "select id from public.booking_requests where booking_reference = '0000000000' and lower(guest_email) = lower($1::text)",
    [legacy.guest_email],
  )).length === 0, "D: wrong reference matched");
  report.D = true;

  const rateKey = sha256("lookup-ip:127.0.0.1");
  const referenceRateKey = sha256("lookup-reference:1234567890");
  const firstRate = await result("select public.consume_booking_lookup_rate_limit($1, 2, 60) as result", [rateKey]);
  const secondRate = await result("select public.consume_booking_lookup_rate_limit($1, 2, 60) as result", [rateKey]);
  const blockedRate = await result("select public.consume_booking_lookup_rate_limit($1, 2, 60) as result", [rateKey]);
  const referenceFirstRate = await result("select public.consume_booking_lookup_rate_limit($1, 1, 60) as result", [referenceRateKey]);
  const referenceBlockedRate = await result("select public.consume_booking_lookup_rate_limit($1, 1, 60) as result", [referenceRateKey]);
  assert(
    firstRate.allowed && secondRate.allowed && !blockedRate.allowed && referenceFirstRate.allowed && !referenceBlockedRate.allowed,
    "E: lookup rate limit failed",
  );
  const unsafeRateLimitColumns = Number(await scalar(`
    select count(*)::integer
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'booking_lookup_rate_limits'
       and column_name ~ '(email|phone|reference|ip_address|raw)'
  `));
  assert(unsafeRateLimitColumns === 0, "E: rate-limit table exposes plaintext lookup data columns");
  assert(Number(await scalar(
    "select count(*)::integer from public.booking_lookup_rate_limits where key_hash !~ '^[0-9a-f]{64}$'",
  )) === 0, "E: rate-limit table stored a non-hash key");
  report.rateLimitPrivacy = true;
  report.E = true;

  const legacySession = await createSession(legacy.id, "legacy");
  const sessionExpiryBefore = await scalar(
    "select expires_at::text from public.booking_management_sessions where token_hash = $1",
    [legacySession],
  );
  const sessionContext = await result("select public.get_booking_management_session($1) as result", [legacySession]);
  const repeatedSessionContext = await result("select public.get_booking_management_session($1) as result", [legacySession]);
  const sessionExpiryAfter = await scalar(
    "select expires_at::text from public.booking_management_sessions where token_hash = $1",
    [legacySession],
  );
  assert(sessionContext?.ok && sessionContext.session.booking_request_id === legacy.id, "F: session booking binding failed");
  assert(repeatedSessionContext?.ok && sessionExpiryAfter === sessionExpiryBefore, "F: management session expiry slid on repeated access");
  const foreignBookingId = await scalar(`
    insert into public.booking_requests (
      guest_name, check_in, check_out, guest_count, adults, children, status
    ) values ('Foreign Booking', '2028-01-10', '2028-01-12', 10, 10, 0, 'pending_review')
    returning id
  `);
  const foreignAttempt = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'schedule_change', null) as result",
    [foreignBookingId, legacySession],
  );
  assert(!foreignAttempt.ok && foreignAttempt.code === "booking_management_session_invalid", "F: session accessed another booking");
  assert(Number(await scalar(
    "select count(*)::integer from public.booking_cancellation_requests where booking_request_id = $1::uuid",
    [foreignBookingId],
  )) === 0, "F: invalid session created a cancellation request");
  report.sessionContract = true;
  report.F = true;

  const expiredSession = await createSession(legacy.id, "expired");
  await db.query(
    `update public.booking_management_sessions
        set created_at = clock_timestamp() - interval '2 minutes',
            expires_at = clock_timestamp() - interval '1 minute'
      where token_hash = $1`,
    [expiredSession],
  );
  const expiredContext = await result("select public.get_booking_management_session($1) as result", [expiredSession]);
  assert(!expiredContext.ok, "G: expired session remained active");
  report.G = true;
  report.P = legacy.status === "pending_review" && sessionContext.ok;

  const holdPayload = buildHoldPayload("hold-cancel", "2028-02-01", "2028-02-03");
  const hold = await acquire(holdPayload);
  const holdSession = await createSession(hold.request.id, "hold-cancel");
  const holdCancelled = await result(
    "select public.customer_cancel_payment_hold_booking($1::uuid, $2, 'schedule_change', '行程變更') as result",
    [hold.request.id, holdSession],
  );
  assert(holdCancelled.ok && holdCancelled.request.status === "cancelled", "H: payment_hold was not cancelled");
  assert(await unavailableCount("2028-02-01", "2028-02-03") === 0, "H: cancelled hold still blocked inventory");
  assert(await cancellationAuditCount(hold.request.id, "customer_booking_cancelled") === 1, "H: cancellation audit missing");
  const cancelledRequestAttempt = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'schedule_change', null) as result",
    [hold.request.id, holdSession],
  );
  assert(!cancelledRequestAttempt.ok, "H: cancelled booking created an active cancellation request");
  assert(Number(await scalar(
    "select count(*)::integer from public.booking_cancellation_requests where booking_request_id = $1::uuid and status = 'pending'",
    [hold.request.id],
  )) === 0, "H: cancelled booking retained a pending cancellation request");

  const expiredPayload = buildHoldPayload("expired-cancel", "2028-02-20", "2028-02-22");
  const expiredHold = await acquire(expiredPayload);
  const expiredHoldSession = await createSession(expiredHold.request.id, "expired-cancel");
  await db.query(
    "update public.booking_requests set hold_expires_at = clock_timestamp() - interval '1 minute' where id = $1::uuid",
    [expiredHold.request.id],
  );
  const expiredDirectAttempt = await result(
    "select public.customer_cancel_payment_hold_booking($1::uuid, $2, 'schedule_change', null) as result",
    [expiredHold.request.id, expiredHoldSession],
  );
  const expiredRequestAttempt = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'schedule_change', null) as result",
    [expiredHold.request.id, expiredHoldSession],
  );
  assert(
    !expiredDirectAttempt.ok && expiredDirectAttempt.code === "booking_hold_expired" && !expiredRequestAttempt.ok,
    "H: expired hold accepted cancellation",
  );
  assert(await cancellationAuditCount(expiredHold.request.id) === 0, "H: expired hold wrote cancellation audit");
  report.H = true;

  const reviewPayload = buildHoldPayload("review-request", "2028-02-10", "2028-02-12");
  const reviewHold = await acquire(reviewPayload);
  await reportPayment(reviewPayload);
  const reviewSession = await createSession(reviewHold.request.id, "review-request");
  const reviewRequest = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'weather', null) as result",
    [reviewHold.request.id, reviewSession],
  );
  assert(reviewRequest.ok && reviewRequest.request.status === "payment_review", "I: payment_review status changed");
  assert(await unavailableCount("2028-02-10", "2028-02-12") === 1, "I: payment_review request released inventory");
  report.I = true;

  const approveFixture = await makeConfirmed(adminId, "approve", "2028-03-01", "2028-03-03");
  const approveSession = await createSession(approveFixture.hold.request.id, "approve");
  const pendingApproval = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'guest_count_change', null) as result",
    [approveFixture.hold.request.id, approveSession],
  );
  assert(pendingApproval.ok && pendingApproval.request.status === "confirmed", "J: confirmed status changed before review");
  assert(await unavailableCount("2028-03-01", "2028-03-03") === 1, "J: pending request released confirmed inventory");
  report.J = true;

  const duplicateApproval = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'weather', null) as result",
    [approveFixture.hold.request.id, approveSession],
  );
  assert(duplicateApproval.ok && duplicateApproval.idempotent, "K: duplicate request was not idempotent");
  assert(Number(await scalar(
    "select count(*)::integer from public.booking_cancellation_requests where booking_request_id = $1::uuid and status = 'pending'",
    [approveFixture.hold.request.id],
  )) === 1, "K: duplicate pending request was created");
  report.K = true;

  const approved = await result(
    "select public.review_booking_cancellation_request($1::uuid, $2::uuid, 'approved', 'approved', null) as result",
    [pendingApproval.cancellation_request.id, adminId],
  );
  assert(approved.ok && approved.request.status === "cancelled", "L: approval did not cancel booking");
  assert(approved.payment_record.status === "verified", "L: approval changed verified payment");
  assert(await unavailableCount("2028-03-01", "2028-03-03") === 0, "L: approval did not release inventory");
  assert(await cancellationAuditCount(approveFixture.hold.request.id, "admin_cancellation_approved") === 1, "L: approval audit missing");
  const duplicateApproved = await result(
    "select public.review_booking_cancellation_request($1::uuid, $2::uuid, 'approved', 'duplicate', null) as result",
    [pendingApproval.cancellation_request.id, adminId],
  );
  assert(duplicateApproved.ok && duplicateApproved.idempotent, "L: duplicate approval was not idempotent");
  assert(await cancellationAuditCount(approveFixture.hold.request.id, "admin_cancellation_approved") === 1, "L: duplicate approval wrote another audit");
  report.L = true;

  const rejectFixture = await makeConfirmed(adminId, "reject", "2028-03-10", "2028-03-12");
  const rejectSession = await createSession(rejectFixture.hold.request.id, "reject");
  const pendingRejection = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'schedule_change', null) as result",
    [rejectFixture.hold.request.id, rejectSession],
  );
  const rejected = await result(
    "select public.review_booking_cancellation_request($1::uuid, $2::uuid, 'rejected', 'not approved', '請聯絡館主') as result",
    [pendingRejection.cancellation_request.id, adminId],
  );
  assert(rejected.ok && rejected.request.status === "confirmed", "M: rejection changed booking status");
  assert(await unavailableCount("2028-03-10", "2028-03-12") === 1, "M: rejection released inventory");
  assert(await cancellationAuditCount(rejectFixture.hold.request.id, "admin_cancellation_rejected") === 1, "M: rejection audit missing");
  const duplicateRejected = await result(
    "select public.review_booking_cancellation_request($1::uuid, $2::uuid, 'rejected', 'duplicate', null) as result",
    [pendingRejection.cancellation_request.id, adminId],
  );
  assert(duplicateRejected.ok && duplicateRejected.idempotent, "M: duplicate rejection was not idempotent");
  assert(await cancellationAuditCount(rejectFixture.hold.request.id, "admin_cancellation_rejected") === 1, "M: duplicate rejection wrote another audit");
  report.M = true;

  const directFixture = await makeConfirmed(adminId, "direct", "2028-03-20", "2028-03-22");
  const directCancelled = await result(
    "select public.admin_cancel_confirmed_booking($1::uuid, $2::uuid, 'admin direct cancellation') as result",
    [directFixture.hold.request.id, adminId],
  );
  assert(directCancelled.ok && directCancelled.request.status === "cancelled", "N: direct admin cancellation failed");
  assert(directCancelled.payment_record.status === "verified", "N: direct cancellation changed verified payment");
  assert(await unavailableCount("2028-03-20", "2028-03-22") === 0, "N: direct cancellation did not release inventory");
  assert(await cancellationAuditCount(directFixture.hold.request.id, "admin_booking_cancelled") === 1, "N: direct cancellation audit missing");
  const pendingDirectFixture = await makeConfirmed(adminId, "pending-direct", "2028-03-25", "2028-03-27");
  const pendingDirectSession = await createSession(pendingDirectFixture.hold.request.id, "pending-direct");
  const pendingDirectRequest = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'schedule_change', null) as result",
    [pendingDirectFixture.hold.request.id, pendingDirectSession],
  );
  assert(pendingDirectRequest.ok, "N: pending direct fixture cancellation request failed");
  const blockedDirectCancellation = await result(
    "select public.admin_cancel_confirmed_booking($1::uuid, $2::uuid, 'must use review') as result",
    [pendingDirectFixture.hold.request.id, adminId],
  );
  assert(
    !blockedDirectCancellation.ok && blockedDirectCancellation.code === "pending_cancellation_request_requires_review",
    "N: direct cancellation bypassed a pending cancellation review",
  );
  assert(
    await scalar("select status from public.booking_requests where id = $1::uuid", [pendingDirectFixture.hold.request.id]) === "confirmed",
    "N: rejected direct cancellation changed the booking",
  );
  assert(await unavailableCount("2028-03-25", "2028-03-27") === 1, "N: rejected direct cancellation released inventory");
  const directAuditId = await scalar(
    "select id from public.booking_cancellation_audit_logs where booking_request_id = $1::uuid",
    [directFixture.hold.request.id],
  );
  const auditUpdate = await attempt(
    "update public.booking_cancellation_audit_logs set reason = 'tampered' where id = $1::uuid returning id",
    [directAuditId],
  );
  const auditDelete = await attempt(
    "delete from public.booking_cancellation_audit_logs where id = $1::uuid returning id",
    [directAuditId],
  );
  assert(!auditUpdate.ok && !auditDelete.ok, "N: cancellation audit was not append-only");
  const auditPrivileges = (await query(`
    select
      has_table_privilege('service_role', 'public.booking_cancellation_audit_logs', 'SELECT') as can_select,
      has_table_privilege('service_role', 'public.booking_cancellation_audit_logs', 'INSERT') as can_insert,
      has_table_privilege('service_role', 'public.booking_cancellation_audit_logs', 'UPDATE') as can_update,
      has_table_privilege('service_role', 'public.booking_cancellation_audit_logs', 'DELETE') as can_delete,
      has_table_privilege('service_role', 'public.booking_management_sessions', 'INSERT') as can_insert_session
  `))[0];
  assert(
    auditPrivileges.can_select &&
      !auditPrivileges.can_insert &&
      !auditPrivileges.can_update &&
      !auditPrivileges.can_delete &&
      !auditPrivileges.can_insert_session,
    "N: service role can bypass the cancellation audit RPC",
  );
  const securedTables = await query(`
    select c.relname,
           c.relrowsecurity,
           (select count(*)::integer from pg_catalog.pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policy_count,
           (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')) as anon_access,
           (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE')) as authenticated_access,
           has_table_privilege('service_role', c.oid, 'SELECT') as service_select,
           (has_table_privilege('service_role', c.oid, 'INSERT') or has_table_privilege('service_role', c.oid, 'UPDATE') or has_table_privilege('service_role', c.oid, 'DELETE')) as service_mutation
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (
         'booking_lookup_rate_limits',
         'booking_management_sessions',
         'booking_cancellation_requests',
         'booking_cancellation_audit_logs'
       )
     order by c.relname
  `);
  assert(securedTables.length === 4, "Security: expected four management tables");
  assert(
    securedTables.every((table) => table.relrowsecurity && Number(table.policy_count) === 0 && !table.anon_access && !table.authenticated_access && !table.service_mutation),
    "Security: table RLS or mutation privileges are too broad",
  );
  assert(
    securedTables.filter((table) => table.service_select).map((table) => table.relname).join(",") ===
      "booking_cancellation_audit_logs,booking_cancellation_requests",
    "Security: service_role table SELECT privileges differ from contract",
  );
  const rpcPrivileges = await query(`
    select signature,
           has_function_privilege('service_role', signature, 'EXECUTE') as service_execute,
           has_function_privilege('anon', signature, 'EXECUTE') as anon_execute,
           has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated_execute
      from unnest(array[
        'public.consume_booking_lookup_rate_limit(text,integer,integer)',
        'public.get_booking_management_session(text)',
        'public.create_booking_management_session(uuid,text,text,text)',
        'public.customer_cancel_payment_hold_booking(uuid,text,text,text)',
        'public.customer_request_booking_cancellation(uuid,text,text,text)',
        'public.report_booking_bank_transfer_from_management_session(uuid,text,text,text,text,integer)',
        'public.admin_cancel_confirmed_booking(uuid,uuid,text)',
        'public.review_booking_cancellation_request(uuid,uuid,text,text,text)'
      ]) signature
  `);
  assert(
    rpcPrivileges.length === 8 && rpcPrivileges.every((rpc) => rpc.service_execute && !rpc.anon_execute && !rpc.authenticated_execute),
    "Security: RPC execute grants differ from service-only contract",
  );
  const functionSecurity = await query(`
    select p.proname, p.prosecdef, p.proconfig
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'prevent_booking_cancellation_audit_mutation',
         'consume_booking_lookup_rate_limit',
         'get_booking_management_session',
         'create_booking_management_session',
         'customer_cancel_payment_hold_booking',
         'customer_request_booking_cancellation',
         'report_booking_bank_transfer_from_management_session',
         'admin_cancel_confirmed_booking',
         'review_booking_cancellation_request'
       )
  `);
  assert(
    functionSecurity.length === 9 && functionSecurity.every((fn) => fn.prosecdef && String(fn.proconfig).includes("search_path=public, pg_temp")),
    "Security: SECURITY DEFINER search_path contract failed",
  );
  assert(
    !(await query(`
      select 1
        from information_schema.columns
       where table_schema = 'public'
         and table_name = 'booking_management_sessions'
         and column_name in ('token', 'raw_token', 'email', 'phone', 'booking_reference')
    `)).length,
    "Security: management session table contains raw credentials",
  );
  report.security = true;
  const refundColumns = Number(await scalar(`
    select count(*)::integer from information_schema.columns
    where table_schema = 'public'
      and table_name in ('booking_requests', 'booking_payment_records')
      and column_name in ('refund_status', 'refund_amount', 'refunded_at')
  `));
  assert(refundColumns === 0, "N: migration fabricated refund state");
  report.N = true;

  const rollbackFixture = await makeConfirmed(adminId, "audit-rollback", "2028-04-01", "2028-04-03");
  await db.exec(`
    create or replace function public.fail_booking_cancellation_audit()
    returns trigger language plpgsql as $$
    begin
      raise exception using errcode = 'P0001', message = 'forced_booking_cancellation_audit_failure';
    end;
    $$;
    create trigger fail_booking_cancellation_audit
      before insert on public.booking_cancellation_audit_logs
      for each row execute function public.fail_booking_cancellation_audit();
  `);
  const auditFailure = await attempt(
    "select public.admin_cancel_confirmed_booking($1::uuid, $2::uuid, 'must roll back') as result",
    [rollbackFixture.hold.request.id, adminId],
  );
  await db.exec(`
    drop trigger fail_booking_cancellation_audit on public.booking_cancellation_audit_logs;
    drop function public.fail_booking_cancellation_audit();
  `);
  assert(!auditFailure.ok && auditFailure.error.includes("forced_booking_cancellation_audit_failure"), "O: audit failure was not surfaced");
  assert(await scalar("select status from public.booking_requests where id = $1::uuid", [rollbackFixture.hold.request.id]) === "confirmed", "O: audit failure did not roll back booking");
  assert(await cancellationAuditCount(rollbackFixture.hold.request.id) === 0, "O: audit failure left a partial audit");
  assert(await unavailableCount("2028-04-01", "2028-04-03") === 1, "O: audit failure released inventory");
  report.O = true;

  const invalidAdminFixture = await makeConfirmed(adminId, "invalid-admin", "2028-04-05", "2028-04-07");
  const invalidAdminId = await scalar("select gen_random_uuid()");
  const invalidAdminResult = await result(
    "select public.admin_cancel_confirmed_booking($1::uuid, $2::uuid, 'invalid admin') as result",
    [invalidAdminFixture.hold.request.id, invalidAdminId],
  );
  assert(!invalidAdminResult.ok && invalidAdminResult.code === "invalid_admin_context", "Atomicity: invalid admin was accepted");
  assert(await scalar(
    "select status from public.booking_requests where id = $1::uuid",
    [invalidAdminFixture.hold.request.id],
  ) === "confirmed", "Atomicity: invalid admin changed booking status");
  assert(await cancellationAuditCount(invalidAdminFixture.hold.request.id) === 0, "Atomicity: invalid admin wrote cancellation audit");
  assert(await unavailableCount("2028-04-05", "2028-04-07") === 1, "Atomicity: invalid admin released inventory");

  const requestFailureFixture = await makeConfirmed(adminId, "request-update-failure", "2028-04-10", "2028-04-12");
  const requestFailureSession = await createSession(requestFailureFixture.hold.request.id, "request-update-failure");
  const requestFailurePending = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'schedule_change', null) as result",
    [requestFailureFixture.hold.request.id, requestFailureSession],
  );
  await db.exec(`
    create or replace function public.fail_booking_cancellation_request_update()
    returns trigger language plpgsql set search_path = public, pg_temp as $$
    begin
      raise exception using errcode = 'P0001', message = 'forced_booking_cancellation_request_update_failure';
    end;
    $$;
    create trigger fail_booking_cancellation_request_update
      before update on public.booking_cancellation_requests
      for each row execute function public.fail_booking_cancellation_request_update();
  `);
  const requestUpdateFailure = await attempt(
    "select public.review_booking_cancellation_request($1::uuid, $2::uuid, 'approved', null, null) as result",
    [requestFailurePending.cancellation_request.id, adminId],
  );
  await db.exec(`
    drop trigger fail_booking_cancellation_request_update on public.booking_cancellation_requests;
    drop function public.fail_booking_cancellation_request_update();
  `);
  assert(
    !requestUpdateFailure.ok && requestUpdateFailure.error.includes("forced_booking_cancellation_request_update_failure"),
    "Atomicity: cancellation request update failure was not surfaced",
  );
  assert(await scalar(
    "select status from public.booking_cancellation_requests where id = $1::uuid",
    [requestFailurePending.cancellation_request.id],
  ) === "pending", "Atomicity: failed request update did not roll back");
  assert(await scalar(
    "select status from public.booking_requests where id = $1::uuid",
    [requestFailureFixture.hold.request.id],
  ) === "confirmed", "Atomicity: failed request update changed booking");
  assert(await cancellationAuditCount(requestFailureFixture.hold.request.id) === 1, "Atomicity: failed request update wrote partial admin audit");
  assert(await unavailableCount("2028-04-10", "2028-04-12") === 1, "Atomicity: failed request update released inventory");

  const staleFixture = await makeConfirmed(adminId, "stale-status", "2028-04-20", "2028-04-22");
  const staleSession = await createSession(staleFixture.hold.request.id, "stale-status");
  const stalePending = await result(
    "select public.customer_request_booking_cancellation($1::uuid, $2, 'weather', null) as result",
    [staleFixture.hold.request.id, staleSession],
  );
  await db.query("update public.booking_requests set status = 'expired' where id = $1::uuid", [staleFixture.hold.request.id]);
  const staleResult = await result(
    "select public.review_booking_cancellation_request($1::uuid, $2::uuid, 'approved', null, null) as result",
    [stalePending.cancellation_request.id, adminId],
  );
  assert(!staleResult.ok && staleResult.code === "cancellation_review_invalid_booking_status", "Atomicity: stale booking status was accepted");
  assert(await scalar(
    "select status from public.booking_cancellation_requests where id = $1::uuid",
    [stalePending.cancellation_request.id],
  ) === "pending", "Atomicity: stale status changed cancellation request");
  assert(await scalar(
    "select status from public.booking_requests where id = $1::uuid",
    [staleFixture.hold.request.id],
  ) === "expired", "Atomicity: stale status changed booking");
  assert(await cancellationAuditCount(staleFixture.hold.request.id) === 1, "Atomicity: stale status wrote partial admin audit");
  report.failureAtomicity = true;

  report.Q = reviewRequest.request.status === "payment_review" && reviewRequest.cancellation_request.status === "pending";
  const paymentAuditCount = Number(await scalar(
    "select count(*)::integer from public.booking_payment_admin_audit_logs where booking_request_id = $1::uuid and action = 'bank_payment_confirmed'",
    [directFixture.hold.request.id],
  ));
  assert(paymentAuditCount === 1, "R: Phase 2A.1 payment audit regression");
  report.R = true;

  const concurrentA = buildHoldPayload("concurrent-a", "2028-04-25", "2028-04-27");
  const concurrentB = buildHoldPayload("concurrent-b", "2028-04-25", "2028-04-27");
  const concurrentResults = await Promise.all([acquire(concurrentA), acquire(concurrentB)]);
  assert(
    concurrentResults.filter((entry) => entry?.ok).length === 1 &&
      concurrentResults.filter((entry) => entry?.code === "booking_temporarily_held").length === 1,
    `S: concurrent Phase 1 hold regression: ${JSON.stringify(concurrentResults)}`,
  );

  const externalId = await scalar(`
    insert into public.booking_external_reservations (source, check_in, check_out, status)
    values ('booking_com', '2028-05-01', '2028-05-03', 'confirmed') returning id
  `);
  await db.query(`
    insert into public.booking_availability_blocks (
      block_type, source, external_reservation_id, check_in, check_out, status
    ) values ('external_reservation', 'booking_com', $1::uuid, '2028-05-01', '2028-05-03', 'confirmed')
  `, [externalId]);
  const externalBlocked = await acquire(buildHoldPayload("external", "2028-05-01", "2028-05-03"));
  await db.exec(`
    insert into public.booking_availability_blocks (block_type, source, check_in, check_out, status)
    values ('manual', 'manual', '2028-05-10', '2028-05-12', 'confirmed');
    insert into public.booking_availability_blocks (block_type, source, ical_uid, check_in, check_out, status)
    values ('booking_ical', 'booking_ical', 'management-suite-ical', '2028-05-20', '2028-05-22', 'confirmed');
  `);
  const manualBlocked = await acquire(buildHoldPayload("manual", "2028-05-10", "2028-05-12"));
  const icalBlocked = await acquire(buildHoldPayload("ical", "2028-05-20", "2028-05-22"));
  assert(
    externalBlocked.code === "date_unavailable" &&
      manualBlocked.code === "date_unavailable" &&
      icalBlocked.code === "date_unavailable",
    "S: external/manual/iCal inventory regression",
  );
  report.S = true;

  const durableAuditRows = Number(await scalar("select count(*)::integer from public.booking_cancellation_audit_logs"));
  const durableRequestRows = Number(await scalar("select count(*)::integer from public.booking_cancellation_requests"));
  await execFile(rollbackPath);
  assert(await scalar("select to_regclass('public.booking_management_sessions') is null") === true, "Rollback kept management sessions");
  assert(await scalar("select to_regclass('public.booking_lookup_rate_limits') is null") === true, "Rollback kept lookup rate limits");
  assert(Number(await scalar("select count(*)::integer from public.booking_cancellation_audit_logs")) === durableAuditRows, "Rollback deleted cancellation audit history");
  assert(Number(await scalar("select count(*)::integer from public.booking_cancellation_requests")) === durableRequestRows, "Rollback deleted cancellation request history");
  report.rollback = true;
  await execFile(rollbackPath);
  assert(Number(await scalar("select count(*)::integer from public.booking_cancellation_audit_logs")) === durableAuditRows, "Rollback rerun deleted cancellation audit history");
  assert(Number(await scalar("select count(*)::integer from public.booking_cancellation_requests")) === durableRequestRows, "Rollback rerun deleted cancellation request history");
  report.rollbackRerun = true;

  assert(Object.entries(report).filter(([key]) => /^[A-S]$/.test(key)).every(([, passed]) => passed), "Not all A-S checks passed");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.close();
}
