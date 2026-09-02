export type BookingPaymentClockSync = {
  serverNowMs: number;
  receivedAtMs: number;
};

export function createBookingPaymentClockSync(
  serverNow: string | null | undefined,
  receivedAtMs = Date.now(),
): BookingPaymentClockSync | null {
  const serverNowMs = Date.parse(serverNow || "");
  return Number.isFinite(serverNowMs) ? { serverNowMs, receivedAtMs } : null;
}

export function bookingPaymentRemainingSeconds({
  deadline,
  clockSync,
  currentTimeMs,
}: {
  deadline: string | null | undefined;
  clockSync: BookingPaymentClockSync | null;
  currentTimeMs: number;
}) {
  const deadlineMs = Date.parse(deadline || "");
  if (!Number.isFinite(deadlineMs)) return 0;

  const authoritativeNowMs = clockSync
    ? clockSync.serverNowMs + (currentTimeMs - clockSync.receivedAtMs)
    : currentTimeMs;
  return Math.max(0, Math.ceil((deadlineMs - authoritativeNowMs) / 1000));
}

export function formatBookingPaymentCountdown(remainingSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
