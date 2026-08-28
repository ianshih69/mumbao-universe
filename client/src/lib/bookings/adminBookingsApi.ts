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

export type BookingRequest = {
  id: string;
  status: "pending_review" | "confirmed" | "cancelled";
  check_in: string;
  check_out: string;
  stay_type: "villa" | "room";
  adults: number;
  children: number;
  room_count?: number | null;
  has_pets: boolean;
  pet_count?: number | null;
  pet_type?: string | null;
  pet_notes?: string | null;
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  guest_count?: number | null;
  notes?: string | null;
  source?: string | null;
  selected_package_type?: string | null;
  quoted_total?: number | null;
  deposit_rate?: number | string | null;
  deposit_amount?: number | null;
  balance_amount?: number | null;
  pricing_breakdown?: {
    chargeableChildCount?: number;
    childFeeUnitPrice?: number;
    childFeeTotal?: number;
    regularExtraAdultCount?: number;
    regularExtraAdultFeeTotal?: number;
    extraAdultCount?: number;
    extraAdultUnitPrice?: number;
    extraAdultFeeTotal?: number;
    extraBedAdultCount?: number;
    extraBedAdultUnitPrice?: number;
    extraBedAdultFeeTotal?: number;
    roomPlanHeadcount?: number | null;
    doubleBedCount?: number | null;
    sleepCapacity?: number | null;
    roomCountMin?: number | null;
    roomCountMax?: number | null;
    selectedRoomOptionId?: string | null;
    selectedRoomOption?: {
      id: string;
      quadRoomCount: number;
      doubleRoomCount: number;
      roomCount: number;
      doubleBedCount: number;
      sleepCapacity: number;
    } | null;
  } | null;
  raw_payload?: Record<string, unknown> | null;
  customer_profile_id?: string | null;
  final_lodging_amount?: number | null;
  completed_at?: string | null;
  partner_points_ledger_id?: string | null;
  created_at: string;
  updated_at?: string | null;
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

export type BookingPricingDayType = "weekday" | "friday" | "holiday";

export type BookingPriceRuleSet = {
  id: string;
  name: string;
  effective_from: string;
  effective_to: string;
  deposit_rate: number | string;
  is_active: boolean;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BookingPackageRate = {
  id?: string;
  rule_set_id: string;
  guest_count: number;
  day_type: BookingPricingDayType;
  nightly_price: number;
  is_active: boolean;
};

export type BookingSpecialDate = {
  id?: string;
  rule_set_id: string;
  date: string;
  day_type: BookingPricingDayType;
  label?: string | null;
  is_active: boolean;
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
  }>(token, "?action=calendar");
}

export function fetchBookingSettings(token: string) {
  return adminBookingRequest<{
    settings: BookingPlatformSetting[];
    bookingSettings?: {
      id: number;
      booking_window_months: number;
      allow_villa_booking: boolean;
      allow_room_booking: boolean;
      total_room_count: number;
      allow_pets: boolean;
    };
  }>(token, "?action=settings");
}

export function fetchBookingAlerts(token: string) {
  return adminBookingRequest<{ alerts: BookingAlert[] }>(token, "?action=alerts");
}

export function fetchBookingReservations(token: string) {
  return adminBookingRequest<{ reservations: BookingReservation[] }>(token, "?action=reservations");
}

export function fetchBookingRequests(token: string) {
  return adminBookingRequest<{ requests: BookingRequest[] }>(token, "?action=requests");
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

export function completeBookingStay(
  token: string,
  payload: { id: string; finalLodgingAmount: number }
) {
  return adminBookingRequest<{
    ok: true;
    code: string;
    booking: BookingRequest;
    points_award: {
      awarded: boolean;
      reason: string;
      points: number;
      ledger_id?: string | null;
      diamond_customer_profile_id?: string | null;
    };
  }>(token, "?action=complete-stay", {
    method: "POST",
    body: JSON.stringify({
      id: payload.id,
      finalLodgingAmount: payload.finalLodgingAmount,
    }),
  });
}

export function fetchBookingPricing(token: string) {
  return adminBookingRequest<{
    ok: true;
    dayTypes: BookingPricingDayType[];
    guestCounts: number[];
    ruleSets: BookingPriceRuleSet[];
    rates: BookingPackageRate[];
    specialDates: BookingSpecialDate[];
  }>(token, "?action=pricing");
}

export function saveBookingPriceRuleSet(token: string, payload: Partial<BookingPriceRuleSet>) {
  return adminBookingRequest<{ ok: true; ruleSet: BookingPriceRuleSet }>(
    token,
    "?action=pricing-rule-set",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function saveBookingPackageRates(
  token: string,
  payload: { rule_set_id: string; rates: Array<Partial<BookingPackageRate>> }
) {
  return adminBookingRequest<{ ok: true; rates: BookingPackageRate[] }>(
    token,
    "?action=pricing-rates",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function saveBookingSpecialDate(token: string, payload: Partial<BookingSpecialDate>) {
  return adminBookingRequest<{ ok: true; specialDate: BookingSpecialDate }>(
    token,
    "?action=pricing-special-date",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
