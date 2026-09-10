# AI Quality Production Activation

## A2.1-T2B Same-Session SET Qualification: PASS

2026-09-10; main / 114d513a221297e00b872e0693e92cdddc948660.
Only this runbook was dirty on entry. This section supersedes the historical
PGOPTIONS/startup-timeout command patterns in A2.1-T below. They are NOT valid
Production execution templates. Do not execute a migration in A2.1-T2B.

### Corrected Production Evidence

The owner supplied the preceding native psql T2 result:

- External CA verify-full: PASS; password authentication: PASS.
- Exact Session Pooler: aws-1-ap-northeast-1.pooler.supabase.com:5432.
- Client user postgres.jgmgniftiwngvljdeytt; database postgres.
- Three same-session backend PID observations: 6246, stable.
- statement_timeout=2min, lock_timeout=0: FAIL against required 10s/2s.
- application_name=Supavisor; startup PGAPPNAME is not a reliable identity marker.
- read_only=off meant no default read-only session setting, NOT a data write.
- Production schema/data writes=0; credential persistence=0.

These are owner-reported live Production observations, not substituted local
results. Supavisor did not propagate PGOPTIONS as expected. Do not lower the
timeout requirements or rely on PGOPTIONS, including on a fresh connection.

The authenticated project Dashboard was freshly checked in T2B:
mumbao-ai-chat / main PRODUCTION / jgmgniftiwngvljdeytt, status Healthy.
This is pre-proof health, NOT the required post-proof health check.

The existing repo-external CA E:/mumbao/certs/supabase-prod-ca.crt is a valid
CA within its validity period. It was not copied, moved or added to the repo.

### Completed Production Proof And Health After

The owner confirmed completion of the newly launched A2.1-T2B native psql
qualification. The old PROOF FINISHED output with 2min/0/off is NOT T2B evidence.
These Production SQL results were supplied by the owner after native password
entry; they were not inferred from the earlier local rehearsal:

| Production T2B check | Final result |
| --- | --- |
| SESSION_1_TIMEOUT | PASS |
| SESSION_2_FRESH | PASS; a new psql process reapplied SET/VERIFY |
| Same-session backend PID | Stable: YES. Numeric T2B PIDs were not supplied; do not reuse the earlier T2 PID 6246. |
| statement_timeout / lock_timeout | 10s / 2s |
| Qualification read-only | on |
| pg_sleep(11) timeout | 10,042.752 ms; SQLSTATE 57014 |
| Production schema/data writes | 0 |
| Password persisted | false |
| Production env changes | 0 |

After that owner confirmation, Codex opened a fresh authenticated Dashboard at
https://supabase.com/dashboard/project/jgmgniftiwngvljdeytt and read the loaded
project status. At 2026-09-10 13:11 UTC (21:11 Asia/Taipei), exact identity was
mumbao-ai-chat / main PRODUCTION / jgmgniftiwngvljdeytt; Database Health after
was **Healthy**. This was a read-only Dashboard check, not a SQL Editor Run,
psql reconnection, migration or ledger action.

The Dashboard also displayed two PostgreSQL errors in its last-60-minute
aggregate. No detailed logs were opened, so this closure does not attribute
those errors to a particular query or claim an error-free traffic window.
The required Database Health indicator itself was Healthy.

Together with the prior verified TLS/authentication, immutable local -f
rehearsal and ON_ERROR_STOP checks, this completes **A2.1-T2B GATE = PASS**.
The selected transport remains same-session SET + VERIFY + immutable -f,
with verify-full and the external CA, not PGOPTIONS timeout inheritance.

This closes transport qualification ONLY. A2.1 is NOT started or implicitly
reapproved. Stop and wait for explicit A2.1 reapproval; no migration, ledger,
Production env change, Quality flag activation, HMAC or scheduler action.

### Selected Strategy And Failure Boundary

Every invocation must itself perform session SET, fail-closed VERIFY, then
the authorized operation on that SAME connection. Never SET in one psql
process and run -f in another. Port 6543 is not an alternative for this proof.

The owner qualification below performs only read-only SQL and session-local
settings. A random, non-secret session GUC binds the initial PID to this
invocation; it is not a table, ledger, credential or persistent database setting.
A guard checks the marker/PID, database/user, 10s/2s and read-only=on before
the sleep. Any mismatch raises a SQL error and ON_ERROR_STOP stops psql.

Three output PIDs must also match. The timeout test must exit nonzero with
57014 at approximately ten seconds and must not execute its following SELECT.
Only that expected timeout permits a new psql process and a second native
owner password prompt. Every fresh process reapplies and verifies settings.
A pooler may reuse a backend PID across distinct connections; independence
is established by ending/restarting psql, not requiring unequal cross-session PIDs.

The requested application_name remains best-effort. Through Session Pooler
it is not reliable as a migration identity marker; do not weaken TLS or
change pooler to make it match.

Qualification uses default_transaction_read_only=on and verifies both default
and current transaction read-only. A future authorized migration invocation
must NOT use that qualification-only setting.

### New Local Same-Invocation Evidence

Reused PostgreSQL 17.6 at verified 127.0.0.1:55441, with no Production
connection or credential. Fresh local fixtures:
quality_t2b_pass_1789044052634 / quality_t2b_fail_1789044052634,
non-superuser BYPASSRLS owner quality_t2b_owner_1789044052634.
No PGOPTIONS was present in child environments.

| Proof | Result |
| --- | --- |
| SET -> guarded VERIFY -> original immutable -f -> guarded VERIFY | Four files PASS; 1A PID 9708/9708, 1B 22976/22976, 1C 26720/26720, hardening 5568/5568. Each before/after proof retained 10s/2s. |
| Immutable bytes | Four manifest SHA256 values matched checkpoint raw bytes before/after; original files executed by absolute -f path, no rewrite/copy. |
| Per-prefix contract | Tables/columns/indexes/functions: 7/85/29/8, 7/89/31/9, 7/94/34/14, 8/102/35/16. ACL violations=0, RLS/owners/indexes valid, evidence=0, final maintenance=1, exact permissions=2, synthetic core sentinel unchanged. |
| Timeout inside -f stdin synthetic input | pg_sleep(11) canceled after 10,042 ms, 57014, exit 3; following statement and following -c did not execute. |
| ON_ERROR_STOP after SET/VERIFY | Synthetic division error 22012, exit 3; later statement and following original foundation -f did not execute. Fresh failure DB Quality objects remained 0. |
| Fresh connection | Explicit SET/VERIFY PASS, PID 3604, 10s/2s without inherited PGOPTIONS. |
| Exact owner PowerShell control flow, local endpoint only | First PID 13092/13092/13092, read-only on, 57014 after 10,003.424 ms, exit 1. Fresh process PID 30076/30076/30076, settings/read-only valid, exit 0. |

One preliminary in-memory local guard used a SQL concatenation typo and
stopped with 42883 before the first -f. It was corrected in the harness only;
the zero-object precheck passed before the chain. No successful migration
prefix was replayed, and no migration file was changed.

The local successful databases are synthetic fixtures, not Production.
The local server was stopped with pg_ctl after these checks. Final raw-byte
checksum recheck passed for all four migrations; git diff --check passed.
No Production lock contention is authorized or needed. The Production
lock-timeout proof is same-session SHOW/current_setting=2s.

### Owner-Only Read-Only Qualification

Reviewed Windows PowerShell syntax follows. It contains no credential and
does not open any migration file. It removes named inherited PG overrides
without reading their values. psql -X avoids psqlrc; -W requests the owner's
native masked console prompt; pgpass/service-file persistence is disabled.
Only safe metadata/results and SQLSTATE are reported. Output parsing is
in-memory, not a log/artifact. The password is never supplied to PowerShell.

~~~powershell
$ErrorActionPreference = 'Stop'
$Psql = 'C:\Users\IAN\AppData\Local\Temp\codex-postgresql-client-17.11\runtime\pgsql\bin\psql.exe'
$Ca = 'E:\mumbao\certs\supabase-prod-ca.crt'
$HostName = 'aws-1-ap-northeast-1.pooler.supabase.com'
$PortNumber = '5432'
$Login = 'postgres.jgmgniftiwngvljdeytt'
$Database = 'postgres'
$BackendUser = 'postgres'
$PasswordFlag = '-W'
$ProductionProof = $true
$controls = @('PGPASSWORD','PGSERVICE','PGOPTIONS','PGAPPNAME','PGHOST','PGHOSTADDR',
 'PGPORT','PGUSER','PGDATABASE','PGSSLMODE','PGSSLROOTCERT','PGSSLKEY','PGSSLCERT',
 'PGSSLCRL','PGSSLCRLDIR','PGPASSFILE','PGSERVICEFILE','PGCONNECT_TIMEOUT',
 'PGCLIENTENCODING','PGREQUIRESSL','PGREQUIREAUTH','PGCHANNELBINDING','PGTARGETSESSIONATTRS',
 'PGGSSENCMODE','PGKRBSRVNAME','PGGSSLIB','PGSSLNEGOTIATION')
foreach ($name in $controls) {
 Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}
try {
 if (-not (Test-Path -LiteralPath $Psql -PathType Leaf)) { throw 'PSQL_MISSING' }
 if ($ProductionProof -and -not (Test-Path -LiteralPath $Ca -PathType Leaf)) { throw 'CA_MISSING' }
 $env:PGSSLMODE = $(if ($ProductionProof) { 'verify-full' } else { 'disable' })
 if ($ProductionProof) { $env:PGSSLROOTCERT = $Ca }
 $env:PGPASSFILE = 'NUL'
 $env:PGSERVICEFILE = 'NUL'
 $env:PGCONNECT_TIMEOUT = '10'
 $env:PGCLIENTENCODING = 'UTF8'
 $env:PGAPPNAME = 'mumbao-ai-quality-migration'
 $base = @('-X',$PasswordFlag,'-qAt','-P','pager=off','-v','ON_ERROR_STOP=1',
  '-v','VERBOSITY=sqlstate','-h',$HostName,'-p',$PortNumber,'-U',$Login,'-d',$Database)
 function Invoke-Qualification([string]$Phase, [bool]$SleepProbe) {
  $nonce = [guid]::NewGuid().ToString('N')
  $initial = "select json_build_object('label','PID_BEFORE','pid',pg_backend_pid(),'session_marker',set_config('mumbao.transport_guard','$nonce'||':'||pg_backend_pid()::text,false));"
  $guard = "select 1/(coalesce(current_setting('mumbao.transport_guard',true)='$nonce'||':'||pg_backend_pid()::text,false) and current_database()='$Database' and current_user='$BackendUser' and current_setting('statement_timeout')='10s' and current_setting('lock_timeout')='2s' and current_setting('default_transaction_read_only')='on' and current_setting('transaction_read_only')='on')::int;"
  $fields = "'pid',pg_backend_pid(),'database',current_database(),'user',current_user,'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout'),'default_read_only',current_setting('default_transaction_read_only'),'read_only',current_setting('transaction_read_only'),'application_name',current_setting('application_name')"
  $after = "select json_build_object('label','PID_AFTER',$fields);"
  $last = "select json_build_object('label','PID_FINAL',$fields);"
  $commands = @('-c',$initial,
   '-c',"SET statement_timeout='10s'",
   '-c',"SET lock_timeout='2s'",
   '-c',"SET default_transaction_read_only=on",
   '-c',$guard,
   '-c','SHOW statement_timeout',
   '-c','SHOW lock_timeout',
   '-c','SHOW default_transaction_read_only',
   '-c',$after,'-c','SELECT 1','-c',$last,'-c',$guard)
  if ($SleepProbe) {
   $commands += @('-c','\timing on','-c','SELECT pg_sleep(11)',
    '-c',"SELECT 'UNEXPECTED_FOLLOWUP'")
  }
  Write-Host "$Phase : enter the database password only in the native masked psql prompt."
  $ErrorActionPreference = 'Continue'
  $lines = @(& $Psql @base @commands 2>&1 | ForEach-Object { $_.ToString() })
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $records = @($lines | Where-Object { $_ -match '^\{' } | ForEach-Object { ConvertFrom-Json $_ })
  $states = @($lines | ForEach-Object {
   if ($_ -match '\b(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b') { $Matches[1] }
  })
  $timings = @($lines | ForEach-Object {
   if ($_ -match '^Time:\s+([0-9]+(?:\.[0-9]+)?)\s+ms') {
    [double]::Parse($Matches[1],[Globalization.CultureInfo]::InvariantCulture)
   }
  })
  $pidMatch = $records.Count -eq 3 -and @($records.pid | Select-Object -Unique).Count -eq 1
  $settingsMatch = $records.Count -eq 3
  foreach ($r in @($records | Select-Object -Skip 1)) {
   $settingsMatch = $settingsMatch -and $r.statement_timeout -eq '10s' -and
    $r.lock_timeout -eq '2s' -and $r.default_read_only -eq 'on' -and
    $r.read_only -eq 'on' -and $r.database -eq $Database -and $r.user -eq $BackendUser
  }
  $followupRan = @($lines | Where-Object { $_ -match 'UNEXPECTED_FOLLOWUP' }).Count -gt 0
  $elapsed = if ($timings.Count) { $timings[-1] } else { $null }
  $passed = $pidMatch -and $settingsMatch -and -not $followupRan
  if ($SleepProbe) {
   $passed = $passed -and $exitCode -eq 1 -and $states.Count -eq 1 -and
    $states[0] -eq '57014' -and $null -ne $elapsed -and $elapsed -ge 9500 -and $elapsed -lt 15000
  } else {
   $passed = $passed -and $exitCode -eq 0 -and $states.Count -eq 0
  }
  $safe = [ordered]@{
   phase=$Phase; result=$(if($passed){'PASS'}else{'STOP'});
   pids=@($records.pid); pid_stable=$pidMatch; settings_verified=$settingsMatch;
   statement_timeout=$(if($records.Count -ge 2){$records[1].statement_timeout}else{$null});
   lock_timeout=$(if($records.Count -ge 2){$records[1].lock_timeout}else{$null});
   qualification_read_only=$(if($records.Count -ge 2){$records[1].default_read_only}else{$null});
   application_name=$(if($records.Count -ge 2){$records[1].application_name}else{$null});
   exit_code=$exitCode; sqlstates=$states; sleep_elapsed_ms=$elapsed;
   followup_executed=$followupRan; schema_data_writes=0; password_persisted=$false
  }
  Write-Host ($safe | ConvertTo-Json -Compress)
  $lines=$null
  $records=$null
  if (-not $passed) { throw 'QUALIFICATION_STOP' }
 }
 Write-Host 'A2.1-T2B: read-only queries and session-local SET only. No migration.'
 Invoke-Qualification 'SESSION_1_TIMEOUT' $true
 Write-Host 'First psql process ended. The second process requires a new native password entry.'
 Invoke-Qualification 'SESSION_2_FRESH' $false
 Write-Host 'T2B_SQL_PROOF_PASS; DB_HEALTH_AFTER_REQUIRES_SEPARATE_VERIFICATION'
} catch {
 Write-Host 'T2B_STOP; no migration or follow-up write is allowed.'
} finally {
 foreach ($name in $controls) {
  Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
 }
 Write-Host 'PRODUCTION_SCHEMA_DATA_WRITES=0; SECRET_PERSISTENCE=0; ENV_CHANGES=0'
}
~~~

The password prompt uses the native Windows console, independently of captured
safe SQL output; password echo is disabled by psql. See PostgreSQL's
[console prompt implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/common/sprompt.c)
and [psql reference](https://www.postgresql.org/docs/17/app-psql.html).
Do not substitute Read-Host password capture, a connection URI password,
PGPASSWORD, a password file, a transcript or any credential-bearing argument.

### Future Immutable File Pattern: Not Authorized In This Round

After successful Production T2B proof AND separate A2.1 reapproval only:

1. Recheck exact project/health, clean checkpoint, all four checksums,
   collisions, core metadata snapshot, flags OFF and approved ledger strategy.
2. Start a fresh verified-TLS Session Pooler psql process with -X,
   ON_ERROR_STOP=1, and the owner's native password prompt.
3. In that invocation: -c "SET statement_timeout='10s'; SET lock_timeout='2s';"
   followed by an identity/PID/settings guard. Require transaction_read_only=off
   for migration, without setting any persistent database configuration.
4. In the SAME invocation: -f "<original absolute immutable migration path>",
   then the post-file PID/timeouts proof; no -1/--single-transaction because
   each original migration owns BEGIN/COMMIT.
5. Require exit zero, exact prefix/core/ACL verification, then the separately
   approved ledger attestation; only then proceed to the next phase.
6. Any failure, timeout, uncertain commit, PID/settings mismatch or lost
   connection means STOP. No repair SQL, DROP, replay or automatic retry.

Production T2B same-session SET, sleep cancellation and fresh-session output
are owner-confirmed PASS. The post-proof authenticated Dashboard check above
confirmed Healthy. Local results alone were not used to certify Production.
A2.1-T2B GATE: PASS; ready to request separate A2.1 reapproval: YES.
No A2.1 execution is authorized by this qualification closure.

Production migrations/ledger/schema/data writes=0; Production env changes=0;
DeepSeek calls=0; flags/HMAC/scheduler untouched. No credential was read or
persisted by Codex. Only this runbook is modified; no code, test, migration,
FAQ, pricing, booking or certificate change.


## A2.1-T Migration Transport Qualification: STOP / FAIL

2026-09-10; branch main; HEAD 114d513a221297e00b872e0693e92cdddc948660.
Initial working tree clean. This section supersedes the SQL Editor transport
selection below; the immutable artifact manifest and schema contract remain
unchanged. This is NOT authorization to resume A2.1 or to execute Production
migrations, ledger bootstrap/attestations, permission seeds or maintenance.

### SQL Editor Root Cause And Prohibition

The preceding A2.1 attempt stopped before all schema/data/ledger writes.
Database-source SQL Editor Run set statement_timeout=10s and lock_timeout=2s
on backend PID 4191480. The next Run used PID 4191483 and reported 2min / 0.
Those settings were session-local, not persistent settings or Production env.

**Forbidden: SET in one SQL Editor Run, then migration in another Run.**
One editor tab is not one PostgreSQL connection. No cross-Run PID/timeout
inheritance may be assumed, even if two adjacent queries happen to match.
Do not weaken either timeout, edit committed SQL, or use transaction pooler
6543/serverless pooling to bypass this failure.

### Transport Inventory And Current Blockers

The authenticated Dashboard identifies mumbao-ai-chat / main PRODUCTION,
project jgmgniftiwngvljdeytt. Database Health was Healthy before and after this
qualification. Only Connect/health UI was read; no SQL Editor Run occurred
in A2.1-T. This Dashboard identity is NOT yet authenticated psql identity proof.

| Option | Observed endpoint category / port | Current evidence |
| --- | --- | --- |
| A, preferred | Project-specific db.*.supabase.co / 5432, Direct | Windows DNS resolves an AAAA record. IPv6 TCP attempt returned ENETUNREACH; unavailable from this host/network. Node default lookup first returned ENOTFOUND, not proof that the project lacked DNS. |
| B, candidate only | aws-1-ap-northeast-1.pooler.supabase.com / 5432, Supavisor SESSION MODE | Exact host copied as non-secret metadata from Connect, not inferred from region. Three resolved IPv4 addresses accepted TCP connections; authentication/session semantics remain unproved. |
| C, not qualified | SQL Editor single execution | Not selected while B awaits credentials and TLS trust. No Production wrapper experiment performed. |

No software was installed. Existing client:
C:/Users/IAN/AppData/Local/Temp/codex-postgresql-client-17.11/runtime/pgsql/bin/psql.exe
reports PostgreSQL 17.11. It is not on PATH; use its absolute path. Existing
local server is native PostgreSQL 17.6, matching the last verified Production
engine. Version availability is verified, not a new installation permission.

SUPABASE_DB_URL, PGPASSWORD, PGSERVICE and PGPASSFILE were NOT SET in the Codex
execution process. Only presence was checked; no credential value was read.
No .env, pgpass, service file, Vercel secret or credential store was opened.

A passwordless psql session-pooler probe used -w, PGPASSFILE=NUL,
PGSERVICEFILE=NUL, PGSSLMODE=verify-full, PGSSLROOTCERT=system, startup timeouts
and default_transaction_read_only=on. It exited 2 at TLS trust verification;
SELECT 1 did not run and no password was supplied. A separate PostgreSQL SSL
handshake using the default Windows SslStream verifier also failed. This does
not establish a particular certificate/root/interception root cause. No
certificate-validation bypass, trust-store change or software install occurred.

**B is a proposed candidate, not a certified transport.** Remaining blockers:
verified TLS trust for the exact endpoint and a safely supplied existing DB
credential. Production PID, startup settings, identity and pg_sleep proof are
NOT RUN. A local proof cannot satisfy these Production gates.

Direct is preferred for native migrations; shared session mode is the IPv4
alternative. The documented host/port distinction is confirmed by the
[Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

### Completed Local Psql Rehearsal

Reused the previously installed isolated server, bound only to 127.0.0.1:55441.
pg_ctl start hit a Windows restricted-token error; the same existing binary
started with Start-Process -WindowStyle Hidden. No software was installed.
Verified localhost address, port, PostgreSQL 17.6 and bootstrap identity before
creating fresh synthetic databases and a non-superuser BYPASSRLS login role.
No Production connection string or password was used by this harness.

Local-only retained test databases:
quality_a21t_pass_1789036942256 and quality_a21t_fail_1789036942256.
They are in the pre-existing OS TEMP cluster, not repo files or Production.
The server was stopped with pg_ctl after testing; no test session remains.
No local or Production ledger was created in this qualification.

Every client invocation used -X, -w, ON_ERROR_STOP=1 and an explicit local
host/port/database/user. Child environment was allowlisted; no inherited DB
credential/config was used. PGOPTIONS supplied both timeouts at connection
startup, PGAPPNAME=mumbao-ai-quality-migration, PGCLIENTENCODING=UTF8.
Local SSL was disabled only for the explicitly verified loopback fixture;
that choice is NOT the proposed Production TLS configuration.

| Local proof | Measured result |
| --- | --- |
| Separate -c commands within one invocation | Same PID 15020; SHOW and current_setting both 10s / 2s; SELECT 1 succeeded; application_name matched. |
| pg_sleep(11) | Cancelled at 10,036 ms, SQLSTATE 57014; later command did not run; a fresh startup-configured session succeeded. |
| ON_ERROR_STOP script | Synthetic stdin script SELECT 1/0 exited 3 / 22012; next statement AND following original -f foundation file did not execute. |
| Lock timeout | Local-only lock held by an acknowledged separate local connection; psql SELECT timed out at 2,040 ms / 55P03. No Production table lock was taken. |
| Complete immutable chain | Four original absolute -f paths applied once each, with per-file verification before advancing; no copy/rewrite/concatenated migration file. |
| Partial failure | Separate clean synthetic DB intentionally lacked admin_permissions. 1A/1B succeeded, original 1C exited 3 / 42P01, hardening was never invoked. |

Observed psql -c query errors exited **1**, whereas errors in -f scripts
exited **3**. Any nonzero exit, signal, connection failure or absent verification
is STOP; do not accept only one numeric failure code. An initial local harness
assertion expecting 3 for -c was corrected to this observed CLI distinction.
An initial text rendering assertion used inet::text (which includes /32);
host(inet_server_addr()) now checks the exact loopback address. The lock test
uses server acknowledgment, not a buffered multi-command output marker.
These were in-memory harness corrections, not runtime/migration/test edits.

| Prefix | Tables | Columns | Indexes | Functions | Policies | PID before/after same -f |
| --- | --- | --- | --- | --- | --- | --- |
| 1A | 7 | 85 | 29 | 8 | 0 | 11632 / 11632 |
| 1A+1B | 7 | 89 | 31 | 9 | 0 | 24336 / 24336 |
| 1A+1B+1C | 7 | 94 | 34 | 14 | 0 | 21912 / 21912 |
| Full chain | 8 | 102 | 35 | 16 | 0 | 30960 / 30960 |

Each prefix checked all eight table privileges for anon/authenticated/service_role,
PUBLIC ACL absence, function browser/PUBLIC EXECUTE denial, service-role EXECUTE,
trusted owner/fixed search_path, RLS, valid/ready indexes, three user triggers,
zero evidence rows and unchanged synthetic core sentinel. Permission count was
0/0/2/2 with exact approved descriptions. Final maintenance seed count=1 and
all initial fields matched. No privacy/runtime write RPC was called.

All four SHA256 values matched the manifest and checkpoint raw bytes before
execution and again afterward. Partial-failure DB retained exactly the verified
1A/1B metadata hash, 89 columns and no Phase C partial columns; maintenance
table absent. Attempted phases=[1,2,3], successful=[1,2], replayed prefixes=0,
next phase invocations=0, ledger writes=0. No failed prefix was repaired.

### Safe Command Pattern: Prepared, Not Executed In Production

Use a separate owner-controlled PowerShell process with no inherited PG
credential/service/connection overrides. Do not print the environment. Prefer
psql's own masked -W password prompt, entered by the owner, not a password/URI
argument. No password belongs in PowerShell history, .env, logs or this document.
Temporary credential env, if separately supplied, must be process-scoped and
cleared in finally; no credential was supplied or persisted in A2.1-T.

The following is a **read-only qualification template**, blocked until the
owner has a verified trusted CA configuration and an existing DB password.
It does not download/install a CA or disable TLS verification. A CA path is
public configuration, not a credential. Do not run a migration with this block.

~~~powershell
$ErrorActionPreference = 'Stop'
$Psql = 'C:\Users\IAN\AppData\Local\Temp\codex-postgresql-client-17.11\runtime\pgsql\bin\psql.exe'
$Ca = 'REPLACE_WITH_VERIFIED_PUBLIC_CA_FILE_PATH'
if (-not (Test-Path -LiteralPath $Ca -PathType Leaf)) { throw 'VERIFIED_CA_REQUIRED' }
$controls = @('PGOPTIONS','PGAPPNAME','PGSSLMODE','PGSSLROOTCERT','PGPASSFILE',
  'PGSERVICEFILE','PGCONNECT_TIMEOUT','PGCLIENTENCODING')
foreach ($name in ($controls + @('PGPASSWORD','PGSERVICE','PGHOSTADDR','PGSSLKEY','PGSSLCERT'))) {
  if (Test-Path -LiteralPath "Env:$name") { throw 'USE_FRESH_PROCESS_WITHOUT_PG_OVERRIDES' }
}
try {
  $env:PGOPTIONS = '-c statement_timeout=10000 -c lock_timeout=2000 -c default_transaction_read_only=on'
  $env:PGAPPNAME = 'mumbao-ai-quality-migration'
  $env:PGSSLMODE = 'verify-full'
  $env:PGSSLROOTCERT = $Ca
  $env:PGPASSFILE = 'NUL'
  $env:PGSERVICEFILE = 'NUL'
  $env:PGCONNECT_TIMEOUT = '5'
  $env:PGCLIENTENCODING = 'UTF8'
  $base = @('-X','-W','-qAt','-P','pager=off','-v','ON_ERROR_STOP=1',
    '-v','VERBOSITY=sqlstate','-h','aws-1-ap-northeast-1.pooler.supabase.com',
    '-p','5432','-U','postgres.jgmgniftiwngvljdeytt','-d','postgres')
  $proof = "select json_build_object('pid',pg_backend_pid(),'database',current_database(),'user',current_user,'version',current_setting('server_version'),'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout'),'read_only',current_setting('transaction_read_only'),'app',current_setting('application_name'));"
  & $Psql @base -c $proof -c 'SHOW statement_timeout' -c 'SHOW lock_timeout' -c $proof -c 'SELECT 1'
  if ($LASTEXITCODE -ne 0) { throw 'QUALIFICATION_STOP' }
  # Stop here for identity/PID/settings review before the separately approved sleep probe.
} finally {
  foreach ($name in $controls) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
}
~~~

The reviewed continuation uses a new safe invocation with the SAME startup
settings and -c "SELECT pg_sleep(11)". Require 57014 at about 10 seconds and
nonzero exit; no arbitrary SQL-error chain in Production. Then open another
new safe invocation and recheck PID/settings/SELECT 1. Do not mistake this
expected cancellation for unhealthy DB or continue on any other failure.
Production lock proof is only current_setting('lock_timeout')=2s, never contention.

Before accepting identity, compare current_database/current_user/version and
safe core metadata against the authenticated Dashboard's exact project. For
stronger session binding, keep the psql connection open and read its application
name/PID/backend_start from pg_stat_activity in that authenticated project's
SQL Editor (no query text or customer data). A host label or matching generic
database name/version alone is insufficient. This proof remains NOT RUN.

After a future explicit A2.1 reapproval only, the file-apply pattern is:
connection startup PGOPTIONS (10s/2s, without the qualification read-only flag)
and verified TLS + `psql -X -v ON_ERROR_STOP=1 -c <identity/settings guard>
-f <original absolute approved file path> -c <post-file settings proof>`.
The guard must fail closed on wrong identity/timeouts, not merely print them.
Local rehearsal kept one connection over each file; separate invocations may
use different PIDs because EVERY connection gets checked startup configuration.
Never place the password or a secret connection URI in any argument.

Do not add -1/--single-transaction: the approved files already contain their
own BEGIN/COMMIT. Startup options belong to libpq/runner configuration, never
migration content. These psql behaviors are documented in the
[psql reference](https://www.postgresql.org/docs/17/app-psql.html) and
[libpq environment reference](https://www.postgresql.org/docs/17/libpq-envars.html).

### Future Apply / Verify / Ledger Sequence

All steps remain unexecuted in Production. First reapprove the certified
transport, exact four checksums and the already-designed separate ledger.
Repeat health, identity, flags OFF, collisions, permission dependency and core
snapshot; bootstrap/verify only the approved owner-only ledger once.

For each phase in explicit 1A -> 1B -> 1C -> hardening order:

1. Require the exact already-verified prefix and ledger; verify committed bytes.
2. Open a safely configured connection; enforce identity/settings before -f.
3. Apply the one original file exactly once; require zero psql exit.
4. Run the complete read-only prefix/core/ACL checks; require PASS.
5. In a distinct, bounded operation, insert only that filename/SHA attestation.
6. Read back the exact ledger prefix; only then consider the next phase.

No next migration shares a command batch with the preceding ledger insert.
No automatic skip, retry, repair, rollback DROP or replay. Artifact commit and
ledger attestation are separate transactions: an uncertain commit/ledger gap
means STOP and separately approved reconciliation, never a guessed ledger row.

### SQL Editor Emergency Fallback

Cross-Run SET is permanently disqualified. A same-Run wrapper is NOT certified
by that statement: PostgreSQL does not provide nested transactions merely by
stacking BEGIN/COMMIT, and these files already own their boundaries. No wrapper
was executed, no artifact was concatenated/reformatted, and no emergency path
is approved. Consider C only after A/B are genuinely unavailable and an exact
single-execution/backend/timeout/transaction-compatible local proof is approved.
Missing credentials alone are not permission to bypass B's safety gates.

### A2.1-T Verdict And Minimal Owner Step

Local transport rehearsal PASS; overall **A2.1-T GATE FAIL / BLOCKED**.
Next minimal owner action: resolve trusted TLS validation for the observed
Session pooler endpoint using a verified CA configuration, then supply the
existing database password only through the owner's masked psql prompt or an
explicitly authorized temporary process environment. Never paste it into chat.
Share only the safe qualification output, not the credential. Rerun the missing
Production read-only proofs before requesting A2.1 again. Recommend A2.1 now: NO.

Production CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/GRANT/REVOKE/TRUNCATE=0;
Production migration/ledger/permission/maintenance writes=0; Production SQL
queries via psql=0 (TLS failed before authentication/query); env changes=0;
Quality flags unchanged; HMAC/scheduler untouched; DeepSeek/LLM calls=0.
No credential was acquired, exported or persisted. No Production env was read.
Only this runbook is modified; no migration/runtime/FAQ/pricing/test file changed.
OS TEMP artifacts are synthetic PostgreSQL state and the attempted local server
log only; no script/credential/secret artifact was generated in the repository.

## A2.0.1 Production Readiness Closure

2026-09-10; checkpoint main / 7052205d8eb88f201bf40f3baac38e63b05dc22e.
Initial dirty inventory contained only this A2.0 runbook. No reset, stash,
restore or clean. This section supersedes A2.0's stopped findings below.
Production remained read-only; all apply/ledger SQL in this section is a
future plan, NOT permission to execute A2.1.

### Fresh PostgreSQL 17.6 Privilege Proof

Used a disposable native PostgreSQL **17.6**, matching the Production engine
version, on 127.0.0.1:55441. Tools were installed only under OS TEMP:
@embedded-postgres/windows-x64 17.6.0-beta.15 and pg 8.16.3, install scripts
disabled. The earlier client-only 17.11 installation lacked server share
files and was not used for certification. No project dependency changed.

The inline local runner accepted no connection URL/remote host/credential,
cleared named PG credential/config variables in its own process without reading
values, fixed localhost/port and an empty password callback, and verified
server address, port and the dedicated bootstrap role before creating any DB.
The migration executor was a non-superuser BYPASSRLS role named
quality_migration_owner, equivalent in the relevant attributes to Production
postgres. Each profile used a separate fresh database. Required Admin table
shape matched the observed Production metadata; no unrelated old migration
was replayed. A synthetic core-table sentinel was also included.

The four files were read as bytes, SHA256 checked against the manifest below,
and compared byte-for-byte with git show at the approved checkpoint. All are
UTF-8 without BOM and use LF. The complete SQL of each file was sent unchanged
as one request, in A -> B -> C -> hardening order. No post-migration manual
REVOKE or other repair was performed.

| Fresh profile | Defaults present BEFORE applying Quality | Result |
| --- | --- | --- |
| postgres_observed | anon/authenticated table TRUNCATE, REFERENCES, TRIGGER, MAINTAIN; built-in PUBLIC function EXECUTE | PASS |
| broader_owner | anon/authenticated ALL table and sequence privileges plus function EXECUTE, equivalent to the observed broader creator defaults | PASS |
| public_stress | Broader profile plus PUBLIC ALL table privileges and PUBLIC function EXECUTE | PASS |

A non-Quality probe table/function first demonstrated that the dangerous
defaults really applied. The defaults and existing dependency/core-table
metadata were unchanged after the chain. No blanket public-schema ACL repair
was used. The local cluster was stopped after testing; no server remains active.

Per profile, final assertions were **256/256 table privilege checks** and
**64/64 function privilege checks**. Across the final three profiles:
768/768 and 192/192 respectively. Each table was checked for all eight PG17
privileges using has_table_privilege, including MAINTAIN. A role with only
PUBLIC inheritance tested effective PUBLIC access in addition to inspecting
aclexplode/acldefault directly. information_schema.role_table_grants independently
returned zero PUBLIC/anon/authenticated entries.

| Principal | Eight Quality tables | Sixteen Quality functions |
| --- | --- | --- |
| anon | All eight privileges denied | EXECUTE denied |
| authenticated | All eight privileges denied | EXECUTE denied |
| PUBLIC-only probe | All eight privileges denied; explicit PUBLIC ACL empty | EXECUTE denied; explicit/default PUBLIC ACL empty |
| service_role | CRUD on seven evidence tables; SELECT only on maintenance state; no extra privileges | EXECUTE allowed |

Every intermediate committed prefix also denied browser/PUBLIC access:
168 checks after A, 168 after B, 168 after C, 192 after hardening, per profile.
The eight tables have RLS enabled and zero policies. Seven evidence tables
are empty; the sole maintenance seed has the exact critical/null/zero initial
state. Two Admin permission seeds match code/module/action/description.

**Default ACL blocker: PASS under the newly approved A2.0.1 rule.**
Global default ACLs are broad, but the Quality chain explicitly resets ACLs
at the object level when creating/replacing affected tables/functions;
fresh simulation proves final PUBLIC/anon/authenticated effective privileges
are zero. No new privilege-hardening migration is needed or was created.

### SECURITY DEFINER And Production Dependencies

Production still resolves to project jgmgniftiwngvljdeytt, main / Production,
postgres database, postgres role, PostgreSQL 17.6, not in recovery.
The 39 public functions observed are owned by postgres (31 definers, eight
invokers). This is an owner-pattern observation, not a blanket security
certification of old functions.

Production has_schema_privilege confirms anon/authenticated/service_role
cannot CREATE in public or extensions; postgres can. anon/authenticated do
not inherit postgres or service_role. The future executor must remain
postgres; switching creator/role requires a new preflight.

The local final 16 Quality functions all have the expected signatures, six
invokers/ten definers, trusted non-superuser BYPASSRLS ownership, fixed
public,pg_temp search_path and expected EXECUTE ACLs. A service-role caller
with search_path=pg_temp and a conflicting temporary conversations table
could not redirect the public read-overview RPC. No Quality runtime function
uses caller-controlled dynamic relation/function names. Migration DO blocks
use fixed server-authored table lists and identifier quoting, not user input.
Fixed trusted paths and revoking default PUBLIC EXECUTE follow the
[PostgreSQL SECURITY DEFINER guidance](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

Production permission dependency is now fully checked:

| Item | Observed result |
| --- | --- |
| ai_quality.view | Absent; no conflicting semantic row |
| ai_quality.review | Absent; no conflicting semantic row |
| Existing permissions | 38 rows; all 38 use code=module.action |
| Shape | code/module/action NOT NULL text; description nullable text; created_at NOT NULL timestamptz default now() |
| Owner / RLS | postgres / enabled |
| Index / constraint | One B-tree unique PRIMARY KEY(code); no other index |
| User triggers | None |
| Size | 16,384 table bytes + 16,384 index bytes = 32,768 total |
| Row estimate | reltuples=-1 (unknown); direct bounded-table count verified 38 |
| Locks at inspection | Zero ungranted relation locks |

**Lock risk LOW for the approved two seed inserts**, not a guarantee against
future concurrent writers. C uses INSERT ... ON CONFLICT(code) DO NOTHING,
not an ALTER, full update or backfill of admin_permissions. Recheck locks and
keys immediately before execution and use a bounded statement timeout.
No existing permission row was changed. All table/function/type/index/policy/
constraint/trigger/view/sequence Quality collision checks remain zero.

### Health And Recovery

Dashboard is now **Healthy**, Primary Database nano, Tokyo. At the observed
sample CPU 2%, disk 14%, RAM 50%, connections 8/60. The SQL sample connected
successfully, reported max_connections=60, ten connections, one active and
zero idle-in-transaction. Dashboard Postgres showed zero warnings/errors in
its selected last-60-minute window. API Gateway/Auth each showed one warning,
not a database-error diagnosis. No restart, pause/resume or repair occurred.
The cause of the prior Unhealthy badge remains UNKNOWN; this blocker closes
because health recovered, not because a UI-only cause was invented.

Scheduled-backups page explicitly says Free Plan does not include project
backups; overview says No backups. PITR page offers a Pro add-on and is not
enabled. There is no verified latest backup time, downloadable snapshot or
restore point; external backups remain UNKNOWN. Nothing was created/exported.

This limitation is disclosed for the owner's schema-only risk decision.
Recovery is containment: flags OFF, no observers/users writing new Quality
data, preserve verified prefixes, never touch core data to repair Quality.
The four files have transaction boundaries and affect new Quality objects
plus two permission seeds. Hardening DOES drop/rebuild a generated Quality
expiry column/index; do not claim the SQL contains no DROP whatsoever.
Those operations are acceptable only on the newly created, verified-empty
Quality table. No destructive operation targets existing Booking/Payment/chat.
Unexpected existing Quality rows are an absolute STOP, not permission to delete.
Flags OFF are not a database backup and cannot undo an accidental core change.

### Ledger Decision And Canonical Method

Repo audit covered package scripts, tracked config/CI/README/docs/scripts,
both migration directories and migration comments, plus relevant Git history.
No ledger-aware Production runner, Supabase config or CI migration job was
found. Existing runner scripts are local synthetic tests, not deployment tools.
The Dashboard has no repository connection and no migration ledger entries;
catalog shows no supabase_migrations relations while existing schema is present.
The exact historic operator/tool is UNKNOWN. The evidence supports untracked
schema application, not a fabricated complete file-to-Production mapping.

**Select method C for the new Quality-only workflow:** authenticated Dashboard
SQL Editor, full immutable files in explicit order, per-file read-only
verification, plus an independent Quality-only ledger. This is a newly
documented bounded method, not a claim to have discovered a historic canonical
runner. The native 17.6 rehearsal proves the unchanged full-file execution and
transaction/ACL result; Production UI writes are intentionally not rehearsed.

Do not use db push, baseline/repair the whole repo, rename historical files,
select files by glob/date sort, or replay unrelated migrations. The absence of
a ledger is not itself a prohibition on new schema; it prohibits pretending
that CLI history is reconciled. See the
[Supabase migration/history workflow](https://supabase.com/docs/guides/deployment/database-migrations).

#### Dedicated Ledger Design Only

Proposed A2.1-only bootstrap, NOT executed locally or in Production here:

~~~sql
begin;
create table public.ai_quality_schema_migrations (
  filename text primary key,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now()
);
alter table public.ai_quality_schema_migrations enable row level security;
revoke all privileges on public.ai_quality_schema_migrations
  from public,anon,authenticated,service_role;
commit;
~~~

Use no IF NOT EXISTS: an unexpected ledger must stop for inspection, not be
silently reused. Owner postgres; no runtime API, PUBLIC policy, public/server
DML grant or new function. Only the migration owner can attest application.
Four rows ultimately identify only the four Quality artifacts by exact
filename/SHA; this ledger never claims the historic whole-repo chain is applied.
The bootstrap itself is approved as this explicit runbook block and separately
verified. It is not a fifth privilege-hardening migration.

**Ledger is a ninth metadata table**, separate from eight runtime Quality
tables. Final ledger count=4; business/evidence rows=0; maintenance count=1.
With this ledger the overall Quality namespace would have 9 tables, 105
columns, 36 indexes, 16 functions and zero policies. Existing A2.0 eight-table
counts/privilege queries must exclude ai_quality_schema_migrations and verify
its three columns, PK, RLS and owner-only ACL separately. Never loosen an
assertion by silently including/excluding an unexpected object.

Each artifact already COMMITs. Ledger attestation AFTER read-only verification
is deliberately a separate transaction, not falsely described as atomic with
the artifact. A disconnect between commit and ledger row is an uncertain apply:
STOP; no blind rerun and no automatic history repair. See resume rules below.
The ledger can attest an approved execution, not cryptographically prove which
SQL ran solely from its stored hash. File/payload identity AND object checks
provide that evidence; never record a row solely because its filename is known.

### Exact A2.1 Run Plan: Prepared, Not Executed

Approval must explicitly cover the four immutable files, the separate ledger
bootstrap/attestations above, this non-atomic ledger boundary, and the disclosed
lack of a verified backup. It does not authorize flags, runtime smoke writes,
cleanup, aggregate, deployment or unrelated global privilege changes.

1. Recheck target jgmgniftiwngvljdeytt / main Production / postgres / PG17.6.
   Require Healthy/connectivity, no conflicting permissions writer, and
   owner-confirmed Quality flags OFF/unset. This turn did not read env values.
2. Repeat the read-only dependency/collision/default-ACL/role checks. Both
   permission keys must still be absent (or separately reviewed exact matches).
   No Quality object, including a ledger, is silently reusable.
3. Recompute the four checksums below, verify committed bytes and explicit
   order; do not stage/run any unrelated file. Capture a fresh core baseline
   with the exact snapshot SELECT below and preserve its safe result.
4. In the authenticated Dashboard SQL Editor's Database connection, verify
   postgres again. Use a bounded statement timeout (10s) and lock timeout (2s)
   as separately authorized A2.1 session settings. Recheck the settings on
   each new editor connection; do not assume a pooled session keeps them.
   These settings were NOT applied to Production in A2.0.1.
5. Execute ONLY the entire approved ledger-bootstrap block. Verify three
   columns, PK(filename), owner postgres, RLS=true, zero rows and no privileges
   for PUBLIC/anon/authenticated/service_role. Any failure: STOP.
6. Replace the complete editor buffer (Ctrl+A); load the exact entire Phase
   1A file, not a selected fragment and not any prior saved query. Verify the
   submitted text is identical to the SHA-checked UTF-8/LF source; no added
   commentary or line-ending/content rewrite. Execute its BEGIN...COMMIT once.
7. Run read-only prefix verification and compare the core baseline. Only
   after complete PASS, insert one ledger attestation using the exact 1A
   filename/SHA from the manifest. Read it back and require exactly one row.
8. Repeat full-buffer/full-file execution for 1B, then prefix/core verification,
   then its sole ledger attestation. Ledger ordered by approved manifest: A/B.
9. Repeat for 1C. Additionally verify the two exact permission seeds and that
   permission count changed only as expected. Ledger prefix: A/B/C.
10. Verify Quality evidence still empty. Execute the entire hardening file,
    then verify final eight-table contract, maintenance seed, all 16 function
    signatures/paths/body hashes, 35 indexes/102 columns, all ACLs and core
    metadata unchanged. Only then attest hardening; ledger has exactly 4 rows.
11. Final read-only ledger, ACL, identity/health and core-baseline comparison.
    Report schema-only outcome and leave all flags OFF. Do not test write RPCs,
    enable customer feedback, register cron or start Observer Canary here.

The four migrations each have their own BEGIN/COMMIT; no chain-wide atomicity
is claimed. UI/client timeout does not tell whether the server committed.
An artifact executes only once; no automatic retry. Existing scripts do not
apply migrations at Vercel build/deploy time, and no such behavior is added.

#### Local Checksum Command

This command only reads the exact local artifacts. It is not a DB command.

~~~powershell
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'E:\mumbao\newCode\mumbao-universe'
$manifest = @(
  @('2026-09-09-ai-quality-foundation.sql', 'f1ef296f6b77addb0461a82c19ea13c4ef2f41d783c7290fb70dfadfd5e5e637'),
  @('2026-09-09-ai-quality-runtime-observer.sql', 'f18a1fbc61eeefc5bd15e4a741cfd88c5e374e464eea3d89e99193493fcd59c1'),
  @('2026-09-10-ai-quality-feedback-admin.sql', '3a05655b38c180bae1529383662005bf5297e8ecb9b0c0ba35f371b71477ee94'),
  @('2026-09-10-ai-quality-activation-hardening.sql', '5d00895e62c6da599aa4a4beb3a38c7f6d8e32f522aed61653ebde194dddbd34')
)
foreach ($entry in $manifest) {
  $path = Join-Path 'client\supabase\migrations' $entry[0]
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -cne $entry[1]) { throw "CHECKSUM_MISMATCH: $($entry[0])" }
  [pscustomobject]@{ File = $entry[0]; SHA256 = $actual; Result = 'PASS' }
}
~~~

Never hash a normalized/rewritten substitute and call it the original file.
The local native proof also compared raw committed bytes, not just the
working file against another working-file hash. Recheck immediately before
submission; the manifest is not permission to accept future edits.

#### Prefix Verification Matrix

All figures EXCLUDE the dedicated ledger, which is owner-only and verified
separately. The counts were measured on fresh PostgreSQL 17.6, not guessed.

| Verified prefix | Runtime tables | Columns | Indexes | Functions | Evidence rows | Maintenance |
| --- | --- | --- | --- | --- | --- | --- |
| 1A | 7 | 85 | 29 | 8 | All zero | Absent |
| 1A + 1B | 7 | 89 | 31 | 9 | All zero | Absent |
| 1A + 1B + 1C | 7 | 94 | 34 | 14 | All zero | Absent |
| Full chain | 8 | 102 | 35 | 16 | All zero | Exactly one critical/null/zero seed |

Each prefix requires RLS=true, no policies, complete expected columns/types/
defaults/constraints/index definitions/signatures, trusted ownership/fixed
paths, all eight browser privileges denied and all browser/PUBLIC function
EXECUTE denied. Counts alone do not pass a prefix. service_role permissions
are narrow as documented; use the A2.0 SELECT-only blocks below against only
the tables/functions expected at that prefix. Exclude the dedicated ledger
from prefix-based catalog scans and verify its owner-only contract separately.

Read-only ledger verification, after the future bootstrap exists:

~~~sql
select filename,sha256,applied_at
from public.ai_quality_schema_migrations order by applied_at,filename;
select c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) as owner,
       r,priv,has_table_privilege(r,c.oid,priv) as allowed
from pg_class c
cross join unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE',
                       'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv
where c.oid='public.ai_quality_schema_migrations'::regclass;
select a.privilege_type
from pg_class c
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where c.oid='public.ai_quality_schema_migrations'::regclass and a.grantee=0;
~~~

The future attestation is one owner-executed INSERT of the verified filename/
SHA, with no ON CONFLICT UPDATE and no automatic overwrite. A duplicate is a
STOP requiring prefix inspection. No ledger or permission INSERT occurred here.

#### Partial Failure And Resume

- 1A succeeded / 1B failed: preserve A; do not replay A. Confirm failed B's
  transaction outcome, A's unchanged schema/hash/ledger and no B residue.
- A/B succeeded / C failed: preserve A/B; verify permission-seed transaction
  outcome and C object absence before requesting a C-only resume.
- A/B/C succeeded / hardening failed: preserve A/B/C, leave flags OFF, verify
  old expiry column/index and missing hardening objects as appropriate.
- Artifact committed but ledger missing, timeout/disconnect, or any ambiguous
  state: STOP. Reconstruct exact objects/definitions from the native committed
  prefix and core snapshot. Do not rerun or insert a guessed ledger entry.
  An explicit, separately approved reconciliation may attest a proven prefix;
  otherwise remain blocked. Timestamps alone are not proof.
- Never DROP successful new schema, delete permission keys, downgrade a
  newer validator/RPC, touch core rows or repair a global ledger automatically.

### Production Safe Metadata Baseline

Captured at 2026-09-10T09:30:59.77732Z on the confirmed Production project.
45 core public tables, 18 relevant column signatures, 39 function signatures;
combined core table metadata MD5: **3935941ec1519c46048c3d569b1026db**.
MD5 here detects catalog drift, not secret identity or artifact authenticity;
artifact integrity uses SHA256. No row data, default literals, function bodies,
tokens or credentials are stored in this snapshot. A fresh baseline is still
required immediately before A2.1 because live schema may change independently.

Existing core table names:

~~~text
admin_activity_logs, admin_permissions, admin_profiles, admin_role_permissions,
admin_roles, ai_chat_usage_events, booking_availability_alerts,
booking_availability_blocks, booking_cancellation_audit_logs,
booking_cancellation_requests, booking_external_reservations,
booking_lookup_rate_limits, booking_management_sessions, booking_package_rates,
booking_payment_admin_audit_logs, booking_payment_records,
booking_payment_report_rate_limits, booking_price_rule_sets, booking_requests,
booking_settings, booking_special_dates, chat_messages, chat_sessions,
member_diamond_profiles, member_points_ledger, member_points_redemption_requests,
shop_customer_profiles, shop_furniture_assets, shop_housekeeping_records,
shop_inventory_movements, shop_order_items, shop_order_shipments, shop_orders,
shop_product_images, shop_product_variants, shop_products,
shop_social_platform_credentials, shop_social_posts, shop_supply_items,
shop_warehouse_locations, shop_warehouse_media, site_content_revisions,
site_media, site_pages, site_sections
~~~

These are schema identifiers, never credential/customer row contents.

Column signatures below are name:type:NOT-NULL, in ordinal order. They
contain schema field names only, not any stored booking/token/payment values.

~~~text
admin_permissions
code:text:true|module:text:true|action:text:true|description:text:false|created_at:timestamp with time zone:true
booking_availability_alerts
id:uuid:true|severity:text:true|alert_type:text:true|title:text:true|description:text:false|check_in:date:false|check_out:date:false|source:text:false|status:text:true|handled_at:timestamp with time zone:false|handled_by:uuid:false|notes:text:false|raw_payload:jsonb:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_availability_blocks
id:uuid:true|block_type:text:true|source:text:true|check_in:date:true|check_out:date:true|status:text:true|title:text:false|notes:text:false|ical_uid:text:false|raw_payload:jsonb:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true|external_reservation_id:uuid:false
booking_cancellation_audit_logs
id:uuid:true|booking_request_id:uuid:true|booking_reference:text:true|cancellation_request_id:uuid:false|actor_type:text:true|admin_profile_id:uuid:false|admin_auth_user_id:uuid:false|action:text:true|previous_booking_status:text:false|new_booking_status:text:false|previous_payment_status:text:false|new_payment_status:text:false|reason:text:false|action_at:timestamp with time zone:true|created_at:timestamp with time zone:true
booking_cancellation_requests
id:uuid:true|booking_request_id:uuid:true|requested_by:text:true|status:text:true|reason_code:text:true|reason_text:text:false|requested_at:timestamp with time zone:true|reviewed_at:timestamp with time zone:false|reviewed_by_admin_id:uuid:false|admin_note:text:false|public_note:text:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_external_reservations
id:uuid:true|source:text:true|reference_number:text:false|check_in:date:true|check_out:date:true|guest_name:text:false|guest_count:integer:false|amount:numeric(12,2):false|status:text:true|accommodation_name:text:false|confidence:integer:false|raw_payload:jsonb:true|notes:text:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_lookup_rate_limits
key_hash:text:true|window_started_at:timestamp with time zone:true|attempt_count:integer:true|expires_at:timestamp with time zone:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_management_sessions
id:uuid:true|booking_request_id:uuid:true|token_hash:text:true|created_ip_hash:text:false|user_agent:text:false|expires_at:timestamp with time zone:true|created_at:timestamp with time zone:true
booking_package_rates
id:uuid:true|rule_set_id:uuid:true|guest_count:integer:true|day_type:text:true|nightly_price:integer:true|is_active:boolean:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_payment_admin_audit_logs
id:uuid:true|booking_request_id:uuid:true|booking_reference:text:true|payment_id:uuid:true|admin_profile_id:uuid:true|admin_auth_user_id:uuid:true|action:text:true|previous_booking_status:text:true|new_booking_status:text:true|previous_payment_status:text:true|new_payment_status:text:true|reason:text:false|action_at:timestamp with time zone:true|created_at:timestamp with time zone:true
booking_payment_records
id:uuid:true|booking_request_id:uuid:true|payment_method:text:true|expected_amount:integer:true|currency:text:true|status:text:true|bank_last5:text:false|payer_name:text:false|report_notes:text:false|reported_at:timestamp with time zone:false|verified_at:timestamp with time zone:false|verified_by_admin_id:uuid:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_payment_report_rate_limits
key_hash:text:true|window_started_at:timestamp with time zone:true|attempt_count:integer:true|expires_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_price_rule_sets
id:uuid:true|name:text:true|effective_from:date:true|effective_to:date:true|deposit_rate:numeric(5,4):true|is_active:boolean:true|notes:text:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_requests
id:uuid:true|guest_name:text:true|guest_email:text:false|guest_phone:text:false|check_in:date:true|check_out:date:true|guest_count:integer:false|notes:text:false|status:text:true|stay_type:text:true|adults:integer:true|children:integer:true|room_count:integer:false|has_pets:boolean:true|pet_count:integer:false|pet_type:text:false|pet_notes:text:false|source:text:true|raw_payload:jsonb:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true|customer_profile_id:uuid:false|final_lodging_amount:integer:false|completed_at:timestamp with time zone:false|completed_by_admin_id:uuid:false|partner_points_awarded_at:timestamp with time zone:false|partner_points_awarded_to_profile_id:uuid:false|partner_points_ledger_id:uuid:false|selected_package_type:text:false|pricing_rule_set_id:uuid:false|quoted_total:integer:false|deposit_rate:numeric(5,4):false|deposit_amount:integer:false|balance_amount:integer:false|pricing_breakdown:jsonb:false|quoted_at:timestamp with time zone:false|hold_expires_at:timestamp with time zone:false|recovery_token_hash:text:false|submitted_snapshot:jsonb:false|booking_reference:text:true|payment_reported_at:timestamp with time zone:false|review_expires_at:timestamp with time zone:false
booking_settings
id:integer:true|booking_window_months:integer:true|allow_villa_booking:boolean:true|allow_room_booking:boolean:true|total_room_count:integer:true|allow_pets:boolean:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
booking_special_dates
id:uuid:true|rule_set_id:uuid:true|date:date:true|day_type:text:true|label:text:false|is_active:boolean:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true
chat_messages
id:uuid:true|session_id:uuid:false|sender:text:true|message:text:true|provider_used:text:false|created_at:timestamp with time zone:false|read_by_admin:boolean:false|metadata:jsonb:false|role:text:false|content:text:false|deleted_at:timestamp with time zone:false
chat_sessions
id:uuid:true|visitor_id:text:true|visitor_name:text:false|source:text:false|created_at:timestamp with time zone:false|updated_at:timestamp with time zone:false|line_user_id:text:false|line_display_name:text:false|line_picture_url:text:false|status:text:false|should_ai_reply:boolean:false|unread_count:integer:false|last_message:text:false|latest_message_at:timestamp with time zone:false|auth_user_id:uuid:false|customer_profile_id:uuid:false|customer_email:text:false|linked_at:timestamp with time zone:false|deleted_at:timestamp with time zone:false|last_message_at:timestamp with time zone:false|title:text:false|summary:text:false|support_status:text:false|support_status_updated_at:timestamp with time zone:false|handled_at:timestamp with time zone:false|handled_by_admin_id:uuid:false|handled_by_name:text:false|handled_by_email:text:false|handled_by_role:text:false|closed_at:timestamp with time zone:false|closed_by_admin_id:uuid:false|closed_by_name:text:false|closed_by_email:text:false|closed_by_role:text:false|ai_paused_until:timestamp with time zone:false|conversation_context:jsonb:true
~~~

Existing public function signatures / definition MD5 (all owner postgres):

~~~text
acquire_villa_booking_hold(jsonb) d612f7ccd56483245038ee1b3c17012e
adjust_member_points_with_redemption_reserve(uuid,integer,text,uuid,uuid) 4559096ab1ad2ca55ed7da816698cd60
adjust_shop_inventory(jsonb) ff7351aba1ca4ac9a1d7e321dcfb22be
adjust_shop_supply_quantity(uuid,integer) a1d5b77bfb8b070d4cdbfb501930bb67
admin_cancel_confirmed_booking(uuid,uuid,text) 67d2468d03184f4003c95a5738554df5
assign_booking_reference() fb16134459fe14e7756c2dbbf83b28c1
complete_booking_stay_with_partner_points(uuid,integer,uuid) a52c6e3348e1941ca81191165b1184d9
complete_member_points_redemption_request(uuid,uuid) e8a9a8d0967a3b4d893dc690830fed2e
consume_booking_lookup_rate_limit(text,integer,integer) 898f718252a763cb31b4d0f53045578b
consume_booking_payment_report_rate_limit(text,integer,integer) 3467ba823a5523854b494f95db40a4b2
create_booking_management_session(uuid,text,text,text) be194cc0fe9e6a33d3985558f6cb1764
create_manual_sale_order(jsonb) 7e126aafb23f6e4bf846c88a1f428c43
create_member_points_redemption_request(uuid,integer,text,text,text) c626d9177cdf637e716d144e45ce534d
create_shop_order(jsonb) 97062bf2a7428e9eb0b073bb046ec01b
create_shop_order_shipment(jsonb) 5ef770a9aa9aaaa1dcc8b8b1f53eaa9b
customer_cancel_payment_hold_booking(uuid,text,text,text) 4c25ec91d2491ef6a02655b9549e9746
customer_request_booking_cancellation(uuid,text,text,text) 62424a934ef614f0a5a6bdbd15d54188
generate_booking_reference() b499e6016c3d392e3bb1483fb39ec430
get_booking_management_session(text) 6170b602deb634549afe3732634e4721
get_public_booking_unavailable_ranges(date,date) 6bbf68609e5f9058cc4392bfcf9e64a1
guard_availability_block_inventory_write() b34d307eedc298040da018beacaec3b8
guard_booking_request_inventory_write() d44e03928c08ca854cfcf30ab41bcf51
guard_external_reservation_inventory_write() d54d8e47bc5b7c790af8454dad544fc2
lock_villa_inventory_nights(date,date) 5b133fd4b4cc06588c5089a9befaab62
prevent_booking_cancellation_audit_mutation() 17549f6f21acfb672f9bd215a88b1c25
prevent_booking_payment_admin_audit_mutation() 979a27545b4f2f4a45dd52d533c390ba
protect_booking_submission_snapshot() 18a3ffcec4720a438406e816dbc0bc12
recover_booking_hold(text) 3b4e6e1b6e5c03e714cefb6631a5f334
reject_member_points_redemption_request(uuid,uuid,text) 7afe910c79e1612268d11246ab3b09f3
report_booking_bank_transfer(text,text,text,text,integer) 096d35b375e6410497d54d767a604760
report_booking_bank_transfer_from_management_session(uuid,text,text,text,text,integer) b8af96fb7842d299e629f72c79805bfd
review_booking_bank_transfer(uuid,uuid,text) ad009ee0a5d38305dd778eeab5ffa550
review_booking_cancellation_request(uuid,uuid,text,text,text) 95885d49098fdf60836197cdcfe154f0
rls_auto_enable() 6998ea6b4c2480f5d2e34b5dcf3f8d36
set_admin_updated_at() 9787773e699d6e25d78adc47104513d3
set_booking_updated_at() 3be3c0e39d8893fd267cbfc06fb55de5
set_shop_order_shipments_updated_at() 02d95f54bae79eebb33c831b7e64e989
set_shop_warehouse_updated_at() fd970384ecf8016aa7275f73b238295e
set_site_cms_updated_at() d709237f3cc59d7147366e5f6a4390b7
~~~

Production has seven enabled DDL event triggers. Six are supabase_admin-owned
extension-access/GraphQL-placeholder/PostgREST DDL notification hooks. The
postgres-owned ensure_rls hook invokes rls_auto_enable() for CREATE TABLE,
CREATE TABLE AS and SELECT INTO only. Its inspected definition has fixed
pg_catalog search_path, iterates the current pg_event_trigger_ddl_commands,
restricts to newly created public tables/partitioned tables, and enables RLS
using the server-reported object identity. It neither scans/rewrites all
existing tables nor grants browser access. Failures are logged, so the explicit
RLS assertions remain mandatory rather than trusting the hook.

These platform hooks were not recreated in the local ACL simulation. Their
existence is disclosed; recheck their identity before A2.1 and STOP on change.
No extension is created/dropped by the Quality chain. Expected PostgREST schema
cache notification is not an extra application migration or runtime activation.

#### Exact Core Fingerprint SELECT

This reproduces the recorded hash algorithm. It reads catalog definitions but
returns only the aggregate hash, not default/trigger literals or customer data.
The previously prepared A2.0 fingerprint used a different representation:
do NOT compare hashes across the two algorithms.

~~~sql
with core as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p')
   and c.relname !~ '^ai_(quality|review|owner|eval|daily)_'
), objects as (
 select c.relname,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,
   c.relforcerowsecurity,c.relacl::text as acl,
   (select string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||
     a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),
     '|' order by a.attnum)
    from pg_attribute a left join pg_attrdef d
      on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
   (select string_agg(k.conname||':'||pg_get_constraintdef(k.oid),'|' order by k.conname)
    from pg_constraint k where k.conrelid=c.oid) as constraints,
   (select string_agg(i.indexname||':'||i.indexdef,'|' order by i.indexname)
    from pg_indexes i where i.schemaname='public' and i.tablename=c.relname) as indexes,
   (select string_agg(t.tgname||':'||pg_get_triggerdef(t.oid),'|' order by t.tgname)
    from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers,
   (select jsonb_agg(to_jsonb(p) order by p.policyname)
    from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
 from core c
)
select md5(jsonb_agg(to_jsonb(o) order by relname)::text) as core_table_metadata_hash
from objects o;
~~~

### A2.0.1 Verification And Remaining Boundaries

Quality / Admin Quality: **795/795 PASS**, including 136 migration tests
(foundation 61, observer 20, feedback 14, activation hardening 41), RLS/RPC
tests, privacy and integration boundaries. Full repository: **2708/2710**;
only the same two About copy assertions fail. About source/tests are untouched;
no new runtime regression, no assertion changes.

FAQ regression 98/98 PASS. check with incremental=false PASS; build PASS;
git diff --check PASS (only the existing LF-to-CRLF advisory).
Initial test-cache and build output writes hit sandbox EPERM, not test/code
failures. Tests passed with --no-cache; the authorized build passed with output
directory permission. Existing Vite chunk warning is unchanged.

A proposed new local test/helper file addition was rejected by the execution
safety review because only this runbook was allowed dirty. Those files were
NOT created by another route. The permitted isolated native simulation ran
in memory instead, and existing tests were reused. No repository source,
test, migration, package or lockfile changed; only this runbook is dirty.

The broad default-grant finding alone no longer blocks under the owner's
A2.0.1 acceptance rule after the proven final denials. Continue to STOP on:
changed target/creator/checksum; conflicting objects/permission semantics;
untrusted CREATE/inheritance; unexpected effective ACL/policy; nonempty evidence
tables; unhealthy DB/resource/lock pressure; core schema drift; changed DDL
hooks; unclear commit/ledger prefix; or inability to submit an exact full file.

Production CREATE/ALTER/DROP/INSERT/UPDATE/DELETE/GRANT/REVOKE=0;
Production env changes=0; flags unmodified; runtime activation=0;
DeepSeek/LLM calls=0; commit/push/deploy/Promote=0.

### A2.0.1 Final Verdict

**A2.0.1 GATE PASS for schema-only readiness. Recommend requesting explicit
A2.1 approval: YES**, limited to the exact four artifacts plus the designed
owner-only Quality ledger and its four attestations. No A2.1 authorization is
inferred or exercised. The owner must accept the documented no-verified-backup
risk and separate artifact/ledger transaction boundaries in that approval.

Closed: final ACL/EXECUTE risk by fresh same-version proof; trusted definer
ownership/path; permission collision and small-table lock assessment; current
Healthy status; honest backup capability; isolated new Quality-only history/
checksum method instead of pretending old history is repaired; safe baseline;
exact ordered verification/resume plan. Unknown historical operator and the
prior transient Unhealthy cause are disclosed, not invented.

The ledger is design-only as requested; no local/Production ledger was created.
The documented method's unchanged four-file execution and ACLs were rehearsed
locally, not by unapproved Production DDL. A2.1 must repeat the time-sensitive
prechecks and stop on any mismatch. Runtime activation remains separately gated.

## A2.0 Production Preflight: STOP / FAIL

Audit date: 2026-09-10. Local preflight: main, HEAD
`7052205d8eb88f201bf40f3baac38e63b05dc22e`, clean, approved checkpoint is an
ancestor. The four exact-byte SHA256 values in the A1.1 manifest below were
rechecked without changing migrations. This section supersedes earlier
Production execution recommendations, not the completed local A1/A1.1 tests.

**A2.0 FAIL. A2.1 is NOT approved or recommended.** Dangerous Production
default privileges triggered the owner's absolute STOP. No further Production
queries were run after that result. All SQL newly prepared below is unexecuted.
Do not execute any older migration, scheduler, cleanup, aggregate or canary SQL
elsewhere in this document under this authorization.

### Observed Evidence And Limits

- Production identity confirmed before the catalog query: project
  mumbao-ai-chat, reference jgmgniftiwngvljdeytt, dashboard branch
  main / Production. The public www.mumbao.tw page returned HTTP 200;
  its public same-origin application asset referenced the same project.
  Only the project reference was extracted, not keys or asset contents.
- Connection: authenticated Supabase Dashboard SQL Editor, Database connection;
  current/session role postgres, database postgres, PostgreSQL 17.6.
  postgres is not superuser but has BYPASSRLS. service_role has BYPASSRLS;
  anon and authenticated do not. No credentials were read or recorded.
- Exactly one metadata-only SELECT returned catalog information. No application
  data rows, RPC executions, schema changes, permission writes, cleanup,
  aggregate calls, environment reads/writes or model calls occurred.
- Dashboard migration history showed no recorded migrations. The catalog
  returned no relations in supabase_migrations; no usable ledger was found.
  Existing Booking/Payment/chat/member/shop tables are present. Their manual
  apply history cannot be reconstructed from object existence or saved SQL
  snippet titles. This is unresolved history/drift risk, not proof that the
  four Quality migrations were never executed at any time.
- Quality relations, functions/overloads, types (including row/array types),
  constraints, triggers and policies: all collision result sets empty. The
  relation check included indexes, sequences and views as well as tables.
  The hardening maintenance table was included. Current schema contains none
  of the four migrations' Quality objects; history remains unverified.
- public.admin_permissions exists, owner postgres, RLS enabled. Required
  columns: code, module, action are NOT NULL text; description nullable
  text; created_at NOT NULL timestamptz. PRIMARY KEY (code) is compatible
  with Phase C's conflict target. Table/column/PK compatibility PASS.
  Existing permission naming patterns/keys, timestamp default and additional
  trigger behavior were not checked after STOP. Complete dependency gate is
  therefore NOT CLEARED. Its reltuples = -1 is UNKNOWN, not zero/small.
- Target schema is explicitly public for created tables/functions/index
  targets. Function search paths in all four artifacts are explicitly
  public, pg_temp; they do not rely on the editor session search path.
  Public schema owner is pg_database_owner. Its observed ACL gives PUBLIC,
  anon/authenticated/service_role USAGE, not CREATE; effective inherited
  CREATE and the future executor's role chain still need verification.
- Extensions already present include pgcrypto 1.3 and uuid-ossp 1.1 in
  extensions. Both pg_catalog.gen_random_uuid() and
  extensions.gen_random_uuid() return uuid and are executable by the inspected
  role. UUID availability PASS. None of these four migrations installs an
  extension. No function was called to test it.
- Definer ownership would follow the separately chosen future executor;
  the observed role is postgres, not proof of future object ownership.
  Fixed paths, service-role-only grants and trusted BYPASSRLS ownership must
  be checked on the actual result. Local PG18 tests do not certify PG17.6
  default ACLs or version-specific catalog constraint counts.
- Dashboard overview displayed Unhealthy; no cause or outage was inferred.
  Backups page stated the Free plan does not include project backups. No
  usable backup/PITR/off-platform recovery point was verified. No backup was
  created, deleted or exported. Recovery readiness is NOT established.

### Default Privileges: Blocking Finding

Observed explicit defaults in public, grouped by object creator and grantee:

| Creator | New objects | Each grantee | Default privileges |
| --- | --- | --- | --- |
| postgres | tables | anon, authenticated | TRUNCATE, REFERENCES, TRIGGER, MAINTAIN |
| supabase_admin | tables | anon, authenticated | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN |
| supabase_admin | sequences | anon, authenticated | SELECT, UPDATE, USAGE |
| supabase_admin | functions | anon, authenticated | EXECUTE |

All listed entries have grant option false. Defaults are creator-specific;
the supabase_admin defaults must not be attributed to postgres. No explicit
PUBLIC default entry was returned; this does NOT disprove built-in default
PUBLIC EXECUTE on functions. Effective ACL checks must include acldefault.

RLS alone does not cover table-wide TRUNCATE or REFERENCES operations.
See [PostgreSQL 17 row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
Importantly, foundation and hardening ALREADY explicitly REVOKE ALL table
privileges from PUBLIC/anon/authenticated/service_role before narrow regrants;
function ACLs are also reset. This finding does not prove that those approved
artifacts would leave these grants in place, or expose nonexistent Quality
rows. Nevertheless the owner's dangerous-default-grant STOP applies even with
that defense. Do not change global ACLs or historical migrations here. A
separate owner-approved resolution and target-engine ACL verification are
required before reopening A2.0.

### Exact Chain And Existing-Object Impact

Use the four filenames and SHA256 values in the A1.1 manifest below, strictly
1A -> 1B -> 1C -> hardening, never filename alphabetic order:

| Phase | Objects introduced or changed |
| --- | --- |
| 1A | Seven Quality tables, validators, updated-at trigger function and three triggers, indexes, aggregate/cleanup/storage RPCs, RLS and narrow ACLs. |
| 1B | Quality metadata validator replacement; observer counter, turn hash/execution metadata columns; two idempotency indexes; atomic record RPC. |
| 1C | Quality feedback columns and three indexes; feedback RPC and four Admin RPCs; two Admin permission seeds. |
| Hardening | Replaces cleanup/record/feedback; message retention/generated expiry and index rebuild; eighth maintenance-state table and seed; bounded-excerpt helper and maintenance RPC. |

No ALTER targets existing Booking, Payment, chat, scenario/pending, member or
shop tables. The only pre-existing application-table DML is Phase C's two
admin_permissions seeds (ai_quality.view, ai_quality.review) with
ON CONFLICT (code) DO NOTHING. That is idempotent for an identical key, not
proof that an existing conflicting module/action would be safe. Key collision
checks remain UNVERIFIED after STOP. Foundation also grants schema USAGE on
the pre-existing public schema to service_role; this is an existing-schema
ACL touch, not a core-table ALTER.

### Correct Post-Migration Contract

The requested seven empty tables describe A/B/C, not the approved hardening:

- Seven domain/evidence tables: zero rows each.
- ai_quality_maintenance_state: eighth RLS table, exactly one seed row with
  singleton=true, last_completed_at=NULL, capture_mode=critical, and all four
  counters zero. This is initialization, not Observer evidence collection.
- Two correct admin_permissions keys with module ai_quality and actions
  view / review. Expected new rows are two only if both keys are absent.
- Final inventory: 8 tables, 102 columns, 35 indexes, 16 functions, three
  user triggers, zero Quality policies. 79 non-NOT-NULL constraints; do not
  require PG18's separately reported NOT NULL count on PG17.
- Browser/PUBLIC table privileges and function EXECUTE denied; service_role
  CRUD on the seven domain tables, SELECT only on maintenance state, EXECUTE
  on the 16 functions. Owner administration is necessarily trusted.
- Observer/Feedback/Admin flags false or unset, customer feedback UI OFF;
  HMAC need not be activated; no new evidence writes or model calls. These
  are future required states, NOT observed Production env values in A2.0.
- Booking/Payment schema and data unchanged. Seed writes are not zero total
  migration writes; do not describe the singleton/permission seeds as absent.

### Canonical Apply And Recovery Plan: BLOCKED

No repo migration npm script, tracked Supabase CLI config or ledger-aware
apply workflow was found. Supabase CLI is not installed in this execution
environment. The existing hyphenated date filenames do not match the CLI's
<timestamp>_<name>.sql convention and share dates; alphabetical order would
place hardening before Phase C. Dashboard SQL snippets do not prove a canonical
workflow. Do not rename committed files, blindly run db push, invent ledger
versions, repair history, or paste fragments into the editor.
See [Supabase migration workflow and ledger](https://supabase.com/docs/guides/deployment/database-migrations).

Before A2.1 approval: resolve dangerous defaults, reconcile actual prior
history, establish backup/recovery evidence, resolve the health indicator,
complete stopped dependency/key/lock checks, and approve a canonical ordered
apply method plus one-to-one ledger identities for these exact artifacts.
If no existing method can be demonstrated, its preparation is a separately
approved task, not an action authorized by this preflight. No safe ready-to-run
Production apply command is claimed here.

Proposed sequence AFTER these prerequisites and explicit authorization:
fresh target/SHA/flags/collision checks -> core metadata baseline -> exact 1A
file -> verify prefix and ledger -> exact 1B -> verify -> exact 1C -> verify
-> exact hardening -> full read-only verification. Each artifact already has
its own BEGIN/COMMIT; do not assume the four-file chain is one transaction or
wrap it without checking the eventual tool's transaction/ledger behavior.
No Quality RPC is needed for empty-schema verification.

On 1B failure preserve successful 1A; on 1C failure preserve successful A/B;
on hardening failure preserve successful A/B/C. STOP, leave flags OFF, reconcile
transaction outcome, exact schema prefix and ledger before any separately
approved resume. A client error does not alone prove rollback or commit.
Never automatically DROP successful schema, replay an earlier validator over
hardening, advance the ledger, or continue with later files. Flags OFF prevent
runtime activation; they do not undo DDL or replace a recovery plan.

Lock assessment remains incomplete: new Quality objects are absent; hardening
rewrites only the expected empty Quality messages table. Phase C's existing
permission insert can wait on uniqueness/row locks, triggers or concurrent
writers. Its unknown estimate cannot justify a low lock-risk certification.
Before execution approve bounded lock/statement timeouts and safe failure
handling in the chosen canonical tool, without altering artifact bytes.

### A2.1 Read-Only Verification Preparation

The following SELECT-only blocks are prepared locally, NOT executed. They
supplement and supersede the old seven-table-only final checks below. Do not
run post-migration blocks against absent tables. Gate H is deliberately
incomplete until canonical ledger identities are approved. Counts, ACLs and
metadata only; never select customer transcripts, credentials or RPC results.

#### Reopened Precheck: Default ACLs And Permission Dependency

Only after a separate authorization to resume the stopped preflight:

~~~sql
select current_database(), current_user, session_user,
       current_setting('server_version'), current_setting('search_path');

select pg_get_userbyid(d.defaclrole) as creator,
       case when d.defaclnamespace=0 then 'GLOBAL' else n.nspname end as schema,
       d.defaclobjtype,
       case when a.grantee=0 then 'PUBLIC'
            else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, a.is_grantable
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where (d.defaclnamespace=0 or n.nspname='public')
  and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated'))
order by creator,schema,d.defaclobjtype,grantee,a.privilege_type;

select r, has_schema_privilege(r,'public','CREATE') as can_create
from unnest(array[current_user::text,'anon','authenticated','service_role']) r;

select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='public' and table_name='admin_permissions'
order by ordinal_position;
select conname,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid=to_regclass('public.admin_permissions');
select tgname,md5(pg_get_triggerdef(oid)) as definition_hash
from pg_trigger
where tgrelid=to_regclass('public.admin_permissions') and not tgisinternal;
select code,module,action from public.admin_permissions
where code in ('ai_quality.view','ai_quality.review') order by code;
select count(*) as permission_rows,
       count(*) filter (where code=module||'.'||action) as dot_pattern_rows
from public.admin_permissions;
~~~

Do not interpret an empty pg_default_acl result as no default PUBLIC function
EXECUTE. Any existing target permission key requires semantic comparison,
not automatic acceptance of ON CONFLICT. Unexpected dependency triggers need
separate safe review before assuming a permission insert has no side effects.

#### A / C: Eight Tables, Columns And RLS

~~~sql
with expected(name) as (values
 ('ai_quality_conversations'),('ai_quality_messages'),('ai_quality_events'),
 ('ai_review_items'),('ai_owner_decisions'),('ai_eval_cases'),
 ('ai_daily_metrics'),('ai_quality_maintenance_state'))
select e.name,c.oid is not null as present,c.relkind,
       pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,c.relforcerowsecurity
from expected e left join pg_class c on c.oid=to_regclass('public.'||e.name)
order by e.name;

select table_name,column_name,data_type,is_nullable,column_default,
       is_generated,generation_expression
from information_schema.columns
where table_schema='public'
  and table_name ~ '^ai_(quality|review|owner|eval|daily)_'
order by table_name,ordinal_position;
select c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname ~ '^ai_(quality|review|owner|eval|daily)_'
order by c.relname,k.conname;
select tablename,policyname,roles,cmd
from pg_policies where schemaname='public'
  and tablename ~ '^ai_(quality|review|owner|eval|daily)_'
order by tablename,policyname;
select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname='public'
  and c.relname ~ '^ai_(quality|review|owner|eval|daily)_'
order by c.relname,t.tgname;
~~~

Compare complete definitions with the approved final contract, not counts
alone. Expect 8 ordinary tables, all RLS=true, 102 columns, 79 non-NOT-NULL
constraints, zero policies, three updated-at triggers on conversations,
review items and eval cases. Stop on missing/extra objects or mismatched
definitions. Prefix queries deliberately expose unexpected extra Quality
objects for review. PG17 does not share PG18's NOT NULL constraint inventory.

#### B: Zero Evidence Rows And One Maintenance Seed

~~~sql
select 'ai_quality_conversations' as table_name,count(*) as rows from public.ai_quality_conversations
union all select 'ai_quality_messages',count(*) from public.ai_quality_messages
union all select 'ai_quality_events',count(*) from public.ai_quality_events
union all select 'ai_review_items',count(*) from public.ai_review_items
union all select 'ai_owner_decisions',count(*) from public.ai_owner_decisions
union all select 'ai_eval_cases',count(*) from public.ai_eval_cases
union all select 'ai_daily_metrics',count(*) from public.ai_daily_metrics
union all select 'ai_quality_maintenance_state',count(*) from public.ai_quality_maintenance_state;

select count(*)=1 and coalesce(bool_and(
  singleton and last_completed_at is null and capture_mode='critical'
  and conversation_rows=0 and message_rows=0 and event_rows=0
  and cleanup_due_count=0),false) as seed_matches
from public.ai_quality_maintenance_state;
~~~

Expect seven zeros, one maintenance row, seed_matches=true. Do not call
storage-metrics, cleanup, record, feedback or aggregate RPCs as verification.

#### D: Effective Browser Denials, PUBLIC ACL And Service Role

~~~sql
with t as (
 select c.oid,c.relname,c.relowner,c.relacl
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p')
   and c.relname ~ '^ai_(quality|review|owner|eval|daily)_')
select t.relname,r,priv,has_table_privilege(r,t.oid,priv) as allowed,
       case when r='service_role' then
         priv='SELECT' or (t.relname<>'ai_quality_maintenance_state'
                           and priv in ('INSERT','UPDATE','DELETE'))
         else false end as expected_allowed
from t cross join unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE',
                       'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) priv
order by t.relname,r,priv;

select c.relname,a.privilege_type,a.is_grantable
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
where n.nspname='public' and c.relkind in ('r','p') and a.grantee=0
  and c.relname ~ '^ai_(quality|review|owner|eval|daily)_'
order by c.relname,a.privilege_type;
~~~

All allowed values must equal expected_allowed; PUBLIC result empty. This
checks inherited/effective privileges and non-CRUD privileges, including
PG17 MAINTAIN, not just RLS. Missing tables must already fail A.

#### E / F: Exact Function Signatures, ACLs, Definer And Paths

~~~sql
with expected(signature,definer) as (values
 ('ai_quality_valid_capability_id(text)',false),
 ('ai_quality_valid_response_kind(text)',false),
 ('ai_quality_valid_metadata(jsonb)',false),
 ('ai_quality_valid_context(jsonb)',false),
 ('set_ai_quality_updated_at()',false),
 ('aggregate_ai_daily_metrics(date)',true),
 ('delete_expired_ai_quality_data(integer)',true),
 ('get_ai_quality_storage_metrics()',true),
 ('record_ai_quality_turn(jsonb)',true),
 ('submit_ai_quality_feedback(text,text,text,text)',true),
 ('read_ai_quality_overview(integer)',true),
 ('list_ai_quality_events(integer,text,text,text,timestamptz,uuid)',true),
 ('read_ai_quality_detail(uuid)',true),
 ('review_ai_quality_event(uuid)',true),
 ('ai_quality_bounded_excerpt(text)',false),
 ('run_ai_quality_maintenance(integer,integer)',true))
select e.signature,p.oid is not null as present,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef,e.definer as expected_definer,p.proconfig,
       md5(pg_get_functiondef(p.oid)) as definition_hash,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
       exists(select 1 from aclexplode(coalesce(
         p.proacl,acldefault('f',p.proowner))) a
         where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
from expected e
left join pg_proc p on p.oid=to_regprocedure('public.'||e.signature)
order by e.signature;

select p.proname,pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (p.proname like '%ai_quality%' or p.proname='aggregate_ai_daily_metrics')
order by p.proname,arguments;
~~~

Expect exactly 16 names/signatures, six invoker/ten definer functions, trusted
approved executor ownership, fixed public,pg_temp paths, approved per-function
timeouts, browser/PUBLIC EXECUTE=false, service_role EXECUTE=true. Compare
definition hashes to an approved same-engine local contract before declaring
body integrity; hashes were not collected on Production in A2.0. Do not dump
function bodies or invoke these functions to check permissions.

#### G: Exact Index Set And Definitions

~~~sql
with expected(name) as (values
 ('ai_daily_metrics_pkey'),('ai_eval_cases_pkey'),('ai_eval_cases_review_idx'),
 ('ai_owner_decisions_pkey'),('ai_owner_decisions_review_created_idx'),
 ('ai_quality_conversations_activity_idx'),
 ('ai_quality_conversations_conversation_key_hash_key'),
 ('ai_quality_conversations_pkey'),('ai_quality_conversations_retention_idx'),
 ('ai_quality_conversations_started_idx'),('ai_quality_active_feedback_idx'),
 ('ai_quality_events_conversation_idx'),('ai_quality_events_created_idx'),
 ('ai_quality_events_idempotency_idx'),('ai_quality_events_message_idx'),
 ('ai_quality_events_page_idx'),('ai_quality_events_pkey'),
 ('ai_quality_events_retention_idx'),('ai_quality_events_review_idx'),
 ('ai_quality_events_type_created_idx'),('ai_quality_events_unresolved_idx'),
 ('ai_quality_messages_created_idx'),('ai_quality_messages_id_conversation_key'),
 ('ai_quality_messages_idempotency_idx'),('ai_quality_messages_pkey'),
 ('ai_quality_messages_retention_idx'),('ai_quality_messages_turn_role_key'),
 ('ai_review_items_classification_seen_idx'),('ai_review_items_cluster_idx'),
 ('ai_review_items_first_seen_idx'),('ai_review_items_last_seen_idx'),
 ('ai_review_items_owner_seen_idx'),('ai_review_items_pkey'),
 ('ai_review_items_status_seen_idx'),('ai_quality_maintenance_state_pkey')),
actual as (
 select i.indexname,i.tablename,i.indexdef,x.indisvalid,x.indisready
 from pg_indexes i
 join pg_index x on x.indexrelid=to_regclass('public.'||quote_ident(i.indexname))
 where i.schemaname='public'
   and i.tablename ~ '^ai_(quality|review|owner|eval|daily)_')
select coalesce(e.name,a.indexname) as index_name,e.name is not null as expected,
       a.indexname is not null as present,a.tablename,a.indisvalid,a.indisready,a.indexdef
from expected e full join actual a on a.indexname=e.name
order by index_name;
~~~

Expect exactly 35 rows, all expected/present/valid/ready=true. Compare full
definitions with the 34-index A/B/C inventory below plus the maintenance
singleton PK. The rebuilt message retention index keeps its name and columns;
its generated expiry column must reflect the hardening contract.

#### H: Ledger Contract And Four Approved Identities (BLOCKED)

~~~sql
select to_regclass('supabase_migrations.schema_migrations') as possible_ledger;
select column_name,data_type from information_schema.columns
where table_schema='supabase_migrations' and table_name='schema_migrations'
order by ordinal_position;
~~~

Only if a separately approved canonical workflow actually uses this table
with version/name columns, the following reads non-secret identity fields:

~~~sql
select version,name from supabase_migrations.schema_migrations order by version;
~~~

Never select ledger statement bodies. A2.0 found no ledger relations. Four
one-to-one version/name/artifact-hash mappings have NOT been established, so
no executable four-version assertion or apply command can yet be finalized.
A raw row-count increase of four is insufficient. Future verification must
compare the exact approved identities in order against pre-apply history
and the local exact-byte SHA256 manifest, with no unrelated entries changed.
If another canonical ledger is approved, prepare its identity-only equivalent
before execution. Do not create/repair a ledger during this read-only gate.

#### I: Existing Core Metadata Fingerprint, Before And After

Prepared only; no Production baseline fingerprint was captured before STOP.
Run the identical query before the future chain, after each successful phase,
and finally, on the same engine/session settings. It covers all existing public
non-Quality ordinary/partitioned tables, including admin_permissions metadata.
It emits only counts/hashes, not application data or default/trigger literals.

~~~sql
with t as (
 select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p')
   and c.relname !~ '^ai_(quality|review|owner|eval|daily)_'),
objects(kind,object_key,definition) as (
 select 'table',t.relname::text,jsonb_build_object(
   'kind',t.relkind,'owner',pg_get_userbyid(t.relowner),
   'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,
   'options',t.reloptions,'partition',pg_get_partkeydef(t.oid),
   'partition_bound',pg_get_expr(t.relpartbound,t.oid),
   'acl',(select jsonb_agg(jsonb_build_array(
       pg_get_userbyid(a.grantor),
       case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
       a.privilege_type,a.is_grantable)
       order by a.grantor,a.grantee,a.privilege_type,a.is_grantable)
     from aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a))
 from t
 union all
 select 'column',t.relname||'.'||a.attname,jsonb_build_object(
   'position',a.attnum,'type',format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'identity',a.attidentity,
   'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),
   'collation',co.collname,'collation_schema',cn.nspname)
 from t join pg_attribute a on a.attrelid=t.oid
 left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
 left join pg_collation co on co.oid=a.attcollation
 left join pg_namespace cn on cn.oid=co.collnamespace
 where a.attnum>0 and not a.attisdropped
 union all
 select 'constraint',t.relname||'.'||k.conname,
        jsonb_build_object('type',k.contype,'definition',pg_get_constraintdef(k.oid),
                           'validated',k.convalidated)
 from t join pg_constraint k on k.conrelid=t.oid
 union all
 select 'index',t.relname||'.'||i.relname,jsonb_build_object(
   'definition',pg_get_indexdef(i.oid),'valid',x.indisvalid,'ready',x.indisready)
 from t join pg_index x on x.indrelid=t.oid
 join pg_class i on i.oid=x.indexrelid
 union all
 select 'trigger',t.relname||'.'||g.tgname,jsonb_build_object(
   'definition',pg_get_triggerdef(g.oid),'enabled',g.tgenabled)
 from t join pg_trigger g on g.tgrelid=t.oid where not g.tgisinternal
 union all
 select 'policy',p.tablename||'.'||p.policyname,to_jsonb(p)
 from pg_policies p join t on t.relname=p.tablename where p.schemaname='public')
select count(*) as metadata_records,
       md5(coalesce(jsonb_agg(jsonb_build_array(kind,object_key,md5(definition::text))
         order by kind,object_key)::text,'[]')) as core_table_metadata_hash
from objects;

select count(*) as core_function_count,
       md5(coalesce(jsonb_agg(jsonb_build_array(
         p.proname,pg_get_function_identity_arguments(p.oid),
         md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner),p.proacl::text)
         order by p.proname,pg_get_function_identity_arguments(p.oid))::text,'[]'))
         as core_function_metadata_hash
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind in ('f','p')
  and not (p.proname like '%ai_quality%' or p.proname='aggregate_ai_daily_metrics');
~~~

Expect hashes and record counts unchanged. This verifies catalog definitions,
not private row contents or concurrent business transactions. public schema
USAGE is a separately reviewed existing-schema ACL touch and deliberately not
part of the table fingerprint. Any unexpected core metadata change is STOP,
not automatic blame or rollback of a concurrent unrelated change.

#### J: Exact Permission Seeds

~~~sql
with expected(code,module,action,description) as (values
 ('ai_quality.view','ai_quality','view','View sanitized AI quality evidence'),
 ('ai_quality.review','ai_quality','review','Mark AI quality evidence as reviewed'))
select e.code,p.code is not null as present,
       p.module is not distinct from e.module as module_matches,
       p.action is not distinct from e.action as action_matches,
       p.description is not distinct from e.description as description_matches
from expected e left join public.admin_permissions p on p.code=e.code
order by e.code;
~~~

Expect two rows and all booleans true. Compare the pre-apply count with the
expected two inserts only after target-key absence has been verified and
concurrent Admin permission changes ruled out. No permission row was read or
written in A2.0 after the default-privilege STOP.

### A2.0 Closeout

Local verification: historical runbook content preserved; static security
audit PASS; 10 new SQL blocks contain 26 SELECT-only statements and no Quality
RPC invocation. The expected index set matches all 34 historical indexes plus
the maintenance PK; 16 exact function signatures include ten definers. These
are static checks, not live SQL execution or a substitute for blocked gate H.
git diff --check PASS. Four migration SHA256 values and HEAD remain unchanged.

Only this runbook was edited locally. Four migrations, runtime, FAQ/MD,
Booking, About and Facilities remain unchanged. No A2.1 action was attempted.
Production writes=0; Production environment changes=0; Quality activation=0;
DeepSeek/other model calls=0; commit/push/deploy/Promote=0. A1 local gate remains
PASS; A2.0 Production preflight is FAIL; recommend A2.1 approval: NO.

## A1.1 Current Verdict

Local hardening completed 2026-09-10 against main checkpoint
`3c8842a50441d8e9d59831bb7407bfd405038870`. Initial preflight matched exactly:
only this pre-existing untracked A1 runbook was dirty. No reset/stash/restore.
The historical A1 report below is retained as evidence, not current instructions.

**A1.1 PASS; recommend A1 PASS for readiness and a separately authorized A2
schema-only gate. This is NOT permission to run A2, enable flags, or collect
Production transcripts.** No Production access, migration, env write, scheduler
registration, deploy, Promote, commit or push occurred. New real model calls: 0.

A2 may apply the four exact artifacts in order with ALL Quality flags OFF.
An enabled scheduler is not required for an empty, disabled schema. Before
Observer Canary, the maintenance schedule, successful scheduled execution,
freshness/backlog checks, alert ownership and target-engine capacity must all
be verified. Missing any of these is an explicit Canary STOP.

### Scope And Manifest

| Phase | File under client/supabase/migrations/ | SHA256 of exact file bytes |
| --- | --- | --- |
| 1A | 2026-09-09-ai-quality-foundation.sql | f1ef296f6b77addb0461a82c19ea13c4ef2f41d783c7290fb70dfadfd5e5e637 |
| 1B | 2026-09-09-ai-quality-runtime-observer.sql | f18a1fbc61eeefc5bd15e4a741cfd88c5e374e464eea3d89e99193493fcd59c1 |
| 1C | 2026-09-10-ai-quality-feedback-admin.sql | 3a05655b38c180bae1529383662005bf5297e8ecb9b0c0ba35f371b71477ee94 |
| A1.1 | 2026-09-10-ai-quality-activation-hardening.sql | 5d00895e62c6da599aa4a4beb3a38c7f6d8e32f522aed61653ebde194dddbd34 |

Historical files were compared with raw `git show` buffers, not normalized text:
A against e4650054, B against 08002542, C against 3c8842a5: byte-identical.
Never replay A alone after B/C/hardening: it replaces a newer metadata validator.
Never replay B or C alone over hardening: their older RPC definitions would undo
capture protections. The approved final order is A -> B -> C -> A1.1.
Repeated A1.1 on the resulting schema succeeded locally without duplicating objects.

Hardening replaces only Quality cleanup/record/feedback functions, adds an
immutable bounded-excerpt helper and a maintenance RPC, adds a singleton Quality
maintenance state and message `capture_retention_days`. It rebuilds the same
message retention index around the new generated expiry column, preserving
historical rows' 30-day default. No new cleanup lookup index was needed.
This DDL rewrites/locks the Quality messages table; A2 must verify its expected
empty/inactive state first. Unexpected existing data/drift: STOP, not ad hoc repair.

Current local catalog: **8 RLS-enabled tables, 102 columns, 35 indexes,
79 non-NOT-NULL constraints (62 CHECK, 8 PK, 6 FK, 3 UNIQUE),
16 functions, 3 triggers, zero Quality RLS policies.**
PostgreSQL 18 additionally reports 78 NOT NULL constraints separately.
The old seven-table inventory later in this file describes A/B/C only.
All existing ACLs remain; the new state table grants service_role SELECT only,
not UPDATE/DELETE. New maintenance and excerpt RPCs plus replaced write RPCs
revoke PUBLIC/anon/authenticated and grant only service_role EXECUTE.
Definer functions retain fixed public,pg_temp search paths. Database owners
necessarily remain trusted administrators.

### Privacy Sources And Handling

Root cause: the existing sanitizer recognized numeric identifiers, credentials
and communication fields, but had no contextual name/full-address rules.
Punctuation normalization was not anonymization.

| Source | Deterministic handling |
| --- | --- |
| A: natural introduction | Bounded common Chinese surname/name or capitalized English name only after an introduction; never treat arbitrary 2-4 Han characters as a name. |
| B: explicit identity label | Bounded Chinese/English values after guest/contact/name labels become [NAME]. Spaces, colon variants, quoted keys and line breaks are covered. Unsupported explicit values fail closed. |
| C: labelled full address | Precise Taiwan street/door matcher, plus high-confidence residual label + street + door detection for unsupported separators/spelling. |
| D: natural full address | City/county, optional district, street/section/lane/alley and door/unit become [ADDRESS]. |
| E: ordinary geography | City/district/street without a private door remains; ordinary dates, prices, dog weights, times and guest counts remain. |
| F: public venue address | Only the fixed server-owned faq-101 business address is preserved; different door/floor/unit is not allowlisted. Client allowlists are ignored. |
| G: structured identity | Existing metadata/context allowlists exclude name/guest_name/contact_name/customer_name/profile/address/booking objects. They are never concatenated into Quality text. SQL rejects unknown payload keys. |

The one fixed business address is `宜蘭縣員山鄉深洲二路158號`. Its canonical
FAQ answer passes unchanged; optional recognized postal/country/spacing forms
do not authorize any arbitrary address. Neither FAQ nor MD was edited.

Flow: existing normalization/URL/numeric redaction -> name/address redaction ->
`detectResidualHighRiskPii` -> bounded Quality text. High-confidence remaining
PII replaces the WHOLE Quality text with `[PRIVACY_REDACTED]`. Safe typed
metadata/events remain. No raw fallback, provider request, logger or new model
call is introduced. The original user/assistant response objects are not mutated.

Privacy limits are explicit: these are high-precision supported formats and
fail-closed explicit-label rules, not a claim to recognize every possible
unlabelled personal name/address in arbitrary prose. No NER/model is used.
A new known leak must stop Canary and extend the synthetic gate before collection.

**270 adversarial persisted-payload cases PASS** through snapshot -> preparation
-> real persistence serialization (intercepted synthetic HTTP). Every known
synthetic name/address/phone/email/ID/card/bank/token is absent from the emitted
Quality payload; both sides are idempotent. Includes 168 name-label combinations,
18 introductions, 36 address combinations and 48 mixed booking/privacy inputs.
All data is synthetic; no customer records or real secrets were read.
Privacy hardening suite: 336/336; prior privacy suite: 157/157.
43 ordinary geography/booking controls PASS, plus five unsupported-format checks;
normal prices, dates, dog weights and place names are preserved.
Three new actual-handler OFF/ON privacy probes also PASS.

### Real PostgreSQL Cleanup And Concurrency

The old PGlite-only limitation is resolved with a disposable, loopback-only
PostgreSQL **18.4**, 40 independent backend processes and synthetic data.
Native tooling: @embedded-postgres/windows-x64 18.4.0-beta.17, pg 8.16.3,
installed under the OS TEMP directory with install scripts disabled; no repo
dependency/lockfile changed. PGlite 0.5.8 / PG18.3 separately runs migration tests.

Runner: `client/scripts/ai/runQualityPostgresGate.mjs`.
It accepts only an absolute pg client module path, fixes host/port/user locally,
clears fixed PG environment names in its own process without reading values,
uses an empty password callback (no pgpass) with SSL disabled, and never loads a
connection URL/Production credential,
creates a fresh synthetic DB each run and logs aggregate evidence only.
Do not put a tunnel on 127.0.0.1:55439. This is not a Production CLI.
Both official predecessor migrations were applied unaltered before A/B/C/A1.1;
no partial SQL extraction or repair was used for schema creation.

Evidence DB: `ai_quality_gate_1789025516932` (TEMP cluster only).
Plan fixture: 10,020 conversations, 59,700 messages, 20,000 events.

| Query | Before | After |
| --- | --- | --- |
| Empty conversation batch | Hash anti-join; Seq Scan all 20,000 events; message index probe only after hash filtering | Correlated scalar LIMIT 1; message Index Only Scan 520 loops; events Index Only Scan 70 loops; same 20 IDs |
| Expired messages | Existing retention index | Existing retention Index Scan, 100 rows |
| Expired events | Existing retention index | Existing retention Index Scan, 100 rows |

Root cause was planner decorrelation of NOT EXISTS into a hash anti-join, not a
missing event FK-prefix index. The scalar LIMIT probes retain indexed existence
checks. After plan: no unnecessary full events scan. Measured empty-batch time
2.876 ms before / 2.915 ms after: **not a speedup claim**. Gate is plan shape and
equal candidate IDs, not sub-millisecond noise. Real cleanup deleted exactly
100 messages, 100 events and 20 truly empty conversations, preserving event
FK semantics. Daily aggregation and storage counts still scan their relevant
data; the batch bound limits deletion, not all scan work.

40 unique pg_backend_pid sessions waited behind the same verified advisory
start barrier: 40 observations, 30 logical turns, 10 duplicate retries,
11 conversations, 60 messages, 30 deduplicated events.
Lost updates = 0; duplicate logical turns = 0.
20 concurrent feedback calls: 12 saved, 8 rate-limited, one active feedback row.
An overlapping maintenance transaction returned skipped rather than running twice.
Row/backlog thresholds were executed, not inferred:
99,999 messages normal; 100,000 warning; 250,000 critical;
50,000 due rows critical; 10,000 due rows warning.

### Measured Storage

All figures below are **local estimates**, not live Supabase allocation.
Each flavor uses 2,000 conversations, 4,000 messages and 2,000 events,
all actual schema indexes, mixed synthetic Chinese/English vocabulary.
User/assistant lengths: short 60/120; median 300/600; long 4,000/8,000
characters. A separate critical-excerpt sample uses 256/256 characters.
The repeatable vocabulary is compressible: incompressible text, metadata,
index fill/bloat, PG version, TOAST and workload can increase Production usage.

| Flavor / table | Heap bytes | Index bytes | Total bytes incl. TOAST/FSM/VM | Rounded total bytes/row |
| --- | ---: | ---: | ---: | ---: |
| Short messages | 1,859,584 | 1,605,632 | 3,497,984 | 875 |
| Short events | 1,171,456 | 1,032,192 | 2,236,416 | 1,119 |
| Short conversations | 385,024 | 565,248 | 983,040 | 492 |
| Median messages | 3,719,168 | 1,597,440 | 5,349,376 | 1,338 |
| Median events | 1,171,456 | 1,138,688 | 2,342,912 | 1,172 |
| Median conversations | 385,024 | 573,440 | 991,232 | 496 |
| Long messages | 3,899,392 | 1,654,784 | 11,173,888 | 2,794 |
| Long events | 1,171,456 | 1,122,304 | 2,326,528 | 1,164 |
| Long conversations | 385,024 | 573,440 | 991,232 | 496 |
| Critical excerpt messages | 2,678,784 | 1,638,400 | 4,349,952 | 1,088 |

Measurements use pg_relation_size, pg_indexes_size and pg_total_relation_size.
Total is not merely heap + indexes because TOAST and auxiliary forks matter.

Nine steady-state scenarios (decimal MB, **not a quota/headroom claim**):
C = conversations/day; M = persisted user + assistant messages/conversation;
T = M/2 turns. Assume 0.2 events/turn, events 90 days, conversations 90 days
after activity, messages 30 days for the original all-turn policy.
For a flavor with measured per-row bytes bm/be/bc:
`bytes = C*M*30*bm + C*T*0.2*90*be + C*90*bc`.

The last column illustrates the new non-critical policy with independent
20% signal probability and four-turn context coverage:
p = 1 - 0.8^4 + 0.8^4/16; effective message days = 8 + 22*p = 21.552.
It is an explicit illustrative model, not measured Production signal frequency.

| Conversations/day | Messages/conversation | All-turn 30d: short / median / long MB | Context/sample policy short-long MB |
| ---: | ---: | ---: | ---: |
| 100 | 6 | 26.2 / 34.9 / 61.0 | 21.8 - 46.9 |
| 100 | 12 | 48.0 / 65.3 / 117.6 | 39.1 - 89.3 |
| 100 | 20 | 77.1 / 105.8 / 193.1 | 62.3 - 145.8 |
| 500 | 6 | 131.1 / 174.4 / 305.2 | 108.9 - 234.4 |
| 500 | 12 | 240.1 / 326.4 / 588.1 | 195.7 - 446.5 |
| 500 | 20 | 385.4 / 529.2 / 965.3 | 311.4 - 729.2 |
| 1000 | 6 | 262.2 / 348.8 / 610.4 | 217.9 - 468.8 |
| 1000 | 12 | 480.1 / 652.9 / 1176.2 | 391.4 - 892.9 |
| 1000 | 20 | 770.7 / 1058.4 / 1930.6 | 622.9 - 1458.5 |

No-signal clean retention averages 9.375 days (15/16 at 8d, 1/16 at 30d).
All-signal workloads still require 30 days. Negative feedback frequency and
correlation can increase context coverage. Up to seven distinct observer
event types plus one active feedback can exist per turn: at eight events/turn,
the 1,000/day x 20-message event-only estimate rises to roughly 8.1-8.4 GB
over 90 days. Events cannot be silently dropped to fit a fictional Free quota.

These estimates exclude permanent review/owner/eval/metrics growth, other app
tables, WAL/backups, free-space reserve and late active conversations.
100/500/1000 conv/day correspond to low/medium/high TRAFFIC, not plan tiers.
Before Canary, measure the actual target PG/schema size and available headroom;
name the accountable operator and approved traffic/capture budget.
High signal/feedback pressure may require reducing collection or capacity
approval even with this protection. No Free-tier sustainability is certified.

### Capture Policy Decision

Keeping every normal transcript 30 days is unnecessary for error analysis and
costly: at 1,000 conversations/day x 20 messages, baseline is about
771-1,931 MB before other app/permanent data.
Chosen incremental policy keeps existing APIs and the sanitized feedback path:

- Normal clean turns: complete sanitized text for 8 days, preserving the existing
  7-day feedback-token window plus one calendar-day aggregation grace period.
- Stable clean sample: turn-hash bucket 0 out of 16 retains 30 days outside
  critical mode; retries never resample. This is a proportion, not a hard row cap.
- Signal or negative-feedback turn: 30 days; promote still-live prior two turns
  and current turn; next one is retained when it arrives. Late negative feedback
  also promotes an already-present next turn. No unbounded context recovery.
- Critical: disable clean long-term sampling and replace normal long transcripts
  with a <=256-character sanitized excerpt INCLUDING [CAPACITY_LIMIT] (at most
  239 text characters plus the marker for truncated input). Keep eight days for
  feedback; a subsequent negative vote promotes that already-sanitized excerpt
  to 30 days. Existing signal/current-neighbor evidence remains full and bounded.
- Events keep 90 days; review items, owner decisions, evals and daily metrics
  retain their permanent semantics. No pressure-based deletion of those records.

Tradeoff: critical-mode feedback still retrieves sanitized Q/A excerpts, but a
later negative vote cannot recover the omitted tail. Likewise pre-signal context
already truncated during critical pressure remains excerpted. Admin/Analyzer
must treat [CAPACITY_LIMIT] as incomplete evidence, never infer missing content.
There is NO client raw-transcript upload and NO read from original chat storage.
If complete late-feedback transcripts are an operational requirement, do not
activate critical collection without a separately approved capacity solution.

Capacity protection is row/backlog based, not guessed MB:
warning at message_rows or event_rows >=100,000, or due rows >=10,000;
critical at either >=250,000, or due rows >=50,000.
Daily maintenance refreshes the cached state once, so protection is not a
per-request hard quota and may lag a surge up to a schedule interval.
No per-turn global COUNT is introduced. Recent state is required by the
record RPC; missing or older-than-36-hour maintenance fails closed with 55000
before any Quality observation write. This isolates collection failure,
not a customer response failure. Operators must respond to signals, not assume
that bounded excerpts alone make unlimited event traffic safe.

### Maintenance Proposal (Not Executed)

Repo audit found no existing Vercel crons, pg_cron registration, maintenance
endpoint or cron-auth pattern for Quality. No scheduler/third-party service,
HTTP endpoint or Production secret was created here.
Prefer the existing Supabase database scheduler capability, subject to an
authorized target check. It can schedule SQL/functions and expose job history.
[Official Supabase Cron documentation](https://supabase.com/docs/guides/cron)
and [job management instructions](https://supabase.com/docs/guides/cron/quickstart)
were checked 2026-09-10. This does not verify pg_cron is installed in this project.

The proposal is server-internal SQL, no URL/header credential and no public
unauthenticated HTTP entrypoint. A future authorized operator should:
1. Verify exact project/database, PG version, extension availability, migration
   hashes, final grants and inactive collection flags. Check existing jobs for
   collisions; do not overwrite a same-name job.
2. Install/enable pg_cron only under separate approval if absent. If unavailable,
   keep Observer OFF and obtain approval for an authenticated operator runner;
   do not invent a new external scheduler or expose a public cleanup endpoint.
3. Assign the trusted job owner. The database owner schedules the SQL below,
   then SET LOCAL ROLE service_role limits the job's invocation privilege.
   No HMAC/service-role value belongs in SQL, URLs, report or cron metadata.
4. Schedule daily 02:20 Asia/Taipei. For a verified UTC cron timezone this is
   `20 18 * * *`; inspect `current_setting('cron.timezone', true)` first.
   Dashboard: Integrations -> Cron -> Jobs -> Create job, distinct name
   `ai-quality-daily-maintenance`, SQL snippet. Verify timezone before saving.
5. Job SQL to configure later (a WRITE, not an A2 read-only probe):

~~~sql
begin;
set local role service_role;
set local statement_timeout = '60s';
set local lock_timeout = '2s';
select public.run_ai_quality_maintenance(1000, 40);
commit;
~~~

At most 40 batches, each at most 1,000 messages/events/conversations selected;
aggregate Taipei yesterday first, then seal complete source days before cleanup.
Locks and expired-row selection are reused; overlapping runs skip, retries
continue from remaining evidence, metrics upserts/sealed days are idempotent.
Failure rolls the whole maintenance transaction back, including freshness.
The explicit outer session timeout is required; do not rely solely on a
function-local statement_timeout to bound an already-started SQL command.

Before Canary, execute one authorized maintenance rehearsal, then observe an
actual scheduled success and verify its state/metrics/deletion behavior. An
ad hoc recent successful call alone is NOT proof a scheduler is active.
Inspect only safe operational fields:

~~~sql
select last_completed_at, capture_mode, conversation_rows, message_rows,
       event_rows, cleanup_due_count
from public.ai_quality_maintenance_state;

select jobid, jobname, schedule, active
from cron.job where jobname = 'ai-quality-daily-maintenance';

select status, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'ai-quality-daily-maintenance'
)
order by start_time desc limit 10;
~~~

Do not dump job commands/connection metadata or arbitrary return_message values.
Use Dashboard job history plus safe counts; never log payload/PII on failure.
Assign the site owner or named approved operator to daily checks and alerts:
failed job, no completed run by 26h, oldest/critical backlog, or critical mode
requires action. At >36h collection rejects automatically; customer AI continues.
If a bounded run leaves backlog, diagnose/approve a retry or schedule change;
never run an unbounded DELETE, truncate Production tables or drop safety checks.
A dry empty-schema test does not certify Production throughput. Verify autovacuum
and actual disk headroom before high-volume collection; deletion can free
reusable space without immediately shrinking physical files.

### Activation Boundaries And Stop Conditions

A2 schema-only with all flags OFF: scheduler may be absent. Must still obtain
new approval, inspect live drift/dependencies/ACLs and compare these exact bytes.
No A2 execution was performed during A1.1.
Before Observer Canary: deployed hardening sanitizer AND all four migrations,
successful scheduled maintenance, freshness/backlog alert owner, target-engine
measurement and actual available capacity are mandatory. Flags remain OFF here.

STOP for: any synthetic leak; any new unrelated regression; changed historical
migration; unknown Production schema/grants; missing fresh maintenance or job
proof; unexpected raw text in Quality; absent target capacity evidence;
unbounded backlog, or new model/customer-state behavior.
The RPC freshness guard blocks observations when maintenance is missing/stale.
It does not itself inspect cron registration; the release gate must verify the
schedule and alert path, not merely set an env flag.

### Verification And Changed Files

Local automated evidence:
- Quality suites: 769/769; hardening migration suite 41/41.
- Privacy hardening: 336/336 (270 persisted corpus); legacy privacy: 157/157.
- Actual handler: 170/170. OFF/ON answer, response_kind, scenario, pending,
  quote and provider counts stay equal; existing certified 20-case owner paths
  are still covered. Mock provider paths are not real model requests.
- Real PG large-plan, 40-session concurrency, feedback, pressure and storage gate:
  PASS; real DeepSeek/model calls: 0.
- FAQ: 98/98; CSV 310 approved, 0 errors, 98 pre-existing warnings;
  official build dry-run byte projection unchanged. Optional embeddings absent,
  not required. No FAQ/MD writes.
- Full repo: **2708/2710 PASS**, exactly the two existing
  `client/src/data/aboutContent.test.ts` failures. Its source/test and About.tsx
  are raw-byte identical to HEAD. No assertion was relaxed.
- `npm.cmd run check -- --incremental false`: PASS.
- `npm.cmd run build`: PASS after retrying a sandbox EPERM on generated dist
  copying with authorized local permissions. Existing Vite large-chunk warning
  remains. FAQ tooling's existing Node module-type warning remains.
- `git diff --check`: PASS; untracked new artifacts also checked separately.
- Historical migrations: byte-identical; no extra runtime model call,
  semantic/scenario/pending/pricing/customer-wording change.

Exactly seven changed/untracked files, none staged:
1. client/server/aiQuality/privacy.js
2. client/server/aiQuality/privacyHardening.test.js
3. client/server/aiQuality/activationHardening.test.js
4. client/tests/api/ai-chat-structured.test.js
5. client/scripts/ai/runQualityPostgresGate.mjs
6. client/supabase/migrations/2026-09-10-ai-quality-activation-hardening.sql
7. docs/AI_QUALITY_PRODUCTION_ACTIVATION.md (pre-existing A1 runbook)

Temporary DB files contain synthetic data only and are outside the repo.
No dependency or lockfile edit. Local PostgreSQL is stopped after verification.
Production DB/env unchanged; no migration execution artifact from Production.
A1.1 = PASS; recommend A1 = PASS; recommend next **approval for A2 schema-only**.
Observer/feedback activation remains a later explicit gate.

## Historical A1 Audit (Superseded)

The following is the original A1 FAIL record. Its three-migration inventory,
old privacy limitations and old capacity conclusions are historical. Use the
A1.1 manifest, capture policy and activation boundaries above for next steps.

## A1 Verdict

Audit date: 2026-09-10. Checkpoint: `3c8842a50441d8e9d59831bb7407bfd405038870`.
Branch: `main`. Initial worktree: clean. No Production connection, schema write,
env change, deployment, commit, or push was performed.

**A1 GATE: FAIL. Step A2 recommendation: NO until the readiness findings below
are resolved or explicitly dispositioned in a new gate.**
The three application migrations apply successfully on the official local
predecessor schema. Do not confuse that SQL success with permission to activate
the observer or a guarantee that sanitized free text contains no PII.

### Findings

| ID | Finding | Evidence / required disposition |
| --- | --- | --- |
| A1-01 | Privacy canary does not satisfy a no-raw-PII activation claim. | The current `sanitizeAiQualityText` retains synthetic, explicitly labelled name and address values. It normalizes punctuation, which is NOT redaction. Phase 1A/1B/1C documents already disclose incomplete name/address coverage. No real customer data was read or leaked during this audit. Do not enable collection until an owner-approved privacy boundary/remediation passes a separate gate. No runtime fix is authorized here. |
| A1-02 | Cleanup scan work is not bounded by the delete batch. | At 10,000 conversations / 20,000 messages / 20,000 events, the empty-conversation anti-join used a sequential scan over events. Expired messages/events used their retention indexes. Full-day aggregation and storage COUNTs can also examine many rows. This is not an unbounded DELETE, but a blanket no-full-scan/performance PASS is unsupported. Benchmark the target engine and planned volume before collection. |
| A1-03 | Retention is callable, not scheduled. | Foundation explicitly installs no scheduler. A generated expiry timestamp does not delete a row. Assign an approved cleanup operator/schedule, timeout and backlog alert before Observer Canary; none was created here. Free-tier capacity cannot be certified from row counts without current headroom and measured row/index size. |
| A1-04 | Concurrent-transaction evidence has a limit. | RPC row locks, arithmetic updates, unique indexes and rollback were verified. Existing concurrent Promise tests use one PGlite connection, not independent server sessions. No local psql/postgres/docker command was available. A separate target-version, multi-session rehearsal is required before claiming measured contention/latency safety. This is not a discovered lost-update defect. |

Schema-only findings that are operational preconditions, not new code defects:
- Phase 1C requires existing `public.admin_permissions`. A platform-only database
  passes A/B but C fails `42P01`, with its transaction rolled back.
- Replaying A alone after B/C downgrades `ai_quality_valid_metadata`. Ordered
  A/B/C replay and repeated B/C preserve the final schema. Never retry old A
  against active writers or replay the entire historical application directory.
- Repo collision audit cannot detect manual Production drift. A2 must start with
  separately authorized, read-only live prechecks and exact artifact comparison.

## Migration Manifest

All paths below are relative to the repository root. Execute these files only
after a new explicit A2 approval, exactly in this order:

| Phase | File under `client/supabase/migrations/` | SHA256 of working bytes |
| --- | --- | --- |
| 1A | `2026-09-09-ai-quality-foundation.sql` | `f1ef296f6b77addb0461a82c19ea13c4ef2f41d783c7290fb70dfadfd5e5e637` |
| 1B | `2026-09-09-ai-quality-runtime-observer.sql` | `f18a1fbc61eeefc5bd15e4a741cfd88c5e374e464eea3d89e99193493fcd59c1` |
| 1C | `2026-09-10-ai-quality-feedback-admin.sql` | `3a05655b38c180bae1529383662005bf5297e8ecb9b0c0ba35f371b71477ee94` |

Byte-identical to their committed versions:
- A: `e4650054bb7b4017061426ef3db1d97d9bdbd486`; Git blob `c6840931a467e8753870cfa10ec681db5f3f2fa5`.
- B: `08002542eaf1a655e79bf5970127ad3af6aff212`; Git blob `61508aaac7b3e94b66213b9ba99d98c3de73b233`.
- C: current checkpoint; Git blob `c49d7f33e3a098c1131eecd713c99a1a8e736853`.
- No historical migration was edited.

A creates seven tables, their checks/FKs/indexes, four immutable validators,
an updated-at trigger function, three triggers and three maintenance functions.
It enables RLS, installs **zero policies**, revokes PUBLIC/anon/authenticated CRUD,
and grants service_role CRUD/EXECUTE.

B extends the metadata validator, adds conversation `observer_turn_count`,
message `turn_key_hash` / `execution_metadata`, event `turn_key_hash`, two
unique idempotency indexes and `record_ai_quality_turn(jsonb)`.
It initializes observer_turn_count from historical AI message turn indexes.
That UPDATE is an AI-only compatibility backfill, not a runtime COUNT query.

C adds message `feedback_window_at` / `feedback_request_count` and event
`feedback_category` / `feedback_updated_at` / `reviewed_at`, three indexes,
five RPCs and two Admin permission codes (`ai_quality.view` / `ai_quality.review`).
It does not grant those permissions to every ordinary Admin role.
Existing super_admin permission loading reads all permission codes; other roles
still need deliberately approved permission assignments.

Final executed catalog: **7 tables, 94 columns, 34 indexes, 71 non-NOT-NULL
constraints (55 CHECK, 7 PK, 6 FK, 3 UNIQUE), 14 functions, 3 triggers, 0 policies**.
PostgreSQL 18 reports NOT NULL constraints separately; do not compare that
engine-specific total blindly to older server versions.
Detailed column, constraint and index inventory appears below.

## Fresh Apply And Dependencies

Engine: in-memory PGlite 0.5.8, PostgreSQL 18.3; no network/Production data.
The local platform fixture only supplies Supabase's three roles and auth.users(id).
It is not a claim to reproduce the complete Supabase platform or its live ACLs.

Before the A/B/C test, the empty application database received these **unaltered
official predecessor migrations**, with the bundled pgcrypto extension available:
1. `2026-06-16-shop-warehouse-assets.sql`
2. `2026-06-17-admin-users-roles-permissions.sql`

The latter requires auth.users, pgcrypto and shop_housekeeping_records. No
hand-created admin_permissions table, partial SQL extraction, skipped statement
or repair SQL was used. Immediately before A, the AI table count was zero.
A -> B -> C then completed without intervention (local times 22 / 4 / 3 ms,
not Production estimates). Tests add synthetic rows only AFTER successful apply.

A/B/C alone are not a standalone application bootstrap: on a second platform-only
database, A and B passed, C failed on missing admin_permissions. That negative
dependency test is expected; do not repair Production ad hoc or replay the
Admin predecessor there (it also reseeds roles/permissions).

Dependency graph: platform -> official warehouse -> official Admin permissions;
A -> B -> C, with Admin permissions -> C. No function/policy dependency cycle.
FKs are confined to these seven Quality tables; C's permission INSERT is the only
write to a pre-existing application table. No Booking/chat core schema change.

Repo audit scanned all 49 tracked SQL files and searched Quality references
repo-wide. The 45 distinct explicit Quality table/function/index names have no
unexpected definitions outside A/B/C. The same-signature metadata replacement
in A/B is intentional. There are no SQL enum objects or new policies.
Unexpected overloads/objects in live Production remain unknown, not assumed absent.

## Replay And Migration Mechanism

Each Quality file has its own BEGIN/COMMIT. A failed file rolls back that file;
successfully committed earlier files remain. Transport uncertainty requires
inspection of actual schema/ledger before any retry.

Fresh final catalog and complete ordered A/B/C replay were identical, including
columns/checks/indexes/function definitions and permission rows. Repeated B and C
were also identical. Tables/indexes/columns use IF NOT EXISTS, functions use
CREATE OR REPLACE, and permission rows use ON CONFLICT DO NOTHING. No duplicated
table/function/policy/index/enum/constraint was produced in these local replays.
IF NOT EXISTS is **not** validation or repair of an incompatible existing object.

The repo has dated hyphenated SQL files but no tracked Supabase config.toml,
migration application npm script or demonstrated migration ledger integration.
Do not claim that a framework has guaranteed exactly-once execution. Inspect the
actual chosen operator/tool and its history in A2. Do not blindly run db push,
rename historical files, or infer deployment automatically applies migrations.

A-alone regression was explicitly tested using valid B metadata:
`{before_version:1,after_version:1,read_only_turn:true}` within observer metadata.
Validation: before replay TRUE -> after A alone FALSE -> after B/C TRUE.
Keep all flags OFF while applying/resuming an approved ordered migration plan.

## Security And Data Lifecycle

Seven-table ACL checks: anon/authenticated deny all **56 CRUD combinations**;
service_role has all 28 CRUD grants. RLS is enabled on 7/7 tables, FORCE RLS is
not set, and policies are absent. Owner/BYPASSRLS access is intentional.
Function EXECUTE checks: anon/authenticated deny 28/28; service_role allowed 14/14.

Nine RPCs use SECURITY DEFINER; four validators and the trigger function use
invoker rights. Fixed `search_path=public, pg_temp` applies to all 14. Application
objects are schema qualified; pg_catalog resolves implicitly first; pg_temp is
last. This is safe only if untrusted users cannot CREATE in public. The local
roles could not; verify every live untrusted role/PUBLIC membership before A2.
SECURITY DEFINER is not strictly necessary for service_role today because it
already has BYPASSRLS/CRUD. It preserves the repo's privileged RPC boundary;
do not broaden EXECUTE or treat it as an additional browser permission.
No user-controlled SQL identifiers/interpolation occur in the RPCs. The only
dynamic SQL is fixed-table-list migration DDL using format %I.

Messages expire at created_at + 30 UTC days; events at +90 UTC days.
Conversation expiry is last_activity_at +30 days but deletion requires no retained
messages AND no retained events, so event-bearing conversations can live ~90 days
or longer if active. Resolved reviews, owner decisions, eval cases and daily
metrics are permanent until a separately authorized process handles them.

All six Quality FKs use RESTRICT or SET NULL, **zero CASCADE**. Message deletion
clears only event.quality_message_id, preserving conversation/review references.
Owner decision -> review is RESTRICT; eval -> review is SET NULL.
Cleanup never deletes the four permanent tables. Daily metrics are finalized
before a partial batch removes source evidence; subsequent aggregation returns
the finalized snapshot instead of recounting deleted rows.

Cleanup is one advisory-lock-protected transaction, batch 1..10000, with
SKIP LOCKED selections and UUID/PK-based deletion. The batch limit applies
separately to each table, not total work or scanned rows. Do not schedule cleanup
inside the customer response path. Use an explicitly approved maintenance timeout
and retry policy; the maintenance functions themselves have no statement timeout.
Dead tuples still require normal vacuum; deleting rows does not immediately
shrink relation files or recover physical quota.

Observer: conversation upsert -> FOR UPDATE -> same-turn existence check ->
two messages -> unique events -> arithmetic counters, all within one function
transaction. Distinct turn sequence and same-turn replay were verified.
An injected local event-insert error rolled back the entire new turn.
Counters are cumulative accepted writes, NOT retained-row counts after cleanup.
Idempotency survives while a message or event hash remains; after all evidence
expires this is not an eternal replay ledger. Do not replay old observations.

Feedback: same conversation-then-message lock order, atomic minute-window limit
(12 requests/message/minute), partial unique active-feedback index for non-null
runtime turn hashes, repeat idempotency, polarity switch and latest-category
replacement. Existing null-hash legacy rows are outside that uniqueness guarantee;
precheck them rather than assuming every service-role insert followed the RPC.
Verified positive -> positive -> negative(A) -> negative(B): one active record,
latest category, counter increment only for first insertion.

Feedback tokens contain only HMAC conversation/turn references and version/time;
no raw conversation/message identifier. Signature and expiry are checked before
the service RPC. Token values are not stored in Quality tables. Unknown/expired/
invalid references safely reject. Admin evidence UUIDs are exposed only through
authenticated permission-checked server APIs, not public enumeration endpoints.
DB sanitized-text checks enforce lengths, NOT universal PII recognition (A1-01).

## Capacity And Index Cost

Assumptions: messages include BOTH user and assistant rows (two rows per turn).
Steady daily traffic, timely cleanup, average 0.2 persisted events/turn including
feedback is a planning scenario, not an observed rate. Stress column assumes
8 unique events/turn (7 observer types plus 1 active feedback); direct service
writes outside the runtime contract are not bounded by this assumption.

| Conversations/day | Messages/conversation | Messages retained 30d | Events retained 90d at 0.2/turn | Stress events at 8/turn |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 6 | 18,000 | 5,400 | 216,000 |
| 100 | 12 | 36,000 | 10,800 | 432,000 |
| 100 | 20 | 60,000 | 18,000 | 720,000 |
| 500 | 6 | 90,000 | 27,000 | 1,080,000 |
| 500 | 12 | 180,000 | 54,000 | 2,160,000 |
| 500 | 20 | 300,000 | 90,000 | 3,600,000 |
| 1,000 | 6 | 180,000 | 54,000 | 2,160,000 |
| 1,000 | 12 | 360,000 | 108,000 | 4,320,000 |
| 1,000 | 20 | 600,000 | 180,000 | 7,200,000 |

Formulas: C*M*30; C*(M/2)*event_rate*90.
Without cleanup these are NOT upper bounds. Four permanent tables also grow
outside the retention windows. Messages (up to 8,000 characters each plus metadata)
and events (90d, multiple JSON fields and 11 indexes) are the main risks.
UTF-8 bytes, TOAST/compression, UUID/hash B-trees, bloat, WAL and existing database
usage prevent a precise MB estimate from row counts. No current Free-tier quota
was looked up or assumed. The largest scenario cannot honestly be certified as
fitting a Free project without measuring representative byte sizes and headroom.

Final index count 34: 10 PK/UNIQUE-constraint indexes plus 24 explicit indexes.
The per-index mapping in the inventory distinguishes live queries, integrity/FK
support, and future-only overhead. No index was added/removed in A1.

Local plan fixture: 10,000 conversations / 20,000 messages / 20,000 events,
5% expired conversations and 5% expired messages/events; ANALYZE performed locally.
- Expired message selection: ai_quality_messages_retention_idx, Index Scan.
- Expired event selection: ai_quality_events_retention_idx, Index Scan.
- Empty conversations: conversation retention Bitmap Index Scan, message
  turn-role index probe, but events Hash Anti Join with Seq Scan over 20,000 rows.
- Admin page: ai_quality_events_page_idx, Index Scan, LIMIT 26.
- Daily message count: ai_quality_messages_created_idx, Index Only Scan.
- Actual local batch100: 100 messages / 100 events deleted, 0 conversations,
  ~19 ms. This is NOT a hosted latency prediction or sustained-load test.
- No forced planner settings were used. Index presence alone does not prove
  index use for all distributions. Explain the actual target-version plan.

## Lock And Rollback Plan

A creates new Quality objects and grants; there is no Booking/chat backfill.
B/C ALTER the newly created Quality tables and build normal (non-concurrent)
indexes; ALTER can take strong locks, and index builds block writes on those
Quality tables. B's counter initialization scans existing Quality messages and
may update Quality conversations. Adding constant-default columns on the tested
engine does not require a data rewrite; still verify the actual server version.
The C unique index can fail if existing active-feedback duplicates exist.

C also takes an INSERT/ROW EXCLUSIVE lock on existing admin_permissions for two
codes (and index row locks if concurrent permission editing occurs). No migration
targets Booking, payment, cancellation, core chat or customer tables and there
are no FKs from the Quality schema into those tables. Shared catalog/I/O load
still affects the same database. Do not promise zero Production impact or exact
wall-clock time; keep flags OFF, use a quiet window and an approved lock timeout.

Rollback strategies, not executed:
- **A: failed/uncertain migration.** Stop immediately. Roll back the failed open
  transaction via the operator's approved tool; inspect schema and confirmed
  commit boundaries. A/B may already be committed when C fails. Preserve approved
  SQL byte hashes and metadata-only execution status. Do not blindly retry, edit
  an old migration, create a substitute table or run historical Admin reseeding.
- **B: all applied, observer OFF.** Leave dormant schema in place with all flags
  OFF. No table DROP is needed. Correct problems with a separately approved new
  migration or a reviewed recovery plan after verified backup.
- **C: enabled and a problem occurs.** Stop rollout, disable observer and feedback;
  disable Admin if its read load or exposure contributes. Verify the *effective
  deployed* flags and in-flight writes actually stop. Changing a project setting
  is not by itself proof an existing deployment changed. Use an explicitly
  approved release/rollback route if needed; none is authorized by A1. Retain
  incident evidence under access control, avoid copying raw content into reports,
  and perform backup before any later data correction or schema rollback.
- Do not propose unbacked DROP, destructive cascade, blind schema rollback or
  cleanup as an emergency substitute for disabling collection.

## Planned Activation Order

Nothing in this section is executed or authorized by A1.

1. **A2 - Schema:** only after A1 findings are closed and explicit approval.
   Verify exact project/database identity privately, checkpoint/artifact hashes,
   platform version, roles/schema ACL, Admin dependency, absence or exact known
   migration prefix, no conflicting overloads/policies/indexes, backup/restore
   readiness and an ordered execution ledger. All flags OFF. Apply exact A/B/C
   separately with stop-on-error, checking each result. Never apply all repo SQL.
2. **B - Secret:** separately approve secure provisioning of the dedicated
   AI_QUALITY_HMAC_SECRET (at least 32 UTF-8 bytes; generate a high-entropy value
   in the owner's secret-management workflow). No value in commands, artifacts,
   logs, chat or git. Existing server database credentials are not this secret.
   Secret rotation invalidates existing feedback tokens and pseudonymous linkage;
   treat rotation as a separately reviewed operation, not routine retry.
3. **C - Observer Canary:** after privacy/cleanup/capacity/contention gates pass,
   enable only observer (100) on the explicitly approved deployment/cohort.
   Do not assume this global boolean provides per-customer sampling; code has no
   percentage/cohort switch. An isolated deployment using synthetic traffic is
   the safest first canary. Never route unapproved real customer data into it.
4. **D - Data Integrity:** audit count-only and privilege queries below. Compare
   the same synthetic turns with flags OFF/ON: customer answer, semantic state,
   provider count and HTTP status unchanged; one pair per unique turn, no lost
   counters, no unexpected Quality table writes. Check final effective flags,
   sidecar completion, PII canaries and latency before increasing exposure.
5. **E - Feedback:** separately approve 110. Check one signed token per eligible
   assistant result, absent token when disabled/missing secret, no raw references.
   Wait for that synthetic turn's sidecar completion before voting. Exercise
   positive/repeat/negative/category-change, expired/unknown tokens, one active
   row, rate limiting, and no extra model calls. Do not use real bookings.
6. **F - Admin:** separately approve 111. Verify least-privilege view/review
   permissions and expired-auth/401/403. Read only sanitized bounded evidence,
   keyset pagination and separately requested health metrics. Review only an
   approved synthetic event. No owner decisions/FAQ publishing/eval activation.

Canary acceptance: pre-agree duration/volume and a numeric latency threshold.
Suggested starting evidence: 20 unique synthetic turns, known-answer and
clarification/provider-error fixtures without calling a real provider, same-turn
delivery retries, two independent DB clients for concurrent persistence, missing
HMAC/DB timeout/schema-unavailable faults, and the complete supported PII matrix.
Record only counts/categories/latencies, never messages, tokens or secrets.
The model budget must not increase relative to the same baseline turns.

Daily maintenance ownership and a bounded schedule must be approved before
collection. Do not schedule a deletion job as part of this schema-only gate.
After separate approval, start with a small batch, observe due-count backlog,
duration, lock waits, vacuum and table/index bytes; do not loop indefinitely
inside a request or run unbounded maintenance automatically.

## Flag And Secret Matrix

Bit order: observer / feedback / Admin. Only the literal server string `true`
enables a flag. Unset/false/other values are OFF. No flag value was read or changed
on Production in A1.

| Bits | Observer writes | Customer feedback | Admin |
| --- | --- | --- | --- |
| 000 | None | No token; endpoint 404 | Auth checked; enabled:false |
| 100 | Best-effort sidecar | No token; endpoint 404 | Auth checked; enabled:false |
| 110 | Best-effort sidecar | Token + verified feedback RPC | Auth checked; enabled:false |
| 101 | Best-effort sidecar | No token; endpoint 404 | Permission-checked evidence access |
| 111 | Best-effort sidecar | Token + verified feedback RPC | Permission-checked evidence access |
| 010 | None | Disabled because observer OFF; endpoint 404 | Auth checked; enabled:false |
| 001 | None | No token; endpoint 404 | Existing evidence may be read |
| 011 | None | Disabled because observer OFF; endpoint 404 | Existing evidence may be read |

Observer ON with missing/short HMAC: preparation rejects, no Quality RPC write,
customer AI already has its response; only a safe warning category is logged.
Feedback ON with missing/short HMAC: no valid token; submitted tokens fail safely.
Admin reads do not require HMAC; they require Admin authentication/permissions,
Admin flag and existing server DB connectivity. Missing schema/DB failure returns
a controlled unavailable/not_initialized response, not fabricated statistics.
Feedback never signs with Supabase/Vercel/DeepSeek credentials.
No additional LLM request is introduced by observer/feedback/Admin or migrations.

## Verification SQL

**Prepared only. No query below was sent to Production in A1.**
Execute these only in the exact separately approved database. Read-only catalog
queries do not replace authenticated HTTP behavior checks. Do not export private
roles/accounts, raw data, connection strings or SQL-client credentials.

### Before A2: identity, dependencies and collisions

```sql
begin read only;
select current_setting('server_version') as server_version,
       current_setting('server_version_num') as server_version_num;
select r.rolname, r.rolcanlogin, r.rolbypassrls
from pg_roles r where r.rolname in ('anon','authenticated','service_role');
select to_regclass('public.admin_permissions') as admin_permissions,
       to_regclass('auth.users') as platform_users,
       to_regnamespace('supabase_migrations') as possible_migration_ledger;
select column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name='admin_permissions'
order by ordinal_position;
select k.conname,pg_get_constraintdef(k.oid)
from pg_constraint k
where k.conrelid=to_regclass('public.admin_permissions');
select r,has_schema_privilege(r,'public','CREATE') as public_create
from unnest(array['anon','authenticated','service_role']) r;
-- Count, do not display credentials or private role metadata.
select count(*) as public_create_acl_entries
from pg_namespace n cross join lateral aclexplode(
  coalesce(n.nspacl,acldefault('n',n.nspowner))) a
where n.nspname='public' and a.grantee=0 and a.privilege_type='CREATE';
select c.relname,c.relkind
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and
 (c.relname like 'ai_quality_%' or c.relname like 'ai_review_%'
  or c.relname like 'ai_owner_%' or c.relname like 'ai_eval_%'
  or c.relname like 'ai_daily_%')
order by c.relname;
select p.proname,pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
 and (p.proname like '%ai_quality%' or p.proname='aggregate_ai_daily_metrics')
order by p.proname,args;
rollback;
```

Expected on first activation: required platform roles/Admin permission schema
exist, untrusted public CREATE is false, Quality objects/functions are absent.
A live role hierarchy/extra schema owner must be reviewed, not merely the three
named role booleans. A ledger namespace alone is not proof these filenames were
recorded or applied by that framework. Inspect its actual version entries safely
only after confirming the ledger contract. Any unexpected Quality object,
signature or permission/policy drift: STOP. On a deliberate resume compare the
whole confirmed prefix, not merely object existence.

### After exact A/B/C: schema and RLS

```sql
begin read only;
with t(name) as (values ('ai_quality_conversations'),('ai_quality_messages'),
 ('ai_quality_events'),('ai_review_items'),('ai_owner_decisions'),
 ('ai_eval_cases'),('ai_daily_metrics'))
select t.name,c.relrowsecurity,c.relforcerowsecurity
from t left join pg_class c on c.oid=to_regclass('public.'||t.name);
select table_name,column_name,data_type,is_nullable,column_default,
       is_generated,generation_expression
from information_schema.columns
where table_schema='public' and table_name in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics')
order by table_name,ordinal_position;
select tablename,indexname,indexdef
from pg_indexes where schemaname='public' and tablename in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics')
order by tablename,indexname;
select c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid)
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics')
order by c.relname,k.conname;
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in
 ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
  'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
with t(name) as (values ('ai_quality_conversations'),('ai_quality_messages'),
 ('ai_quality_events'),('ai_review_items'),('ai_owner_decisions'),
 ('ai_eval_cases'),('ai_daily_metrics'))
select name,r,priv,has_table_privilege(r,'public.'||name,priv) as allowed
from t cross join unnest(array['anon','authenticated','service_role']) r
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE']) priv;
select p.proname,pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef,p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as public_user_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
 and (p.proname like '%ai_quality%' or p.proname='aggregate_ai_daily_metrics')
order by p.proname,args;
select tg.tgname,c.relname,pg_get_triggerdef(tg.oid)
from pg_trigger tg join pg_class c on c.oid=tg.tgrelid
where not tg.tgisinternal and c.oid in
 (to_regclass('public.ai_quality_conversations'),
  to_regclass('public.ai_review_items'),to_regclass('public.ai_eval_cases'));
select code,module,action from public.admin_permissions
where code in ('ai_quality.view','ai_quality.review') order by code;
rollback;
```

Expected: complete inventory below, 7 RLS enabled, 0 policies, 56 denied browser
CRUD checks, 14 functions with the stated fixed path and no browser EXECUTE.
Validate function bodies against the approved artifacts in a secure SQL session;
a matching name/signature alone is insufficient.

### Read-only canary integrity and privacy screening

Run in an explicitly approved short-lived canary dataset or bounded period.
These queries return counts only. Do not compare cumulative conversation counters
to retained rows after cleanup without accounting for deletions.

```sql
begin read only;
select count(*) as duplicate_message_groups from (
 select quality_conversation_id,turn_key_hash,role
 from public.ai_quality_messages where turn_key_hash is not null
 group by 1,2,3 having count(*)>1
) d;
select count(*) as duplicate_active_feedback_groups from (
 select quality_conversation_id,turn_key_hash
 from public.ai_quality_events
 where event_type in ('positive_feedback','negative_feedback')
 group by 1,2 having count(*)>1
) d;
select count(*) as null_turn_feedback_rows
from public.ai_quality_events
where event_type in ('positive_feedback','negative_feedback')
 and turn_key_hash is null;
select count(*) as incomplete_recent_turns from (
 select quality_conversation_id,turn_key_hash
 from public.ai_quality_messages
 where turn_key_hash is not null and created_at>=now()-interval '1 day'
 group by 1,2 having count(*)<>2 or count(distinct role)<>2
) t;
-- Allow in-flight sidecars to settle; audit a fixed canary window.
select count(*) as counter_mismatches_before_cleanup
from public.ai_quality_conversations c
where c.started_at>=now()-interval '1 day' and (
 c.message_count<>(select count(*) from public.ai_quality_messages m
                  where m.quality_conversation_id=c.id)
 or c.quality_event_count<>(select count(*) from public.ai_quality_events e
                         where e.quality_conversation_id=c.id)
 or c.observer_turn_count<>(select coalesce(max(turn_index),0)
                          from public.ai_quality_messages m
                          where m.quality_conversation_id=c.id));
select count(*) as unexpected_metadata_or_context
from public.ai_quality_events
where not public.ai_quality_valid_metadata(metadata_json)
   or not public.ai_quality_valid_context(sanitized_context);
select count(*) as invalid_hash_rows
from public.ai_quality_messages
where turn_key_hash is not null and turn_key_hash !~ '^[a-f0-9]{64}$';
-- Detection aid, NOT proof that PII is absent. Never select offending text.
select count(*) as recent_text_screen_hits
from public.ai_quality_messages
where created_at>=now()-interval '1 day' and (
 sanitized_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
 or sanitized_text ~ '(^|[^0-9])09[0-9 -]{8,12}([^0-9]|$)'
 or sanitized_text ~ '(^|[^0-9])[0-9]{10,30}([^0-9]|$)'
 or sanitized_text ~* '(sk-|sb_secret_|ghp_)[A-Za-z0-9_-]+'
 or sanitized_text ~* '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}');
select count(*) as negative_flag_mismatches_before_event_cleanup
from public.ai_quality_conversations c
where c.started_at>=now()-interval '1 day'
 and c.has_negative_feedback is distinct from exists(
   select 1 from public.ai_quality_events e
   where e.quality_conversation_id=c.id and e.event_type='negative_feedback');
rollback;
```

Expected anomaly counts zero in a settled fresh canary. Run schema key allowlists
and supported-format redaction canaries on both question and answer, plus explicit
labelled/unlabelled names and addresses. This regex scan cannot certify them.
Also screen any future review/owner/eval free text before collection. Today
observer/feedback/Admin do not populate those permanent evidence tables.
Do not join Production chat tables to export raw identifiers as an audit shortcut.
If synthetic source IDs are used, assert their absence locally/in the approved
canary without recording the source values. Do not dump message rows to a report.

### Performance and storage (read only)

```sql
begin read only;
explain (format json)
select id from public.ai_quality_messages where retention_expires_at<=now()
order by retention_expires_at,id limit 100;
explain (format json)
select id from public.ai_quality_events where retention_expires_at<=now()
order by retention_expires_at,id limit 100;
explain (format json)
select c.id from public.ai_quality_conversations c
where c.retention_expires_at<=now()
 and not exists(select 1 from public.ai_quality_messages m where m.quality_conversation_id=c.id)
 and not exists(select 1 from public.ai_quality_events e where e.quality_conversation_id=c.id)
order by c.retention_expires_at,c.id limit 100;
select relname,n_live_tup,n_dead_tup,last_autovacuum,last_autoanalyze
from pg_stat_user_tables where schemaname='public'
 and relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
 'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
select c.relname,pg_table_size(c.oid) as table_bytes,
       pg_indexes_size(c.oid) as index_bytes,pg_total_relation_size(c.oid) as total_bytes
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
 and c.relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
 'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
select relname,indexrelname,idx_scan,idx_tup_read,idx_tup_fetch
from pg_stat_user_indexes where schemaname='public'
 and relname in ('ai_quality_conversations','ai_quality_messages','ai_quality_events',
 'ai_review_items','ai_owner_decisions','ai_eval_cases','ai_daily_metrics');
-- Full counts: request deliberately, not on every UI load.
select public.get_ai_quality_storage_metrics();
rollback;
```

The read-only EXPLAINs deliberately omit row locks. Local audit also inspected
the exact FOR UPDATE SKIP LOCKED variants. Repeat those in an approved local
multi-session clone; never EXPLAIN ANALYZE a mutating Production RPC in a
read-only gate. Do not export pg_stat_activity.query (it can contain private data).
Measure lock waits via counts/categories only. A low idx_scan before activation
does not prove an integrity/FK index is unnecessary.

Cleanup/aggregation RPCs are **writes**, despite SELECT-call syntax. They are not
part of the SQL blocks above. Only after separate maintenance approval may an
operator use `select public.delete_expired_ai_quality_data(100);`, verify bounded
deletions and permanent rows/daily totals, then stop or schedule approved batches.
`aggregate_ai_daily_metrics(date)` also writes; never call it as a harmless
Production read probe.

## Stop Conditions And Evidence

Immediately stop further activation switches on any:
- Migration error, ambiguous commit boundary or unexpected schema/ledger drift.
- Public RLS/ACL/EXECUTE exposure or untrusted CREATE in the definer search path.
- Raw PII, raw conversation identifier, token, secret, prompt or model dump found.
- AI response/state/pricing regression or any additional provider call.
- Noticeable latency increase, breached agreed budget or problematic lock waits.
- Wrong counters, duplicate messages, duplicate active feedback or incomplete pair.
- Quality API failure affecting customer AI, false success metrics, or unbounded backlog.

Local evidence in this audit:
- Official predecessor + unchanged A/B/C fresh apply: PASS.
- Ordered replay and B/C retry schema equality: PASS; A-alone caveat documented.
- Schema contract / RLS / RPC privilege: PASS.
- Observer retry/25 distinct turns/forced-error full rollback: PASS.
- Feedback repeat, polarity/category switch, latest-state counters: PASS.
- Batch7 cleanup preserves 26 retained events, nulls only message references;
  later event cleanup preserves resolved review, owner decision, eval and sealed
  metrics: PASS. Storage counts and repeated daily aggregation: PASS.
- Existing focused Quality/API suites: 418/418 PASS (9 files).
- Full repo: 2327/2329; only the two pre-existing About copy assertions fail.
  Actual-handler 166/166 and feedback UI 6/6 included. No baseline test changed.
- Existing tests simulate provider/DB faults; real external LLM calls in A1: 0.
- Multi-session hosted concurrency/performance and current Free headroom:
  NOT VERIFIED; Production schema/private manual drift: NOT READ.
- Synthetic explicit name/address value retention: FAIL for a no-raw-PII gate.
  No real customer data or Production secret was used to discover it.
- Code, migrations, FAQ/MD, Booking, Facilities and About: unchanged.
- All four documented read-only SQL blocks executed successfully in the local
  fresh database; zero Production queries. Final tracked diff has no changes;
  the runbook is the only untracked file. Whitespace verification includes it.
- Typecheck/build were not requested for this documentation-only A1 and were not
  rerun; no code/build artifact modification was necessary.

Only `docs/AI_QUALITY_PRODUCTION_ACTIVATION.md` is the A1 deliverable.
No commit, push, deployment, Promote, Production migration or env change.
The runbook is a plan with an explicit hold, not approval to execute A2/B/C/D/E/F.

## Executed Schema Inventory

### Columns

Types/nullability below come from the fresh executed catalog, not a stub.
`?` means nullable; generated expiry values still derive from required timestamps.
Defaults and generation expressions are verified with the exact schema query above.

#### ai_quality_conversations

- `id`: `uuid` (NOT NULL).
- `conversation_key_hash`: `text` (NOT NULL).
- `started_at`: `timestamp with time zone` (NOT NULL).
- `last_activity_at`: `timestamp with time zone` (NOT NULL).
- `message_count`: `bigint` (NOT NULL).
- `quality_event_count`: `bigint` (NOT NULL).
- `has_negative_feedback`: `boolean` (NOT NULL).
- `has_escalation`: `boolean` (NOT NULL).
- `retention_expires_at`: `timestamp with time zone` (nullable); generated: `(((last_activity_at AT TIME ZONE 'UTC'::text) + '30 days'::interval) AT TIME ZONE 'UTC'::text)`.
- `created_at`: `timestamp with time zone` (NOT NULL).
- `updated_at`: `timestamp with time zone` (NOT NULL).
- `observer_turn_count`: `integer` (NOT NULL).

#### ai_quality_messages

- `id`: `uuid` (NOT NULL).
- `quality_conversation_id`: `uuid` (NOT NULL).
- `turn_index`: `integer` (NOT NULL).
- `role`: `text` (NOT NULL).
- `sanitized_text`: `text` (NOT NULL).
- `capability_id`: `text` (nullable).
- `response_kind`: `text` (nullable).
- `provider_used`: `boolean` (NOT NULL).
- `provider_call_count`: `integer` (NOT NULL).
- `scenario_changed`: `boolean` (NOT NULL).
- `pending_created`: `boolean` (NOT NULL).
- `pending_consumed`: `boolean` (NOT NULL).
- `generic_fallback`: `boolean` (NOT NULL).
- `clarification`: `boolean` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `retention_expires_at`: `timestamp with time zone` (nullable); generated: `(((created_at AT TIME ZONE 'UTC'::text) + '30 days'::interval) AT TIME ZONE 'UTC'::text)`.
- `turn_key_hash`: `text` (nullable).
- `execution_metadata`: `jsonb` (NOT NULL).
- `feedback_window_at`: `timestamp with time zone` (nullable).
- `feedback_request_count`: `integer` (NOT NULL).

#### ai_quality_events

- `id`: `uuid` (NOT NULL).
- `quality_conversation_id`: `uuid` (NOT NULL).
- `quality_message_id`: `uuid` (nullable).
- `review_item_id`: `uuid` (nullable).
- `event_type`: `text` (NOT NULL).
- `severity`: `text` (NOT NULL).
- `capability_id`: `text` (nullable).
- `sanitized_context`: `jsonb` (NOT NULL).
- `metadata_json`: `jsonb` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `retention_expires_at`: `timestamp with time zone` (nullable); generated: `(((created_at AT TIME ZONE 'UTC'::text) + '90 days'::interval) AT TIME ZONE 'UTC'::text)`.
- `resolved_at`: `timestamp with time zone` (nullable).
- `turn_key_hash`: `text` (nullable).
- `feedback_category`: `text` (nullable).
- `feedback_updated_at`: `timestamp with time zone` (nullable).
- `reviewed_at`: `timestamp with time zone` (nullable).

#### ai_review_items

- `id`: `uuid` (NOT NULL).
- `cluster_key`: `text` (nullable).
- `title`: `text` (NOT NULL).
- `sanitized_example`: `text` (NOT NULL).
- `sanitized_ai_answer`: `text` (nullable).
- `occurrence_count`: `bigint` (NOT NULL).
- `classification`: `text` (NOT NULL).
- `classification_confidence`: `numeric` (nullable).
- `status`: `text` (NOT NULL).
- `owner_action_required`: `boolean` (NOT NULL).
- `first_seen_at`: `timestamp with time zone` (NOT NULL).
- `last_seen_at`: `timestamp with time zone` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `updated_at`: `timestamp with time zone` (NOT NULL).
- `resolved_at`: `timestamp with time zone` (nullable).

#### ai_owner_decisions

- `id`: `uuid` (NOT NULL).
- `review_item_id`: `uuid` (NOT NULL).
- `action_type`: `text` (NOT NULL).
- `sanitized_owner_answer`: `text` (nullable).
- `created_at`: `timestamp with time zone` (NOT NULL).

#### ai_eval_cases

- `id`: `uuid` (NOT NULL).
- `source_review_item_id`: `uuid` (nullable).
- `eval_type`: `text` (NOT NULL).
- `capability_id`: `text` (nullable).
- `sanitized_input`: `text` (NOT NULL).
- `sanitized_context`: `jsonb` (NOT NULL).
- `expected_behavior`: `jsonb` (NOT NULL).
- `status`: `text` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `updated_at`: `timestamp with time zone` (NOT NULL).

#### ai_daily_metrics

- `metric_date`: `date` (NOT NULL).
- `conversation_count`: `bigint` (NOT NULL).
- `message_count`: `bigint` (NOT NULL).
- `positive_feedback_count`: `bigint` (NOT NULL).
- `negative_feedback_count`: `bigint` (NOT NULL).
- `generic_fallback_count`: `bigint` (NOT NULL).
- `clarification_count`: `bigint` (NOT NULL).
- `context_lost_signal_count`: `bigint` (NOT NULL).
- `wrong_mutation_signal_count`: `bigint` (NOT NULL).
- `provider_call_count`: `bigint` (NOT NULL).
- `provider_schema_reject_count`: `bigint` (NOT NULL).
- `provider_error_count`: `bigint` (NOT NULL).
- `review_item_count`: `bigint` (NOT NULL).
- `owner_required_count`: `bigint` (NOT NULL).
- `created_at`: `timestamp with time zone` (NOT NULL).
- `finalized_at`: `timestamp with time zone` (nullable).

### Constraints

These 71 entries exclude PostgreSQL-18-specific NOT NULL catalog rows; required
columns are listed above. There are no custom enum types. Text enums remain CHECKs.

| Table | Constraint | Definition |
| --- | --- | --- |
| `ai_daily_metrics` | `ai_daily_metrics_clarification_count_check` | `CHECK ((clarification_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_context_lost_signal_count_check` | `CHECK ((context_lost_signal_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_conversation_count_check` | `CHECK ((conversation_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_generic_fallback_count_check` | `CHECK ((generic_fallback_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_message_count_check` | `CHECK ((message_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_negative_feedback_count_check` | `CHECK ((negative_feedback_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_owner_required_count_check` | `CHECK ((owner_required_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_pkey` | `PRIMARY KEY (metric_date)` |
| `ai_daily_metrics` | `ai_daily_metrics_positive_feedback_count_check` | `CHECK ((positive_feedback_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_provider_call_count_check` | `CHECK ((provider_call_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_provider_error_count_check` | `CHECK ((provider_error_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_provider_schema_reject_count_check` | `CHECK ((provider_schema_reject_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_review_item_count_check` | `CHECK ((review_item_count >= 0))` |
| `ai_daily_metrics` | `ai_daily_metrics_wrong_mutation_signal_count_check` | `CHECK ((wrong_mutation_signal_count >= 0))` |
| `ai_eval_cases` | `ai_eval_cases_capability_id_check` | `CHECK (ai_quality_valid_capability_id(capability_id))` |
| `ai_eval_cases` | `ai_eval_cases_eval_type_check` | `CHECK ((eval_type = ANY (ARRAY['semantic'::text, 'context'::text, 'knowledge'::text, 'tool'::text, 'privacy'::text, 'regression'::text])))` |
| `ai_eval_cases` | `ai_eval_cases_expected_behavior_check` | `CHECK (((jsonb_typeof(expected_behavior) = 'object'::text) AND (octet_length((expected_behavior)::text) <= 16000)))` |
| `ai_eval_cases` | `ai_eval_cases_pkey` | `PRIMARY KEY (id)` |
| `ai_eval_cases` | `ai_eval_cases_sanitized_context_check` | `CHECK (ai_quality_valid_context(sanitized_context))` |
| `ai_eval_cases` | `ai_eval_cases_sanitized_input_check` | `CHECK (((char_length(sanitized_input) >= 1) AND (char_length(sanitized_input) <= 8000)))` |
| `ai_eval_cases` | `ai_eval_cases_source_review_item_id_fkey` | `FOREIGN KEY (source_review_item_id) REFERENCES ai_review_items(id) ON DELETE SET NULL` |
| `ai_eval_cases` | `ai_eval_cases_status_check` | `CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'retired'::text])))` |
| `ai_owner_decisions` | `ai_owner_decisions_action_type_check` | `CHECK ((action_type = ANY (ARRAY['reply_once'::text, 'create_knowledge_draft'::text, 'ai_should_know'::text, 'special_case'::text, 'ignore'::text])))` |
| `ai_owner_decisions` | `ai_owner_decisions_pkey` | `PRIMARY KEY (id)` |
| `ai_owner_decisions` | `ai_owner_decisions_review_item_id_fkey` | `FOREIGN KEY (review_item_id) REFERENCES ai_review_items(id) ON DELETE RESTRICT` |
| `ai_owner_decisions` | `ai_owner_decisions_sanitized_owner_answer_check` | `CHECK ((char_length(sanitized_owner_answer) <= 8000))` |
| `ai_quality_conversations` | `ai_quality_conversations_check` | `CHECK ((last_activity_at >= started_at))` |
| `ai_quality_conversations` | `ai_quality_conversations_conversation_key_hash_check` | `CHECK ((conversation_key_hash ~ '^[0-9a-f]{64}$'::text))` |
| `ai_quality_conversations` | `ai_quality_conversations_conversation_key_hash_key` | `UNIQUE (conversation_key_hash)` |
| `ai_quality_conversations` | `ai_quality_conversations_message_count_check` | `CHECK ((message_count >= 0))` |
| `ai_quality_conversations` | `ai_quality_conversations_observer_turn_count_check` | `CHECK ((observer_turn_count >= 0))` |
| `ai_quality_conversations` | `ai_quality_conversations_pkey` | `PRIMARY KEY (id)` |
| `ai_quality_conversations` | `ai_quality_conversations_quality_event_count_check` | `CHECK ((quality_event_count >= 0))` |
| `ai_quality_events` | `ai_quality_events_capability_id_check` | `CHECK (ai_quality_valid_capability_id(capability_id))` |
| `ai_quality_events` | `ai_quality_events_check` | `CHECK (((resolved_at IS NULL) OR (resolved_at >= created_at)))` |
| `ai_quality_events` | `ai_quality_events_event_type_check` | `CHECK ((event_type = ANY (ARRAY['positive_feedback'::text, 'negative_feedback'::text, 'generic_fallback'::text, 'possible_misunderstanding'::text, 'repeated_question'::text, 'unnecessary_clarification'::text, 'context_lost_signal'::text, 'wrong_mutation_signal'::text, 'provider_schema_reject'::text, 'provider_error'::text, 'manual_escalation'::text, 'owner_correction'::text, 'knowledge_gap_candidate'::text, 'tool_gap_candidate'::text])))` |
| `ai_quality_events` | `ai_quality_events_feedback_category_check` | `CHECK ((feedback_category = ANY (ARRAY['incorrect_answer'::text, 'misunderstood_question'::text, 'repeated_question'::text, 'too_verbose'::text, 'other'::text])))` |
| `ai_quality_events` | `ai_quality_events_message_conversation_fkey` | `FOREIGN KEY (quality_message_id, quality_conversation_id) REFERENCES ai_quality_messages(id, quality_conversation_id) ON DELETE SET NULL (quality_message_id)` |
| `ai_quality_events` | `ai_quality_events_metadata_json_check` | `CHECK (ai_quality_valid_metadata(metadata_json))` |
| `ai_quality_events` | `ai_quality_events_pkey` | `PRIMARY KEY (id)` |
| `ai_quality_events` | `ai_quality_events_quality_conversation_id_fkey` | `FOREIGN KEY (quality_conversation_id) REFERENCES ai_quality_conversations(id) ON DELETE RESTRICT` |
| `ai_quality_events` | `ai_quality_events_review_item_id_fkey` | `FOREIGN KEY (review_item_id) REFERENCES ai_review_items(id) ON DELETE SET NULL` |
| `ai_quality_events` | `ai_quality_events_sanitized_context_check` | `CHECK (ai_quality_valid_context(sanitized_context))` |
| `ai_quality_events` | `ai_quality_events_severity_check` | `CHECK ((severity = ANY (ARRAY['info'::text, 'low'::text, 'medium'::text, 'high'::text, 'critical'::text])))` |
| `ai_quality_events` | `ai_quality_events_turn_key_hash_check` | `CHECK ((turn_key_hash ~ '^[0-9a-f]{64}$'::text))` |
| `ai_quality_messages` | `ai_quality_messages_capability_id_check` | `CHECK (ai_quality_valid_capability_id(capability_id))` |
| `ai_quality_messages` | `ai_quality_messages_execution_metadata_check` | `CHECK (ai_quality_valid_metadata(execution_metadata))` |
| `ai_quality_messages` | `ai_quality_messages_feedback_request_count_check` | `CHECK ((feedback_request_count >= 0))` |
| `ai_quality_messages` | `ai_quality_messages_id_conversation_key` | `UNIQUE (id, quality_conversation_id)` |
| `ai_quality_messages` | `ai_quality_messages_pkey` | `PRIMARY KEY (id)` |
| `ai_quality_messages` | `ai_quality_messages_provider_call_count_check` | `CHECK (((provider_call_count >= 0) AND (provider_call_count <= 32)))` |
| `ai_quality_messages` | `ai_quality_messages_provider_check` | `CHECK ((provider_used = (provider_call_count > 0)))` |
| `ai_quality_messages` | `ai_quality_messages_quality_conversation_id_fkey` | `FOREIGN KEY (quality_conversation_id) REFERENCES ai_quality_conversations(id) ON DELETE RESTRICT` |
| `ai_quality_messages` | `ai_quality_messages_response_kind_check` | `CHECK (ai_quality_valid_response_kind(response_kind))` |
| `ai_quality_messages` | `ai_quality_messages_role_check` | `CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))` |
| `ai_quality_messages` | `ai_quality_messages_sanitized_text_check` | `CHECK ((char_length(sanitized_text) <= 8000))` |
| `ai_quality_messages` | `ai_quality_messages_turn_index_check` | `CHECK ((turn_index > 0))` |
| `ai_quality_messages` | `ai_quality_messages_turn_key_hash_check` | `CHECK ((turn_key_hash ~ '^[0-9a-f]{64}$'::text))` |
| `ai_quality_messages` | `ai_quality_messages_turn_role_key` | `UNIQUE (quality_conversation_id, turn_index, role)` |
| `ai_quality_messages` | `ai_quality_messages_user_provider_check` | `CHECK (((role = 'assistant'::text) OR (provider_call_count = 0)))` |
| `ai_review_items` | `ai_review_items_check` | `CHECK ((last_seen_at >= first_seen_at))` |
| `ai_review_items` | `ai_review_items_check1` | `CHECK (((resolved_at IS NULL) OR (resolved_at >= first_seen_at)))` |
| `ai_review_items` | `ai_review_items_classification_check` | `CHECK ((classification = ANY (ARRAY['semantic_gap'::text, 'context_gap'::text, 'knowledge_gap'::text, 'tool_gap'::text, 'special_case'::text, 'unknown'::text])))` |
| `ai_review_items` | `ai_review_items_classification_confidence_check` | `CHECK (((classification_confidence >= (0)::numeric) AND (classification_confidence <= (1)::numeric)))` |
| `ai_review_items` | `ai_review_items_cluster_key_check` | `CHECK (((cluster_key IS NULL) OR (cluster_key ~ '^[0-9a-f]{64}$'::text)))` |
| `ai_review_items` | `ai_review_items_occurrence_count_check` | `CHECK ((occurrence_count > 0))` |
| `ai_review_items` | `ai_review_items_pkey` | `PRIMARY KEY (id)` |
| `ai_review_items` | `ai_review_items_sanitized_ai_answer_check` | `CHECK ((char_length(sanitized_ai_answer) <= 8000))` |
| `ai_review_items` | `ai_review_items_sanitized_example_check` | `CHECK (((char_length(sanitized_example) >= 1) AND (char_length(sanitized_example) <= 8000)))` |
| `ai_review_items` | `ai_review_items_status_check` | `CHECK ((status = ANY (ARRAY['new'::text, 'triaged'::text, 'needs_owner'::text, 'auto_improvement_candidate'::text, 'resolved'::text, 'ignored'::text])))` |
| `ai_review_items` | `ai_review_items_title_check` | `CHECK (((char_length(title) >= 1) AND (char_length(title) <= 240)))` |

### Indexes

All 34 indexes are B-tree. Future-only indexes are reported, not removed.
PK/UNIQUE and FK-support indexes are not judged solely by user-facing SELECT usage.

| Index | Definition | Current use / overhead |
| --- | --- | --- |
| `ai_daily_metrics_pkey` | `CREATE UNIQUE INDEX ai_daily_metrics_pkey ON public.ai_daily_metrics USING btree (metric_date)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_eval_cases_pkey` | `CREATE UNIQUE INDEX ai_eval_cases_pkey ON public.ai_eval_cases USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_eval_cases_review_idx` | `CREATE INDEX ai_eval_cases_review_idx ON public.ai_eval_cases USING btree (source_review_item_id)` | Review FK SET NULL and future linked eval lookup. |
| `ai_owner_decisions_pkey` | `CREATE UNIQUE INDEX ai_owner_decisions_pkey ON public.ai_owner_decisions USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_owner_decisions_review_created_idx` | `CREATE INDEX ai_owner_decisions_review_created_idx ON public.ai_owner_decisions USING btree (review_item_id, created_at)` | Review FK and future ordered owner decision history. |
| `ai_quality_conversations_activity_idx` | `CREATE INDEX ai_quality_conversations_activity_idx ON public.ai_quality_conversations USING btree (last_activity_at DESC)` | Admin overview recent conversations, bounded sample. |
| `ai_quality_conversations_conversation_key_hash_key` | `CREATE UNIQUE INDEX ai_quality_conversations_conversation_key_hash_key ON public.ai_quality_conversations USING btree (conversation_key_hash)` | Required unique HMAC lookup/upsert and feedback lookup. |
| `ai_quality_conversations_pkey` | `CREATE UNIQUE INDEX ai_quality_conversations_pkey ON public.ai_quality_conversations USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_quality_conversations_retention_idx` | `CREATE INDEX ai_quality_conversations_retention_idx ON public.ai_quality_conversations USING btree (retention_expires_at, id)` | Cleanup/health expiry selection. |
| `ai_quality_conversations_started_idx` | `CREATE INDEX ai_quality_conversations_started_idx ON public.ai_quality_conversations USING btree (started_at)` | Daily conversation aggregation by started_at. |
| `ai_quality_active_feedback_idx` | `CREATE UNIQUE INDEX ai_quality_active_feedback_idx ON public.ai_quality_events USING btree (quality_conversation_id, turn_key_hash) WHERE (event_type = ANY (ARRAY['positive_feedback'::text, 'negative_feedback'::text]))` | Required one current feedback polarity per non-null hashed turn. |
| `ai_quality_events_conversation_idx` | `CREATE INDEX ai_quality_events_conversation_idx ON public.ai_quality_events USING btree (quality_conversation_id, created_at DESC)` | Conversation existence/FK/recent-event lookup; overlapping left prefix with idempotency index, but adds created_at order. |
| `ai_quality_events_created_idx` | `CREATE INDEX ai_quality_events_created_idx ON public.ai_quality_events USING btree (created_at)` | Daily aggregation date range; overlaps page index's created_at prefix. Measure redundancy before any later removal. |
| `ai_quality_events_idempotency_idx` | `CREATE UNIQUE INDEX ai_quality_events_idempotency_idx ON public.ai_quality_events USING btree (quality_conversation_id, turn_key_hash, event_type)` | Required unique observer event type per hashed turn and idempotency lookup. |
| `ai_quality_events_message_idx` | `CREATE INDEX ai_quality_events_message_idx ON public.ai_quality_events USING btree (quality_message_id, quality_conversation_id)` | FK action when message expires; same-conversation message reference. |
| `ai_quality_events_page_idx` | `CREATE INDEX ai_quality_events_page_idx ON public.ai_quality_events USING btree (created_at DESC, id DESC)` | Current Admin descending created_at/id keyset page and overview sample. |
| `ai_quality_events_pkey` | `CREATE UNIQUE INDEX ai_quality_events_pkey ON public.ai_quality_events USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_quality_events_retention_idx` | `CREATE INDEX ai_quality_events_retention_idx ON public.ai_quality_events USING btree (retention_expires_at, id)` | 90-day cleanup and due-count range. |
| `ai_quality_events_review_idx` | `CREATE INDEX ai_quality_events_review_idx ON public.ai_quality_events USING btree (review_item_id)` | Review FK and review-linked evidence. No current Admin review-item UI query; retain FK-support distinction. |
| `ai_quality_events_type_created_idx` | `CREATE INDEX ai_quality_events_type_created_idx ON public.ai_quality_events USING btree (event_type, created_at DESC)` | Type-filtered Admin timeline/negative state; query planner may prefer page index for keyset ordering. |
| `ai_quality_events_unresolved_idx` | `CREATE INDEX ai_quality_events_unresolved_idx ON public.ai_quality_events USING btree (created_at DESC) WHERE (resolved_at IS NULL)` | FUTURE-ONLY overhead: current Admin pending filter uses reviewed_at, not resolved_at. No production query path using this partial predicate found. |
| `ai_quality_messages_created_idx` | `CREATE INDEX ai_quality_messages_created_idx ON public.ai_quality_messages USING btree (created_at)` | Daily message aggregation / oldest-message metric. |
| `ai_quality_messages_id_conversation_key` | `CREATE UNIQUE INDEX ai_quality_messages_id_conversation_key ON public.ai_quality_messages USING btree (id, quality_conversation_id)` | Composite FK target; enforces event message belongs to the same conversation (not redundant despite UUID PK). |
| `ai_quality_messages_idempotency_idx` | `CREATE UNIQUE INDEX ai_quality_messages_idempotency_idx ON public.ai_quality_messages USING btree (quality_conversation_id, turn_key_hash, role)` | Required runtime same-turn/role retry uniqueness and lookup. |
| `ai_quality_messages_pkey` | `CREATE UNIQUE INDEX ai_quality_messages_pkey ON public.ai_quality_messages USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_quality_messages_retention_idx` | `CREATE INDEX ai_quality_messages_retention_idx ON public.ai_quality_messages USING btree (retention_expires_at, id)` | Cleanup and due-count expiry range. |
| `ai_quality_messages_turn_role_key` | `CREATE UNIQUE INDEX ai_quality_messages_turn_role_key ON public.ai_quality_messages USING btree (quality_conversation_id, turn_index, role)` | Required unique turn/role; ordered nearby-turn context and conversation existence probe. |
| `ai_review_items_classification_seen_idx` | `CREATE INDEX ai_review_items_classification_seen_idx ON public.ai_review_items USING btree (classification, last_seen_at DESC)` | FUTURE-ONLY classification triage; no current live query path. |
| `ai_review_items_cluster_idx` | `CREATE UNIQUE INDEX ai_review_items_cluster_idx ON public.ai_review_items USING btree (cluster_key) WHERE (cluster_key IS NOT NULL)` | Cluster uniqueness integrity; no current producer/cluster lookup path in Phase 1C. |
| `ai_review_items_first_seen_idx` | `CREATE INDEX ai_review_items_first_seen_idx ON public.ai_review_items USING btree (first_seen_at)` | Daily metrics review/owner-required aggregation. |
| `ai_review_items_last_seen_idx` | `CREATE INDEX ai_review_items_last_seen_idx ON public.ai_review_items USING btree (last_seen_at DESC)` | FUTURE-ONLY review-item recency; no current live query path. |
| `ai_review_items_owner_seen_idx` | `CREATE INDEX ai_review_items_owner_seen_idx ON public.ai_review_items USING btree (last_seen_at DESC) WHERE (owner_action_required AND (status <> ALL (ARRAY['resolved'::text, 'ignored'::text])))` | FUTURE-ONLY owner queue; no current live query path. |
| `ai_review_items_pkey` | `CREATE UNIQUE INDEX ai_review_items_pkey ON public.ai_review_items USING btree (id)` | Required primary-key identity/integrity and direct row/FK lookup. |
| `ai_review_items_status_seen_idx` | `CREATE INDEX ai_review_items_status_seen_idx ON public.ai_review_items USING btree (status, last_seen_at DESC)` | FUTURE-ONLY review-item triage; current UI pages events, not review items. |

### Functions And Triggers

All functions have fixed `search_path=public, pg_temp`; PUBLIC/anon/authenticated
EXECUTE revoked; service_role EXECUTE granted. Nine are SECURITY DEFINER.

| Function signature | Definer | Purpose |
| --- | --- | --- |
| `aggregate_ai_daily_metrics(p_metric_date date)` | YES | Privileged day aggregation/upsert and sealed-snapshot return; advisory lock. |
| `ai_quality_valid_capability_id(p_value text)` | NO | Immutable capability allowlist; invoker. |
| `ai_quality_valid_context(p_value jsonb)` | NO | Immutable context/slot/size allowlist; invoker. |
| `ai_quality_valid_metadata(p_value jsonb)` | NO | Immutable enum/size/shape allowlist; B intentionally replaces A; invoker. |
| `ai_quality_valid_response_kind(p_value text)` | NO | Immutable response-kind allowlist; invoker. |
| `delete_expired_ai_quality_data(p_batch_size integer)` | YES | Privileged bounded maintenance deletion and metric finalization. |
| `get_ai_quality_storage_metrics()` | YES | Privileged stable exact-count/expiry metrics; can be expensive. |
| `list_ai_quality_events(p_days integer, p_type text, p_severity text, p_reviewed text, p_before_at timestamp with time zone, p_before_id uuid)` | YES | Privileged stable bounded event page; statement 3s. |
| `read_ai_quality_detail(p_event uuid)` | YES | Privileged stable retained evidence window; statement 3s. |
| `read_ai_quality_overview(p_days integer)` | YES | Privileged stable bounded current overview; statement 3s. |
| `record_ai_quality_turn(p_turn jsonb)` | YES | Privileged atomic pair/events/counters; lock_timeout 2s. |
| `review_ai_quality_event(p_event uuid)` | YES | Privileged idempotent reviewed_at mutation; lock 2s / statement 3s. |
| `set_ai_quality_updated_at()` | NO | BEFORE UPDATE trigger on conversations/reviews/evals; invoker. |
| `submit_ai_quality_feedback(p_conversation text, p_turn text, p_polarity text, p_category text)` | YES | Privileged active feedback/rate-window mutation; lock 2s / statement 3s. |

Trigger name `set_ai_quality_updated_at` is scoped to each of
`ai_quality_conversations`, `ai_review_items`, `ai_eval_cases` (three triggers).
No trigger on core Booking or chat tables; zero Quality RLS policies.
