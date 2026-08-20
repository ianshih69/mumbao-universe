export type StayType = "villa" | "room";
export type PetType = "dog" | "cat" | "other";
export type BookingPetTypeValue = PetType | "";
export type BookingPackageType = "villa_10" | "villa_18";

export type BookingPublicSettings = {
  bookingWindowMonths: number;
  bookingWindowLabel: string;
  allowVillaBooking: boolean;
  allowRoomBooking: boolean;
  totalRoomCount: number;
  allowPets: boolean;
};

export type BookingAvailabilityResult = {
  available: boolean;
  checkIn: string;
  checkOut: string;
  settings?: BookingPublicSettings;
};

export type BookingCalendarResult = {
  from: string;
  to: string;
  maxDate: string;
  unavailableDates: string[];
  days?: Array<{
    date: string;
    saleMode?: string | null;
    sale_mode?: string | null;
    isAvailable?: boolean | null;
    is_available?: boolean | null;
    remainingRooms?: number | null;
    remaining_rooms?: number | null;
    unavailableReason?: string | null;
    unavailable_reason?: string | null;
  }>;
  settings: BookingPublicSettings;
};

export type BookingPricingBreakdownNight = {
  date: string;
  dayType: "weekday" | "friday" | "holiday";
  dayTypeLabel: string;
  price: number;
  specialDateLabel?: string | null;
  ruleSetId: string;
  ruleSetName: string;
  actualGuestCount: number;
  pricingGuestCount: number;
  packageType: BookingPackageType;
  packageLabel: string;
};

export type BookingPricingResult = {
  status: "resolved" | "unavailable";
  reason?: string;
  ruleSetId: string | null;
  ruleSetName: string | null;
  ruleSets: Array<{
    id: string;
    name: string;
    effectiveFrom: string;
    effectiveTo: string;
    depositRate: number;
  }>;
  breakdown: BookingPricingBreakdownNight[];
  subtotal: number | null;
  total: number | null;
  depositRate: number | null;
  depositAmount: number | null;
  balanceAmount: number | null;
  missingDate?: string;
  missingDayType?: string;
  missingGuestCount?: number;
  missingRuleSetId?: string;
};

export type BookingPriceQuoteResult = {
  status: "resolved" | "unavailable";
  checkIn: string;
  checkOut: string;
  stayType: StayType;
  adults: number;
  children: number;
  guestCount: number;
  pricingGuestCount: number | null;
  packageType: BookingPackageType;
  packageLabel: string;
  nights: number;
  pricing: BookingPricingResult;
};

export type BookingRequestPayload = {
  guest_name: string;
  email: string;
  phone: string;
  check_in: string;
  check_out: string;
  stay_type: StayType;
  selected_package_type: BookingPackageType;
  adults: number;
  children: number;
  room_count: number;
  has_pets: boolean;
  pet_count: number;
  pet_type: BookingPetTypeValue;
  pet_notes: string;
  notes: string;
};

async function bookingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/booking${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Booking request failed: ${response.status}`);
  }

  return data as T;
}

export function checkBookingAvailability(checkIn: string, checkOut: string) {
  const params = new URLSearchParams({ action: "availability", checkIn, checkOut });
  return bookingRequest<BookingAvailabilityResult & { ok: boolean }>(`?${params.toString()}`);
}

export function fetchBookingCalendar(from: string) {
  const params = new URLSearchParams({ action: "calendar", from });
  return bookingRequest<BookingCalendarResult & { ok: boolean }>(`?${params.toString()}`);
}

export function fetchBookingQuote({
  checkIn,
  checkOut,
  stayType,
  packageType,
  adults,
  children,
  roomCount,
}: {
  checkIn: string;
  checkOut: string;
  stayType: StayType;
  packageType: BookingPackageType;
  adults: number;
  children: number;
  roomCount: number;
}) {
  const params = new URLSearchParams({
    action: "quote",
    checkIn,
    checkOut,
    stayType,
    packageType,
    adults: String(adults),
    children: String(children),
    roomCount: String(roomCount),
  });
  return bookingRequest<BookingPriceQuoteResult & { ok: boolean }>(`?${params.toString()}`);
}

export function submitBookingRequest(payload: BookingRequestPayload, customerAccessToken?: string | null) {
  return bookingRequest<{ ok: boolean; request: { id: string; status: string; check_in: string; check_out: string } }>(
    "?action=request",
    {
      method: "POST",
      headers: customerAccessToken ? { Authorization: `Bearer ${customerAccessToken}` } : undefined,
      body: JSON.stringify(payload),
    }
  );
}
