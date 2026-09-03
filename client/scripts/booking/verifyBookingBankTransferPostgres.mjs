import { createHash, randomBytes } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const args = parseArgs(process.argv.slice(2));
const psqlPath = String(args.psql || "");
const connection = String(args.connection || "");
assert(process.env.BOOKING_PAYMENT_SMOKE_CONFIRM === "isolated-test-db", "Missing isolated DB confirmation guard.");
assert(psqlPath, "--psql is required.");
assert(connection, "--connection is required.");

const connectionUrl = new URL(connection);
assert(["127.0.0.1", "localhost"].includes(connectionUrl.hostname), "The verification DB must be local.");
assert(connectionUrl.pathname.replace(/^\//, "") === "booking_payment_test", "The verification DB name must be booking_payment_test.");

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const testSchemaPath = fileURLToPath(new URL("./bookingPaymentTestSchema.sql", import.meta.url));
const phase1MigrationPath = fileURLToPath(
  new URL("../../supabase/migrations/2026-08-30-booking-payment-hold.sql", import.meta.url),
);
const phase2MigrationPath = fileURLToPath(
  new URL("../../supabase/migrations/2026-09-01-booking-bank-transfer-payment-review.sql", import.meta.url),
);
const phase2RollbackPath = fileURLToPath(
  new URL("../../supabase/rollbacks/2026-09-01-booking-bank-transfer-payment-review.rollback.sql", import.meta.url),
);
const phase21MigrationPath = fileURLToPath(
  new URL("../../supabase/migrations/2026-09-02-booking-payment-admin-audit.sql", import.meta.url),
);
const phase21RollbackPath = fileURLToPath(
  new URL("../../supabase/rollbacks/2026-09-02-booking-payment-admin-audit.rollback.sql", import.meta.url),
);

async function runPsql(extraArgs) {
  const { stdout } = await execFile(
    psqlPath,
    ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", connection, ...extraArgs],
    { cwd: scriptDirectory, maxBuffer: 20 * 1024 * 1024 },
  );
  return stdout.trim();
}

async function runFile(filePath) {
  return runPsql(["-f", filePath]);
}

async function runSql(sql, variables = {}) {
  let resolvedSql = sql;
  for (const [key, value] of Object.entries(variables)) {
    const escapedValue = String(value).replaceAll("'", "''");
    resolvedSql = resolvedSql.replaceAll(`:'${key}'`, `'${escapedValue}'`);
  }
  return runPsql(["-A", "-t", "-c", resolvedSql]);
}

async function runJsonSql(sql, variables = {}) {
  const output = await runSql(sql, variables);
  return output ? JSON.parse(output) : null;
}

async function attemptSql(sql, variables = {}) {
  try {
    return { ok: true, output: await runSql(sql, variables), error: "" };
  } catch (error) {
    return { ok: false, output: "", error: String(error) };
  }
}

async function clearTestData() {
  await runSql(`
    truncate table
      public.booking_payment_admin_audit_logs,
      public.booking_payment_report_rate_limits,
      public.booking_payment_records,
      public.booking_availability_blocks,
      public.booking_external_reservations,
      public.booking_requests
    restart identity cascade;
  `);
}

function buildHoldPayload({ checkIn, checkOut, label, recoveryToken = randomBytes(32).toString("base64url") }) {
  const pricingBreakdown = {
    status: "resolved",
    total: 121564,
    lodgingSubtotal: 120314,
    breakfastAddonTotal: 1250,
    depositAmount: 36469,
    balanceAmount: 85095,
    petDepositAmount: 3000,
  };
  const snapshot = {
    pricing: {
      quotedTotal: 121564,
      depositRate: 0.3,
      depositAmount: 36469,
      balanceAmount: 85095,
      pricingBreakdown,
    },
    summary: {
      adultCount: 15,
      childCount: 7,
      infantCount: 0,
      dogUnder10kgCount: 3,
      dog10To20kgCount: 0,
      dogOver20kgCount: 0,
      dogCount: 3,
      nightCount: 4,
      selectedRoomOption: null,
      breakfastAddonEntries: [{ date: checkOut, quantity: 5 }],
    },
    contact: {
      maskedEmail: "bo***@example.invalid",
      maskedPhone: "09******00",
    },
  };

  return {
    recoveryToken,
    request: {
      recovery_token_hash: sha256(recoveryToken),
      submitted_snapshot: snapshot,
      guest_name: `Isolated Payment ${label}`,
      guest_email: `payment-${label.toLowerCase()}@example.invalid`,
      guest_phone: "0900000000",
      check_in: checkIn,
      check_out: checkOut,
      guest_count: 22,
      stay_type: "villa",
      adults: 15,
      children: 7,
      room_count: 5,
      has_pets: true,
      pet_count: 3,
      pet_type: "dog",
      source: "official_site",
      raw_payload: { infants: 0, breakfast_addons: [{ date: checkOut, quantity: 5 }] },
      selected_package_type: "villa_10",
      quoted_total: 121564,
      deposit_rate: 0.3,
      deposit_amount: 36469,
      balance_amount: 85095,
      pricing_breakdown: pricingBreakdown,
      quoted_at: new Date().toISOString(),
    },
  };
}

async function acquireHold(payload) {
  return runJsonSql("select public.acquire_villa_booking_hold(:'payload'::jsonb)::text;", {
    payload: JSON.stringify(payload.request),
  });
}

async function reportPayment(payload, overrides = {}) {
  return runJsonSql(
    `select public.report_booking_bank_transfer(
      :'token_hash',
      :'bank_last5',
      :'payer_name',
      :'notes',
      :'review_minutes'::integer
    )::text;`,
    {
      token_hash: sha256(payload.recoveryToken),
      bank_last5: overrides.bankLast5 || "12345",
      payer_name: overrides.payerName || "Payment Smoke Tester",
      notes: overrides.notes || "isolated DB test",
      review_minutes: overrides.reviewMinutes || 120,
    },
  );
}

async function recover(payload) {
  return runJsonSql("select public.recover_booking_hold(:'token_hash')::text;", {
    token_hash: sha256(payload.recoveryToken),
  });
}

async function unavailableRangeCount(checkIn, checkOut) {
  return Number(
    await runSql(
      "select count(*) from public.get_public_booking_unavailable_ranges(:'check_in'::date, :'check_out'::date);",
      { check_in: checkIn, check_out: checkOut },
    ),
  );
}

async function runConcurrentInventoryWriters(sqlStatements) {
  return Promise.all(sqlStatements.map((sql) => attemptSql(sql)));
}

const report = {
  database: connectionUrl.pathname.replace(/^\//, ""),
  host: connectionUrl.hostname,
  migration: {},
  bookingReference: {},
  paymentLifecycle: {},
  expiry: {},
  recovery: {},
  admin: {},
  paymentAdminAudit: {},
  phase1Regression: {},
  inventoryRegression: {},
  rateLimit: {},
  privileges: {},
  rollback: {},
};

await runFile(testSchemaPath);

const cryptoCompatibility = await runJsonSql(`
  select jsonb_build_object(
    'extension_schema', (
      select namespace.nspname
      from pg_extension as extension
      join pg_namespace as namespace on namespace.oid = extension.extnamespace
      where extension.extname = 'pgcrypto'
    ),
    'gen_random_bytes_schema', (
      select namespace.nspname
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where procedure.proname = 'gen_random_bytes'
        and pg_get_function_identity_arguments(procedure.oid) = 'integer'
      limit 1
    ),
    'search_path', current_setting('search_path')
  )::text;
`);
assert(cryptoCompatibility.extension_schema === "extensions", "pgcrypto is not installed in the Production-compatible schema.");
assert(
  cryptoCompatibility.gen_random_bytes_schema === "extensions",
  "gen_random_bytes is not resolved from the Production-compatible schema.",
);
assert(
  cryptoCompatibility.search_path === '"$user", public, extensions',
  "Isolated search_path does not match Production.",
);

await runSql(`
  insert into public.booking_requests (
    guest_name, check_in, check_out, guest_count, adults, children, status
  )
  select
    'Legacy booking ' || sequence,
    date '2027-01-01' + sequence,
    date '2027-01-02' + sequence,
    10,
    10,
    0,
    case when sequence <= 6 then 'cancelled' else 'pending_review' end
  from generate_series(1, 8) as sequence;
`);
const legacyBefore = await runJsonSql(`
  select jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id)::text
  from public.booking_requests;
`);

await runFile(phase1MigrationPath);
await runFile(phase2MigrationPath);

const legacyAfterFirstMigration = await runJsonSql(`
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'booking_reference', booking_reference
  ) order by id)::text
  from public.booking_requests;
`);
assert(legacyAfterFirstMigration.length === 8, "Phase 2 migration did not preserve all eight legacy rows.");
assert(
  legacyAfterFirstMigration.every((row) => /^\d{10}$/.test(row.booking_reference)),
  "Legacy booking reference backfill is not ten numeric digits.",
);
assert(new Set(legacyAfterFirstMigration.map((row) => row.booking_reference)).size === 8, "Legacy booking references are not unique.");
assert(
  legacyBefore.every((before) => legacyAfterFirstMigration.some((after) => after.id === before.id && after.status === before.status)),
  "Legacy booking id or status changed during migration.",
);

await runFile(phase2MigrationPath);
const legacyAfterSecondMigration = await runJsonSql(`
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'booking_reference', booking_reference
  ) order by id)::text
  from public.booking_requests;
`);
assert(
  JSON.stringify(legacyAfterSecondMigration) === JSON.stringify(legacyAfterFirstMigration),
  "Repeated migration changed existing booking rows or booking references.",
);

await runFile(phase21MigrationPath);
const legacyAfterAuditMigration = await runJsonSql(`
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'booking_reference', booking_reference
  ) order by id)::text
  from public.booking_requests;
`);
assert(
  JSON.stringify(legacyAfterAuditMigration) === JSON.stringify(legacyAfterSecondMigration),
  "Audit migration changed existing booking rows or booking references.",
);
assert(
  Number(await runSql("select count(*) from public.booking_payment_admin_audit_logs;")) === 0,
  "Audit migration fabricated historical audit rows.",
);

await runFile(phase21MigrationPath);
const legacyAfterRepeatedAuditMigration = await runJsonSql(`
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'status', status,
    'booking_reference', booking_reference
  ) order by id)::text
  from public.booking_requests;
`);
assert(
  JSON.stringify(legacyAfterRepeatedAuditMigration) === JSON.stringify(legacyAfterAuditMigration),
  "Repeated audit migration changed existing booking rows.",
);
report.migration = {
  passed: true,
  existingRowsPreserved: 8,
  repeatedMigrationStable: true,
  auditMigrationIncremental: true,
  auditMigrationDidNotBackfill: true,
};

await clearTestData();
await runSql(`
  insert into public.booking_requests (
    booking_reference,
    guest_name,
    check_in,
    check_out,
    guest_count,
    adults,
    children,
    status
  )
  select
    '1111111111',
    'Reference bulk ' || sequence,
    date '2027-02-01',
    date '2027-02-02',
    10,
    10,
    0,
    'cancelled'
  from generate_series(1, 2500) as sequence;
`);
const referenceAudit = await runJsonSql(`
  select jsonb_build_object(
    'count', count(*),
    'distinct_count', count(distinct booking_reference),
    'invalid_count', count(*) filter (where booking_reference !~ '^[0-9]{10}$'),
    'caller_value_count', count(*) filter (where booking_reference = '1111111111')
  )::text
  from public.booking_requests;
`);
assert(referenceAudit.count === 2500, "Booking reference bulk insert count mismatch.");
assert(referenceAudit.distinct_count === 2500, "Booking references were not unique.");
assert(referenceAudit.invalid_count === 0, "A booking reference violated the ten-digit format.");
assert(referenceAudit.caller_value_count === 0, "A caller-controlled booking reference was accepted.");
report.bookingReference = { passed: true, ...referenceAudit };

await clearTestData();
const activePayload = buildHoldPayload({ checkIn: "2027-03-01", checkOut: "2027-03-05", label: "active" });
const activeHold = await acquireHold(activePayload);
assert(activeHold?.ok === true, "Active hold setup failed.");
assert(/^\d{10}$/.test(activeHold.request.booking_reference), "New hold did not receive a ten-digit booking reference.");

const firstReport = await reportPayment(activePayload);
assert(firstReport?.ok === true && firstReport.idempotent === false, "Active hold payment report failed.");
assert(firstReport.request.status === "payment_review", "Payment report did not transition to payment_review.");
assert(firstReport.payment_record.expected_amount === 36469, "Payment expected amount did not come from the deposit snapshot.");
assert(firstReport.payment_record.status === "reported", "Payment record status was not reported.");
const firstReviewDeadline = firstReport.request.review_expires_at;

await new Promise((resolve) => setTimeout(resolve, 1100));
const duplicateReport = await reportPayment(activePayload, { bankLast5: "99999", payerName: "Ignored duplicate" });
assert(duplicateReport?.ok === true && duplicateReport.idempotent === true, "Duplicate payment report was not idempotent.");
assert(duplicateReport.request.review_expires_at === firstReviewDeadline, "Duplicate payment report extended the review deadline.");
const paymentRecordCount = Number(await runSql("select count(*) from public.booking_payment_records;"));
assert(paymentRecordCount === 1, "Duplicate payment report created a second payment record.");
assert(await unavailableRangeCount("2027-03-01", "2027-03-05") === 1, "Active payment_review did not block the calendar.");
report.paymentLifecycle = {
  passed: true,
  status: firstReport.request.status,
  expectedAmount: firstReport.payment_record.expected_amount,
  duplicateIdempotent: true,
  reviewDeadlineUnchanged: true,
  paymentRecordCount,
};

const recoveredReview = await recover(activePayload);
assert(recoveredReview?.ok === true, "Payment review recovery failed.");
assert(recoveredReview.request.id === firstReport.request.id, "Recovery returned a different booking id.");
assert(recoveredReview.request.review_expires_at === firstReviewDeadline, "Recovery extended the review deadline.");
assert(recoveredReview.pricing.depositAmount === 36469, "Recovery lost the immutable deposit snapshot.");
assert(recoveredReview.payment_record.expected_amount === 36469, "Recovery lost the payment record.");
report.recovery = {
  passed: true,
  sameBookingId: true,
  sameReviewDeadline: true,
  immutableSnapshot: true,
};

await runSql(
  "update public.booking_requests set review_expires_at = clock_timestamp() - interval '1 second' where id = :'id'::uuid;",
  { id: firstReport.request.id },
);
assert(await unavailableRangeCount("2027-03-01", "2027-03-05") === 0, "Expired payment_review still blocked the calendar.");
const reacquirePayload = buildHoldPayload({ checkIn: "2027-03-01", checkOut: "2027-03-05", label: "reacquire" });
const reacquired = await acquireHold(reacquirePayload);
assert(reacquired?.ok === true, "Inventory was not immediately reacquirable after review expiry.");

await clearTestData();
const expiredHoldPayload = buildHoldPayload({ checkIn: "2027-03-10", checkOut: "2027-03-12", label: "expired-hold" });
const expiredHold = await acquireHold(expiredHoldPayload);
assert(expiredHold?.ok === true, "Expired hold setup failed.");
await runSql(
  "update public.booking_requests set hold_expires_at = clock_timestamp() - interval '1 second' where id = :'id'::uuid;",
  { id: expiredHold.request.id },
);
const expiredHoldReport = await reportPayment(expiredHoldPayload);
assert(expiredHoldReport?.ok === false && expiredHoldReport.code === "booking_hold_expired", "Expired hold accepted a payment report.");
assert(Number(await runSql("select count(*) from public.booking_payment_records;")) === 0, "Expired hold created a payment record.");
report.expiry = {
  passed: true,
  reviewReleasedWithoutCron: true,
  inventoryReacquiredWithoutCleanup: true,
  expiredHoldRejected: true,
};

await clearTestData();
const adminFixture = await runJsonSql(`
  with inserted as (
    insert into public.admin_profiles (auth_user_id, display_name, email, is_active)
    values (gen_random_uuid(), 'Test Admin', 'admin@example.invalid', true)
    returning id, auth_user_id
  )
  select jsonb_build_object('id', id, 'auth_user_id', auth_user_id)::text
  from inserted;
`);
const adminId = adminFixture.id;
const confirmPayload = buildHoldPayload({ checkIn: "2027-04-01", checkOut: "2027-04-03", label: "confirm" });
await acquireHold(confirmPayload);
const confirmReported = await reportPayment(confirmPayload);
const confirmed = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'confirmed')::text;",
  { booking_id: confirmReported.request.id, admin_id: adminId },
);
assert(confirmed?.ok === true && confirmed.request.status === "confirmed", "Admin confirm did not set confirmed.");
assert(confirmed.payment_record.status === "verified", "Admin confirm did not verify the payment record.");
assert(await unavailableRangeCount("2027-04-01", "2027-04-03") === 1, "Confirmed booking did not block inventory.");

const confirmAudit = await runJsonSql(`
  select jsonb_build_object(
    'count', count(*),
    'id', max(id::text),
    'booking_reference', max(booking_reference),
    'payment_id', max(payment_id::text),
    'admin_profile_id', max(admin_profile_id::text),
    'admin_auth_user_id', max(admin_auth_user_id::text),
    'action', max(action),
    'previous_booking_status', max(previous_booking_status),
    'new_booking_status', max(new_booking_status),
    'previous_payment_status', max(previous_payment_status),
    'new_payment_status', max(new_payment_status),
    'has_action_at', bool_and(action_at is not null),
    'has_created_at', bool_and(created_at is not null)
  )::text
  from public.booking_payment_admin_audit_logs
  where booking_request_id = :'booking_id'::uuid;
`, { booking_id: confirmReported.request.id });
assert(confirmAudit.count === 1, "Admin confirm did not create exactly one audit row.");
assert(confirmAudit.booking_reference === confirmReported.request.booking_reference, "Audit lost the booking reference snapshot.");
assert(confirmAudit.payment_id === confirmed.payment_record.id, "Audit references the wrong payment record.");
assert(confirmAudit.admin_profile_id === adminFixture.id, "Audit references the wrong admin profile.");
assert(confirmAudit.admin_auth_user_id === adminFixture.auth_user_id, "Audit references the wrong authenticated admin.");
assert(confirmAudit.action === "bank_payment_confirmed", "Admin confirm audit action is incorrect.");
assert(confirmAudit.previous_booking_status === "payment_review", "Admin confirm previous booking status is incorrect.");
assert(confirmAudit.new_booking_status === "confirmed", "Admin confirm new booking status is incorrect.");
assert(confirmAudit.previous_payment_status === "reported", "Admin confirm previous payment status is incorrect.");
assert(confirmAudit.new_payment_status === "verified", "Admin confirm new payment status is incorrect.");
assert(confirmAudit.has_action_at && confirmAudit.has_created_at, "Admin confirm audit timestamps are missing.");

const duplicateConfirmation = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'confirmed')::text;",
  { booking_id: confirmReported.request.id, admin_id: adminId },
);
assert(duplicateConfirmation?.ok === true && duplicateConfirmation.idempotent === true, "Duplicate confirm was not idempotent.");
assert(
  Number(await runSql(
    "select count(*) from public.booking_payment_admin_audit_logs where booking_request_id = :'booking_id'::uuid;",
    { booking_id: confirmReported.request.id },
  )) === 1,
  "Duplicate confirm created a second audit row.",
);

const confirmedPaymentVerifiedAt = confirmed.payment_record.verified_at;
const confirmedCancellation = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'cancelled')::text;",
  { booking_id: confirmReported.request.id, admin_id: adminId },
);
assert(confirmedCancellation?.ok === true, "Confirmed booking cancellation failed.");
assert(confirmedCancellation.request.status === "cancelled", "Confirmed booking cancellation did not cancel the booking.");
assert(confirmedCancellation.payment_record.status === "verified", "Confirmed booking cancellation changed verified payment history.");
assert(
  confirmedCancellation.payment_record.verified_at === confirmedPaymentVerifiedAt,
  "Confirmed booking cancellation changed the original verification timestamp.",
);
assert(await unavailableRangeCount("2027-04-01", "2027-04-03") === 0, "Confirmed booking cancellation did not release inventory.");

const confirmedCancellationAudit = await runJsonSql(`
  select jsonb_build_object(
    'count', count(*),
    'action', max(action),
    'previous_booking_status', max(previous_booking_status),
    'new_booking_status', max(new_booking_status),
    'previous_payment_status', max(previous_payment_status),
    'new_payment_status', max(new_payment_status)
  )::text
  from public.booking_payment_admin_audit_logs
  where booking_request_id = :'booking_id'::uuid
    and action = 'bank_payment_booking_cancelled';
`, { booking_id: confirmReported.request.id });
assert(confirmedCancellationAudit.count === 1, "Confirmed booking cancellation audit is missing.");
assert(confirmedCancellationAudit.previous_booking_status === "confirmed", "Confirmed cancellation previous booking status is incorrect.");
assert(confirmedCancellationAudit.new_booking_status === "cancelled", "Confirmed cancellation new booking status is incorrect.");
assert(confirmedCancellationAudit.previous_payment_status === "verified", "Confirmed cancellation previous payment status is incorrect.");
assert(confirmedCancellationAudit.new_payment_status === "verified", "Confirmed cancellation should not imply a refund or rejection.");

const cancelPayload = buildHoldPayload({ checkIn: "2027-04-10", checkOut: "2027-04-12", label: "cancel" });
await acquireHold(cancelPayload);
const cancelReported = await reportPayment(cancelPayload);
const cancelled = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'cancelled')::text;",
  { booking_id: cancelReported.request.id, admin_id: adminId },
);
assert(cancelled?.ok === true && cancelled.request.status === "cancelled", "Admin cancel did not set cancelled.");
assert(cancelled.payment_record.status === "rejected", "Admin cancel did not reject the payment record.");
assert(await unavailableRangeCount("2027-04-10", "2027-04-12") === 0, "Cancelled payment review still blocked inventory.");

const cancelAudit = await runJsonSql(`
  select jsonb_build_object(
    'count', count(*),
    'action', max(action),
    'previous_booking_status', max(previous_booking_status),
    'new_booking_status', max(new_booking_status),
    'previous_payment_status', max(previous_payment_status),
    'new_payment_status', max(new_payment_status)
  )::text
  from public.booking_payment_admin_audit_logs
  where booking_request_id = :'booking_id'::uuid;
`, { booking_id: cancelReported.request.id });
assert(cancelAudit.count === 1, "Admin cancellation did not create exactly one audit row.");
assert(cancelAudit.action === "bank_payment_cancelled", "Admin cancellation audit action is incorrect.");
assert(cancelAudit.previous_booking_status === "payment_review", "Admin cancellation previous booking status is incorrect.");
assert(cancelAudit.new_booking_status === "cancelled", "Admin cancellation new booking status is incorrect.");
assert(cancelAudit.previous_payment_status === "reported", "Admin cancellation previous payment status is incorrect.");
assert(cancelAudit.new_payment_status === "rejected", "Admin cancellation new payment status is incorrect.");

const invalidAdminPayload = buildHoldPayload({ checkIn: "2027-04-14", checkOut: "2027-04-16", label: "invalid-admin" });
await acquireHold(invalidAdminPayload);
const invalidAdminReported = await reportPayment(invalidAdminPayload);
const invalidAdminResult = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, gen_random_uuid(), 'confirmed')::text;",
  { booking_id: invalidAdminReported.request.id },
);
assert(invalidAdminResult?.ok === false && invalidAdminResult.code === "invalid_admin_context", "Invalid admin context was accepted.");
const invalidAdminState = await runJsonSql(`
  select jsonb_build_object(
    'booking_status', request.status,
    'payment_status', payment.status,
    'audit_count', (
      select count(*)
      from public.booking_payment_admin_audit_logs audit
      where audit.booking_request_id = request.id
    )
  )::text
  from public.booking_requests request
  join public.booking_payment_records payment on payment.booking_request_id = request.id
  where request.id = :'booking_id'::uuid;
`, { booking_id: invalidAdminReported.request.id });
assert(invalidAdminState.booking_status === "payment_review", "Invalid admin changed booking status.");
assert(invalidAdminState.payment_status === "reported", "Invalid admin changed payment status.");
assert(invalidAdminState.audit_count === 0, "Invalid admin created an audit row.");

const auditFailurePayload = buildHoldPayload({ checkIn: "2027-04-17", checkOut: "2027-04-19", label: "audit-failure" });
await acquireHold(auditFailurePayload);
const auditFailureReported = await reportPayment(auditFailurePayload);
await runSql(`
  create or replace function public.fail_test_booking_payment_admin_audit_insert()
  returns trigger
  language plpgsql
  as $$
  begin
    raise exception using errcode = 'P0001', message = 'forced_booking_payment_admin_audit_failure';
  end;
  $$;

  create trigger fail_test_booking_payment_admin_audit_insert
    before insert on public.booking_payment_admin_audit_logs
    for each row
    execute function public.fail_test_booking_payment_admin_audit_insert();
`);
const auditFailureResult = await attemptSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'confirmed')::text;",
  { booking_id: auditFailureReported.request.id, admin_id: adminId },
);
await runSql(`
  drop trigger fail_test_booking_payment_admin_audit_insert on public.booking_payment_admin_audit_logs;
  drop function public.fail_test_booking_payment_admin_audit_insert();
`);
assert(auditFailureResult.ok === false, "Forced audit insert failure unexpectedly succeeded.");
assert(auditFailureResult.error.includes("forced_booking_payment_admin_audit_failure"), "Forced audit failure was not surfaced.");
const auditFailureState = await runJsonSql(`
  select jsonb_build_object(
    'booking_status', request.status,
    'payment_status', payment.status,
    'audit_count', (
      select count(*)
      from public.booking_payment_admin_audit_logs audit
      where audit.booking_request_id = request.id
    )
  )::text
  from public.booking_requests request
  join public.booking_payment_records payment on payment.booking_request_id = request.id
  where request.id = :'booking_id'::uuid;
`, { booking_id: auditFailureReported.request.id });
assert(auditFailureState.booking_status === "payment_review", "Audit insert failure did not roll back booking status.");
assert(auditFailureState.payment_status === "reported", "Audit insert failure did not roll back payment status.");
assert(auditFailureState.audit_count === 0, "Audit insert failure left a partial audit row.");

const immutableAuditId = confirmAudit.id;
const auditUpdateAttempt = await attemptSql(
  "update public.booking_payment_admin_audit_logs set reason = 'tampered' where id = :'audit_id'::uuid;",
  { audit_id: immutableAuditId },
);
const auditDeleteAttempt = await attemptSql(
  "delete from public.booking_payment_admin_audit_logs where id = :'audit_id'::uuid;",
  { audit_id: immutableAuditId },
);
assert(auditUpdateAttempt.ok === false && auditUpdateAttempt.error.includes("booking_payment_admin_audit_is_append_only"), "Audit UPDATE was not blocked.");
assert(auditDeleteAttempt.ok === false && auditDeleteAttempt.error.includes("booking_payment_admin_audit_is_append_only"), "Audit DELETE was not blocked.");

const sensitiveAuditColumns = Number(await runSql(`
  select count(*)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'booking_payment_admin_audit_logs'
    and column_name in (
      'recovery_token',
      'recovery_token_hash',
      'account_number',
      'bank_last5',
      'payer_name',
      'before_data',
      'after_data'
    );
`));
assert(sensitiveAuditColumns === 0, "Payment admin audit schema contains sensitive or unnecessary payload columns.");

const expiredReviewPayload = buildHoldPayload({ checkIn: "2027-04-20", checkOut: "2027-04-22", label: "expired-review" });
await acquireHold(expiredReviewPayload);
const expiredReviewReported = await reportPayment(expiredReviewPayload);
await runSql(
  "update public.booking_requests set review_expires_at = clock_timestamp() - interval '1 second' where id = :'id'::uuid;",
  { id: expiredReviewReported.request.id },
);
const expiredReviewConfirmation = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'confirmed')::text;",
  { booking_id: expiredReviewReported.request.id, admin_id: adminId },
);
assert(
  expiredReviewConfirmation?.ok === false && expiredReviewConfirmation.code === "payment_review_expired",
  "Admin confirmation accepted an expired payment review.",
);
report.admin = {
  passed: true,
  confirmedBlocks: true,
  cancelledReleases: true,
  expiredReviewConfirmationRejected: true,
};
report.paymentAdminAudit = {
  passed: true,
  confirmAuditRows: confirmAudit.count,
  duplicateConfirmAuditRows: 1,
  paymentReviewCancellationAuditRows: cancelAudit.count,
  confirmedCancellationAuditRows: confirmedCancellationAudit.count,
  invalidAdminRejected: true,
  auditFailureRolledBack: true,
  appendOnly: true,
  sensitiveColumns: sensitiveAuditColumns,
};

await clearTestData();
const raceA = buildHoldPayload({ checkIn: "2027-05-01", checkOut: "2027-05-05", label: "race-a" });
const raceB = buildHoldPayload({ checkIn: "2027-05-01", checkOut: "2027-05-05", label: "race-b" });
const raceResults = await Promise.all([acquireHold(raceA), acquireHold(raceB)]);
assert(raceResults.filter((result) => result?.ok === true).length === 1, "Phase 1 hold race did not have exactly one winner.");
assert(
  raceResults.filter((result) => result?.code === "booking_temporarily_held").length === 1,
  "Phase 1 hold race did not return one temporary-hold conflict.",
);
report.phase1Regression = { passed: true, concurrentWinners: 1 };

await clearTestData();
const externalId = await runSql(`
  insert into public.booking_external_reservations (source, check_in, check_out, status)
  values ('booking_com', '2027-06-01', '2027-06-04', 'confirmed')
  returning id;
`);
await runSql(
  `insert into public.booking_availability_blocks (
    block_type, source, external_reservation_id, check_in, check_out, status
  ) values ('external_reservation', 'booking_com', :'external_id'::uuid, '2027-06-01', '2027-06-04', 'confirmed');`,
  { external_id: externalId },
);
const externalBlockedPayload = buildHoldPayload({ checkIn: "2027-06-02", checkOut: "2027-06-03", label: "external-blocked" });
assert((await acquireHold(externalBlockedPayload))?.code === "date_unavailable", "External reservation did not block a hold.");

await clearTestData();
const manualRacePayload = buildHoldPayload({ checkIn: "2027-06-10", checkOut: "2027-06-12", label: "manual-race" });
const manualRace = await runConcurrentInventoryWriters([
  `select public.acquire_villa_booking_hold('${JSON.stringify(manualRacePayload.request).replaceAll("'", "''")}'::jsonb)::text;`,
  `insert into public.booking_availability_blocks (block_type, source, check_in, check_out, status)
   values ('manual', 'manual', '2027-06-10', '2027-06-12', 'confirmed') returning id::text;`,
]);
const activeSources = Number(await runSql(`
  select
    (select count(*) from public.booking_requests
      where check_in < '2027-06-12' and check_out > '2027-06-10'
        and (status = 'confirmed' or (status = 'payment_hold' and hold_expires_at > now())))
    +
    (select count(*) from public.booking_availability_blocks
      where check_in < '2027-06-12' and check_out > '2027-06-10' and status = 'confirmed');
`));
assert(activeSources === 1, "Concurrent hold/manual writers left conflicting active inventory.");

await clearTestData();
await runSql(`
  insert into public.booking_availability_blocks (
    block_type, source, ical_uid, check_in, check_out, status
  ) values ('booking_ical', 'booking_ical', 'phase2-ical', '2027-06-20', '2027-06-22', 'confirmed');
`);
const icalBlockedPayload = buildHoldPayload({ checkIn: "2027-06-20", checkOut: "2027-06-22", label: "ical-blocked" });
assert((await acquireHold(icalBlockedPayload))?.code === "date_unavailable", "iCal materialized block did not block a hold.");
report.inventoryRegression = {
  passed: true,
  externalBlocked: true,
  manualConcurrentActiveSources: activeSources,
  icalBlocked: true,
};

const rateLimitKey = "f".repeat(64);
const firstRateLimit = await runJsonSql(
  "select public.consume_booking_payment_report_rate_limit(:'key', 2, 60)::text;",
  { key: rateLimitKey },
);
const secondRateLimit = await runJsonSql(
  "select public.consume_booking_payment_report_rate_limit(:'key', 2, 60)::text;",
  { key: rateLimitKey },
);
const blockedRateLimit = await runJsonSql(
  "select public.consume_booking_payment_report_rate_limit(:'key', 2, 60)::text;",
  { key: rateLimitKey },
);
assert(firstRateLimit?.allowed === true && secondRateLimit?.allowed === true, "Rate limiter blocked within its allowance.");
assert(blockedRateLimit?.allowed === false && blockedRateLimit.retry_after_seconds > 0, "Rate limiter did not block excess attempts.");
await runSql(
  "update public.booking_payment_report_rate_limits set expires_at = clock_timestamp() - interval '1 second' where key_hash = :'key';",
  { key: rateLimitKey },
);
const resetRateLimit = await runJsonSql(
  "select public.consume_booking_payment_report_rate_limit(:'key', 2, 60)::text;",
  { key: rateLimitKey },
);
assert(resetRateLimit?.allowed === true, "Rate limiter did not reset after the database deadline.");
report.rateLimit = {
  passed: true,
  allowedAttempts: 2,
  excessAttemptBlocked: true,
  databaseExpiryReset: true,
};

const privilegeAudit = await runJsonSql(`
  select jsonb_build_object(
    'anon_booking_update', has_table_privilege('anon', 'public.booking_requests', 'UPDATE'),
    'authenticated_booking_update', has_table_privilege('authenticated', 'public.booking_requests', 'UPDATE'),
    'anon_payment_report_rpc', has_function_privilege(
      'anon',
      'public.report_booking_bank_transfer(text,text,text,text,integer)',
      'EXECUTE'
    ),
    'authenticated_payment_report_rpc', has_function_privilege(
      'authenticated',
      'public.report_booking_bank_transfer(text,text,text,text,integer)',
      'EXECUTE'
    ),
    'service_payment_report_rpc', has_function_privilege(
      'service_role',
      'public.report_booking_bank_transfer(text,text,text,text,integer)',
      'EXECUTE'
    ),
    'anon_payment_review_rpc', has_function_privilege(
      'anon',
      'public.review_booking_bank_transfer(uuid,uuid,text)',
      'EXECUTE'
    ),
    'authenticated_payment_review_rpc', has_function_privilege(
      'authenticated',
      'public.review_booking_bank_transfer(uuid,uuid,text)',
      'EXECUTE'
    ),
    'service_payment_review_rpc', has_function_privilege(
      'service_role',
      'public.review_booking_bank_transfer(uuid,uuid,text)',
      'EXECUTE'
    ),
    'service_audit_select', has_table_privilege(
      'service_role',
      'public.booking_payment_admin_audit_logs',
      'SELECT'
    ),
    'service_audit_insert', has_table_privilege(
      'service_role',
      'public.booking_payment_admin_audit_logs',
      'INSERT'
    ),
    'service_audit_update', has_table_privilege(
      'service_role',
      'public.booking_payment_admin_audit_logs',
      'UPDATE'
    ),
    'service_audit_delete', has_table_privilege(
      'service_role',
      'public.booking_payment_admin_audit_logs',
      'DELETE'
    )
  )::text;
`);
assert(privilegeAudit.anon_booking_update === false, "anon can update booking status directly.");
assert(privilegeAudit.authenticated_booking_update === false, "authenticated can update booking status directly.");
assert(privilegeAudit.anon_payment_report_rpc === false, "anon can execute the payment report RPC.");
assert(privilegeAudit.authenticated_payment_report_rpc === false, "authenticated can execute the payment report RPC.");
assert(privilegeAudit.service_payment_report_rpc === true, "service_role cannot execute the payment report RPC.");
assert(privilegeAudit.anon_payment_review_rpc === false, "anon can execute the admin payment review RPC.");
assert(privilegeAudit.authenticated_payment_review_rpc === false, "authenticated can execute the admin payment review RPC.");
assert(privilegeAudit.service_payment_review_rpc === true, "service_role cannot execute the admin payment review RPC.");
assert(privilegeAudit.service_audit_select === true, "service_role cannot read payment admin audit rows.");
assert(privilegeAudit.service_audit_insert === false, "service_role can bypass the atomic RPC with a direct audit insert.");
assert(privilegeAudit.service_audit_update === false, "service_role can update append-only payment audit rows.");
assert(privilegeAudit.service_audit_delete === false, "service_role can delete append-only payment audit rows.");
report.privileges = { passed: true, ...privilegeAudit };

await clearTestData();
const rollbackAuditPayload = buildHoldPayload({ checkIn: "2027-07-25", checkOut: "2027-07-27", label: "rollback-audit" });
await acquireHold(rollbackAuditPayload);
const rollbackAuditReport = await reportPayment(rollbackAuditPayload);
const rollbackAuditConfirmation = await runJsonSql(
  "select public.review_booking_bank_transfer(:'booking_id'::uuid, :'admin_id'::uuid, 'confirmed')::text;",
  { booking_id: rollbackAuditReport.request.id, admin_id: adminId },
);
assert(rollbackAuditConfirmation?.ok === true, "Rollback audit fixture confirmation failed.");
assert(
  Number(await runSql("select count(*) from public.booking_payment_admin_audit_logs;")) === 1,
  "Rollback audit fixture row is missing.",
);

const rollbackActivePayload = buildHoldPayload({ checkIn: "2027-07-01", checkOut: "2027-07-03", label: "rollback-active" });
await acquireHold(rollbackActivePayload);
const rollbackActiveReport = await reportPayment(rollbackActivePayload);
const rollbackActiveDeadline = rollbackActiveReport.request.review_expires_at;

const rollbackExpiredPayload = buildHoldPayload({ checkIn: "2027-07-10", checkOut: "2027-07-12", label: "rollback-expired" });
await acquireHold(rollbackExpiredPayload);
const rollbackExpiredReport = await reportPayment(rollbackExpiredPayload);
await runSql(
  "update public.booking_requests set review_expires_at = clock_timestamp() - interval '1 second' where id = :'id'::uuid;",
  { id: rollbackExpiredReport.request.id },
);
assert(Number(await runSql("select count(*) from public.booking_payment_records;")) === 3, "Rollback fixture payment rows missing.");

await runFile(phase21RollbackPath);
await runFile(phase2RollbackPath);

const rollbackAudit = await runJsonSql(`
  select jsonb_build_object(
    'payment_records', (select count(*) from public.booking_payment_records),
    'active_status', (select status from public.booking_requests where id = :'active_id'::uuid),
    'active_deadline', (select hold_expires_at from public.booking_requests where id = :'active_id'::uuid),
    'expired_status', (select status from public.booking_requests where id = :'expired_id'::uuid),
    'expired_payment_status', (
      select payment.status
      from public.booking_payment_records as payment
      where payment.booking_request_id = :'expired_id'::uuid
    ),
    'payment_report_rpc_removed', to_regprocedure(
      'public.report_booking_bank_transfer(text,text,text,text,integer)'
    ) is null,
    'rate_limit_table_removed', to_regclass('public.booking_payment_report_rate_limits') is null,
    'payment_table_preserved', to_regclass('public.booking_payment_records') is not null,
    'payment_admin_audit_table_preserved', to_regclass('public.booking_payment_admin_audit_logs') is not null,
    'payment_admin_audit_rows', (select count(*) from public.booking_payment_admin_audit_logs),
    'booking_reference_preserved', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'booking_requests'
        and column_name = 'booking_reference'
    ),
    'status_constraint', (
      select pg_get_constraintdef(oid)
      from pg_constraint
      where conrelid = 'public.booking_requests'::regclass
        and conname = 'booking_requests_status_check'
    )
  )::text;
`, {
  active_id: rollbackActiveReport.request.id,
  expired_id: rollbackExpiredReport.request.id,
});
assert(rollbackAudit.payment_records === 3, "Rollback deleted payment records.");
assert(rollbackAudit.active_status === "payment_hold", "Rollback did not map an active review to payment_hold.");
assert(rollbackAudit.active_deadline === rollbackActiveDeadline, "Rollback changed the active review deadline.");
assert(rollbackAudit.expired_status === "expired", "Rollback did not map an elapsed review to expired.");
assert(rollbackAudit.expired_payment_status === "expired", "Rollback did not mark the elapsed payment record expired.");
assert(rollbackAudit.payment_report_rpc_removed === true, "Rollback left the Phase 2 payment report RPC installed.");
assert(rollbackAudit.rate_limit_table_removed === true, "Rollback left transient rate-limit state installed.");
assert(rollbackAudit.payment_table_preserved === true, "Rollback removed payment audit data storage.");
assert(rollbackAudit.payment_admin_audit_table_preserved === true, "Rollback removed immutable admin audit storage.");
assert(rollbackAudit.payment_admin_audit_rows === 1, "Rollback deleted immutable admin audit history.");
assert(rollbackAudit.booking_reference_preserved === true, "Rollback removed customer booking references.");
assert(!rollbackAudit.status_constraint.includes("payment_review"), "Rollback status constraint still allows payment_review.");
assert(await unavailableRangeCount("2027-07-01", "2027-07-03") === 1, "Phase 1 calendar did not block the mapped active hold.");
const rollbackRecovery = await recover(rollbackActivePayload);
assert(rollbackRecovery?.ok === true, "Phase 1 recovery did not recover the mapped active hold.");
assert(rollbackRecovery.request.hold_expires_at === rollbackActiveDeadline, "Phase 1 recovery changed the mapped deadline.");
const rollbackFreshPayload = buildHoldPayload({ checkIn: "2027-07-20", checkOut: "2027-07-22", label: "rollback-fresh" });
assert((await acquireHold(rollbackFreshPayload))?.ok === true, "Phase 1 acquire failed after rollback.");
report.rollback = {
  passed: true,
  paymentAuditRowsPreserved: rollbackAudit.payment_records,
  paymentAdminAuditRowsPreserved: rollbackAudit.payment_admin_audit_rows,
  activeReviewMappedToHold: true,
  expiredReviewMappedToExpired: true,
  phase2RpcRemoved: true,
  phase1CalendarAcquireRecoveryRestored: true,
};

console.log(JSON.stringify(report, null, 2));
