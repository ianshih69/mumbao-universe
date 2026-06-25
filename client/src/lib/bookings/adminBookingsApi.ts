export type BookingSeverity = "P0" | "P1" | "P2" | "review";

export type BookingDashboard = {
  safetyStatus: "safe" | "warning" | "danger";
  future90DaysHasIssues: boolean;
  bookingIcalLastSyncedAt: string | null;
  bookingIcalLastError: string | null;
  pendingEmailCount: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  confirmedBlockCount90Days: number;
};

export type BookingCalendarDay = {
  date: string;
  status: string;
  blockCount: number;
  alertCount: number;
};

export type BookingBlock = {
  id: string;
  block_type: string;
  source: string;
  check_in: string;
  check_out: string;
  status: string;
  title?: string | null;
};

export type BookingReservation = {
  id: string;
  source: string;
  reference_number?: string | null;
  check_in: string;
  check_out: string;
  guest_name?: string | null;
  guest_count?: number | null;
  amount?: number | null;
  status: "confirmed" | "cancelled" | "pending_review";
  confidence?: number | null;
  notes?: string | null;
};

export type BookingAlert = {
  id: string;
  severity: BookingSeverity;
  alert_type: string;
  title: string;
  description?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  source?: string | null;
  status: "open" | "handled";
  notes?: string | null;
  created_at: string;
};

export type BookingPlatformSetting = {
  id: string;
  platform: string;
  ical_url?: string | null;
  enabled: boolean;
  last_synced_at?: string | null;
  last_error?: string | null;
};

export type BookingEmailResult = {
  isBookingLike: boolean;
  confidence: number;
  detectionType: string;
  referenceNumber: string;
  checkIn: string;
  checkOut: string;
  accommodationName: string;
  suggestedAutoBlock: boolean;
  signals: string[];
  needs_ai_review: boolean;
  needs_manual_review: boolean;
};

async function adminBookingRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`/api/admin-bookings${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Admin bookings request failed: ${response.status}`);
  }

  return data as T;
}

export function fetchBookingDashboard(token: string) {
  return adminBookingRequest<{ dashboard: BookingDashboard }>(token, "?action=dashboard");
}

export function fetchBookingCalendar(token: string) {
  return adminBookingRequest<{
    calendar: {
      days: BookingCalendarDay[];
      blocks: BookingBlock[];
      reservations: BookingReservation[];
      alerts: BookingAlert[];
    };
  }>(token, "?action=calendar&months=12");
}

export function fetchBookingSettings(token: string) {
  return adminBookingRequest<{ settings: BookingPlatformSetting[] }>(token, "?action=settings");
}

export function fetchBookingAlerts(token: string) {
  return adminBookingRequest<{ alerts: BookingAlert[] }>(token, "?action=alerts");
}

export function fetchBookingReservations(token: string) {
  return adminBookingRequest<{ reservations: BookingReservation[] }>(token, "?action=reservations");
}

export function createExternalReservation(token: string, payload: Record<string, unknown>) {
  return adminBookingRequest<{ reservation: BookingReservation; block?: BookingBlock }>(
    token,
    "?action=external-reservation",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function parseBookingEmail(token: string, payload: Record<string, unknown>) {
  return adminBookingRequest<{ result: BookingEmailResult; reservation?: BookingReservation; block?: BookingBlock }>(
    token,
    "?action=email-detection",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function saveBookingSettings(token: string, payload: Record<string, unknown>) {
  return adminBookingRequest<{ setting: BookingPlatformSetting }>(token, "?action=settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function syncBookingIcal(token: string) {
  return adminBookingRequest<{ eventsFound: number; blocksWritten: number }>(token, "?action=sync-ical", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function handleBookingAlert(token: string, payload: { id: string; notes?: string }) {
  return adminBookingRequest<{ alert: BookingAlert }>(token, "?action=alert", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
