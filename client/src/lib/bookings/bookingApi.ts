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
  preDiscountPrice?: number;
  discountType?: "consecutive_stay_95" | string | null;
  discountRate?: number;
  discountAmount?: number;
  adultLodgingPreDiscountAmount?: number;
  adultLodgingAmount?: number;
  adultRateBreakdownStatus?: "resolved" | "fallback";
  adultRateBreakdownMatches?: boolean;
  base10GuestRate?: number | null;
  adult18GuestRate?: number | null;
  adultIncrementRate?: number | null;
  formalAdultGuestCount?: number;
  formalAdultPrice?: number;
  baseGuestCount?: number;
  basePrice?: number;
  regularExtraAdultCount?: number;
  regularExtraAdultRate?: number | null;
  regularExtraAdultFeeAmount?: number;
  extraAdultCount?: number;
  extraAdultUnitPrice?: number;
  extraAdultFeeAmount?: number;
  extraBedAdultCount?: number;
  extraBedAdultRate?: number;
  extraBedAdultFeeAmount?: number;
  extraBedCount?: number;
  extraBedUnitPrice?: number;
  extraBedAmount?: number;
  chargeableChildCount?: number;
  childFeeUnitPrice?: number;
  childFeeAmount?: number;
  petFeeOriginalAmount?: number;
  petFeeAmount?: number;
  petFeeDiscountRate?: number;
  petFeeDiscountType?: string | null;
  petFeeDiscountAmount?: number;
  petFeeBreakdown?: BookingPetFeeBreakdownItem[];
  dogUnder10kgCount?: number;
  dog10To20kgCount?: number;
  dogOver20kgCount?: number;
  dogCount?: number;
  petDepositAmount?: number;
  specialDateLabel?: string | null;
  ruleSetId: string;
  ruleSetName: string;
  actualGuestCount: number;
  pricingGuestCount: number;
  packageType: BookingPackageType;
  packageLabel: string;
  roomPlanHeadcount?: number | null;
  doubleBedCount?: number | null;
  singleBedCount?: number | null;
  sleepCapacity?: number | null;
  roomCountMin?: number | null;
  roomCountMax?: number | null;
  selectedRoomOptionId?: string | null;
  selectedRoomOption?: BookingRoomOption | null;
};

export type BookingRoomOption = {
  id: string;
  quadRoomCount: number;
  doubleRoomCount: number;
  roomCount: number;
  doubleBedCount: number;
  singleBedCount?: number;
  sleepCapacity: number;
};

export type BookingBreakfastAddonInput = {
  date: string;
  quantity: number;
};

export type BookingBreakfastAddonEntry = BookingBreakfastAddonInput & {
  unitPrice: number;
  subtotal: number;
};

export type BookingPetFeeBreakdownItem = {
  key: "under10kg" | "mid10to20kg" | "over20kg" | string;
  label: string;
  count: number;
  unitPrice: number;
  nightlyAmount?: number;
  discountedNightlyAmount?: number;
  discountedNightCount?: number;
  discountType?: string | null;
  discountRate?: number;
  discountAmount?: number;
  originalAmount?: number;
  total: number;
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
  lodgingSubtotal?: number | null;
  adultCount?: number;
  childCount?: number;
  infantCount?: number;
  actualGuestCount?: number;
  chargeableChildCount?: number;
  childFeeUnitPrice?: number;
  nightlyChildFeeOriginalAmount?: number;
  discountedNightlyChildFeeAmount?: number;
  childFeeDiscountRate?: number;
  childFeeOriginalTotal?: number;
  childFeeDiscountTotal?: number;
  childFeeTotal?: number;
  dogUnder10kgCount?: number;
  dog10To20kgCount?: number;
  dogOver20kgCount?: number;
  dogCount?: number;
  petFeeBreakdown?: BookingPetFeeBreakdownItem[];
  nightlyPetFeeAmount?: number;
  nightlyPetFeeOriginalAmount?: number;
  discountedNightlyPetFeeAmount?: number;
  discountedPetNightCount?: number;
  petFeeDiscountRate?: number;
  petFeeOriginalTotal?: number;
  petFeeDiscountTotal?: number;
  petFeeTotal?: number;
  petDepositAmount?: number;
  breakfastUnitPrice?: number;
  breakfastAddonEntries?: BookingBreakfastAddonEntry[];
  breakfastAddonQuantity?: number;
  breakfastAddonTotal?: number;
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
  singleBedCount?: number | null;
  sleepCapacity?: number | null;
  roomCountMin?: number | null;
  roomCountMax?: number | null;
  roomOptions?: BookingRoomOption[];
  defaultRoomOptionId?: string;
  defaultRoomOption?: BookingRoomOption | null;
  selectedRoomOptionId?: string | null;
  selectedRoomOption?: BookingRoomOption | null;
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
  infants: number;
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
  infants: number;
  selected_room_option_id: string;
  room_count: number;
  has_pets: boolean;
  pet_count: number;
  pet_type: BookingPetTypeValue;
  pet_notes: string;
  dog_under_10kg_count: number;
  dog_10_to_20kg_count: number;
  dog_over_20kg_count: number;
  breakfast_addons?: BookingBreakfastAddonInput[];
  notes: string;
};

export type BookingSubmitResult = {
  ok: boolean;
  requestId: string;
  recoveryToken?: string;
  request: {
    id: string;
    booking_reference: string | null;
    status: string;
    check_in: string;
    check_out: string;
    created_at: string | null;
    hold_expires_at: string | null;
    payment_reported_at: string | null;
    review_expires_at: string | null;
  };
  pricing?: {
    quotedTotal: number | null;
    depositRate: number | null;
    depositAmount: number | null;
    balanceAmount: number | null;
    pricingBreakdown: BookingPricingResult;
  };
  summary?: {
    adultCount: number;
    childCount: number;
    infantCount: number;
    dogUnder10kgCount: number;
    dog10To20kgCount: number;
    dogOver20kgCount: number;
    dogCount: number;
    nightCount: number;
    selectedRoomOption: BookingRoomOption | null;
    breakfastAddonEntries: BookingBreakfastAddonInput[];
  };
  contact?: {
    maskedEmail: string;
    maskedPhone: string;
  };
  payment?: BookingPaymentSettings;
};

export type BookingPaymentSettings = {
  enabled: boolean;
  method?: "bank_transfer";
  currency?: "TWD" | string;
  status?: string | null;
  serverNow?: string | null;
  holdExpiresAt?: string | null;
  paymentReportedAt?: string | null;
  reviewExpiresAt?: string | null;
  bank?: {
    name: string;
    code: string;
    branch: string;
    accountName: string;
    accountNumber: string;
  };
  report?: {
    status: string | null;
    bankLast5: string | null;
    payerName: string | null;
    reportedAt: string | null;
    verifiedAt: string | null;
  } | null;
};

export type BookingPaymentReportPayload = {
  recoveryToken: string;
  bankLast5: string;
  payerName?: string;
  notes?: string;
};

export class BookingApiError extends Error {
  status: number;
  code: string;
  holdExpiresAt: string | null;
  retryAfterSeconds: number | null;

  constructor({
    message,
    status,
    code,
    holdExpiresAt,
    retryAfterSeconds,
  }: {
    message: string;
    status: number;
    code?: string;
    holdExpiresAt?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(message);
    this.name = "BookingApiError";
    this.status = status;
    this.code = code || "request_failed";
    this.holdExpiresAt = holdExpiresAt || null;
    this.retryAfterSeconds = Number.isInteger(retryAfterSeconds) ? retryAfterSeconds ?? null : null;
  }
}

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
    throw new BookingApiError({
      message: data?.message || data?.error || `Booking request failed: ${response.status}`,
      status: response.status,
      code: data?.code || data?.error,
      holdExpiresAt: data?.hold_expires_at,
      retryAfterSeconds: data?.retry_after_seconds,
    });
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
  infants,
  dogUnder10kgCount,
  dog10To20kgCount,
  dogOver20kgCount,
  breakfastAddons = [],
  selectedRoomOptionId,
  roomCount,
}: {
  checkIn: string;
  checkOut: string;
  stayType: StayType;
  packageType: BookingPackageType;
  adults: number;
  children: number;
  infants: number;
  dogUnder10kgCount: number;
  dog10To20kgCount: number;
  dogOver20kgCount: number;
  breakfastAddons?: BookingBreakfastAddonInput[];
  selectedRoomOptionId: string;
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
    infants: String(infants),
    dogUnder10kgCount: String(dogUnder10kgCount),
    dog10To20kgCount: String(dog10To20kgCount),
    dogOver20kgCount: String(dogOver20kgCount),
    breakfastAddons: JSON.stringify(breakfastAddons),
    selectedRoomOptionId,
    roomCount: String(roomCount),
  });
  return bookingRequest<BookingPriceQuoteResult & { ok: boolean }>(`?${params.toString()}`);
}

export function submitBookingRequest(payload: BookingRequestPayload, customerAccessToken?: string | null) {
  return bookingRequest<BookingSubmitResult>(
    "?action=request",
    {
      method: "POST",
      headers: customerAccessToken ? { Authorization: `Bearer ${customerAccessToken}` } : undefined,
      body: JSON.stringify(payload),
    }
  );
}

export function recoverBookingRequest(recoveryToken: string) {
  return bookingRequest<BookingSubmitResult>(
    "?action=recover",
    {
      method: "POST",
      body: JSON.stringify({ recoveryToken }),
    }
  );
}

export function reportBookingBankTransfer(payload: BookingPaymentReportPayload) {
  return bookingRequest<BookingSubmitResult & { idempotent?: boolean }>(
    "?action=report-payment",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
