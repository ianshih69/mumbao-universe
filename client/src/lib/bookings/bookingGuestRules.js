export const bookingGuestRules = {
  basePackageGuestCount: 10,
  fullVillaAdultCount: 18,
  minimumRoomCountBelowPackageHeadcount: 3,
  maxAdultCount: 20,
  maxChildCount: 9,
  childFeeUnitPrice: 500,
  extraAdultUnitPrice: 800,
  roomPlans: {
    10: {
      roomPlanHeadcount: 10,
      doubleBedCount: 5,
      sleepCapacity: 10,
      roomOptions: [
        { id: "2q1d", quadRoomCount: 2, doubleRoomCount: 1, roomCount: 3, doubleBedCount: 5, sleepCapacity: 10 },
        { id: "1q3d", quadRoomCount: 1, doubleRoomCount: 3, roomCount: 4, doubleBedCount: 5, sleepCapacity: 10 },
      ],
    },
    11: {
      roomPlanHeadcount: 11,
      doubleBedCount: 6,
      sleepCapacity: 12,
      roomOptions: [
        { id: "3q", quadRoomCount: 3, doubleRoomCount: 0, roomCount: 3, doubleBedCount: 6, sleepCapacity: 12 },
        { id: "2q2d", quadRoomCount: 2, doubleRoomCount: 2, roomCount: 4, doubleBedCount: 6, sleepCapacity: 12 },
      ],
    },
    12: {
      roomPlanHeadcount: 12,
      doubleBedCount: 6,
      sleepCapacity: 12,
      roomOptions: [
        { id: "3q", quadRoomCount: 3, doubleRoomCount: 0, roomCount: 3, doubleBedCount: 6, sleepCapacity: 12 },
        { id: "2q2d", quadRoomCount: 2, doubleRoomCount: 2, roomCount: 4, doubleBedCount: 6, sleepCapacity: 12 },
      ],
    },
    13: {
      roomPlanHeadcount: 13,
      doubleBedCount: 7,
      sleepCapacity: 14,
      roomOptions: [
        { id: "3q1d", quadRoomCount: 3, doubleRoomCount: 1, roomCount: 4, doubleBedCount: 7, sleepCapacity: 14 },
        { id: "2q3d", quadRoomCount: 2, doubleRoomCount: 3, roomCount: 5, doubleBedCount: 7, sleepCapacity: 14 },
      ],
    },
    14: {
      roomPlanHeadcount: 14,
      doubleBedCount: 7,
      sleepCapacity: 14,
      roomOptions: [
        { id: "3q1d", quadRoomCount: 3, doubleRoomCount: 1, roomCount: 4, doubleBedCount: 7, sleepCapacity: 14 },
        { id: "2q3d", quadRoomCount: 2, doubleRoomCount: 3, roomCount: 5, doubleBedCount: 7, sleepCapacity: 14 },
      ],
    },
    15: {
      roomPlanHeadcount: 15,
      doubleBedCount: 8,
      sleepCapacity: 16,
      roomOptions: [
        { id: "3q2d", quadRoomCount: 3, doubleRoomCount: 2, roomCount: 5, doubleBedCount: 8, sleepCapacity: 16 },
      ],
    },
    16: {
      roomPlanHeadcount: 16,
      doubleBedCount: 8,
      sleepCapacity: 16,
      roomOptions: [
        { id: "3q2d", quadRoomCount: 3, doubleRoomCount: 2, roomCount: 5, doubleBedCount: 8, sleepCapacity: 16 },
      ],
    },
    17: {
      roomPlanHeadcount: 17,
      doubleBedCount: 9,
      sleepCapacity: 18,
      roomOptions: [
        { id: "3q3d", quadRoomCount: 3, doubleRoomCount: 3, roomCount: 6, doubleBedCount: 9, sleepCapacity: 18 },
      ],
    },
    18: {
      roomPlanHeadcount: 18,
      doubleBedCount: 9,
      singleBedCount: 0,
      sleepCapacity: 18,
      roomOptions: [
        { id: "3q3d", quadRoomCount: 3, doubleRoomCount: 3, roomCount: 6, doubleBedCount: 9, singleBedCount: 0, sleepCapacity: 18 },
      ],
    },
    19: {
      roomPlanHeadcount: 19,
      doubleBedCount: 9,
      singleBedCount: 1,
      sleepCapacity: 19,
      roomOptions: [
        { id: "3q3d1s", quadRoomCount: 3, doubleRoomCount: 3, roomCount: 6, doubleBedCount: 9, singleBedCount: 1, sleepCapacity: 19 },
      ],
    },
    20: {
      roomPlanHeadcount: 20,
      doubleBedCount: 9,
      singleBedCount: 2,
      sleepCapacity: 20,
      roomOptions: [
        { id: "3q3d2s", quadRoomCount: 3, doubleRoomCount: 3, roomCount: 6, doubleBedCount: 9, singleBedCount: 2, sleepCapacity: 20 },
      ],
    },
  },
};

function parseGuestCount(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function normalizeGuestRuleCounts(input = {}) {
  return {
    adults: Math.max(0, parseGuestCount(input.adults, 0)),
    children: Math.max(0, parseGuestCount(input.children, 0)),
    infants: Math.max(0, parseGuestCount(input.infants, 0)),
    nights: Math.max(0, parseGuestCount(input.nights, 0)),
  };
}

export function calculateActualGuestCount(input = {}) {
  const { adults, children, infants } = normalizeGuestRuleCounts(input);
  return adults + children + infants;
}

export function calculateChargeableChildCount(input = {}) {
  const { adults, children } = normalizeGuestRuleCounts(input);
  if (children <= 0) return 0;
  if (adults <= bookingGuestRules.basePackageGuestCount) {
    return Math.max(0, adults + children - bookingGuestRules.basePackageGuestCount);
  }
  return children;
}

export function calculateExtraAdultCount(input = {}) {
  const { adults } = normalizeGuestRuleCounts(input);
  const maxExtraAdults = bookingGuestRules.maxAdultCount - bookingGuestRules.fullVillaAdultCount;
  return Math.min(Math.max(0, adults - bookingGuestRules.fullVillaAdultCount), maxExtraAdults);
}

export function calculateRegularExtraAdultCount(input = {}) {
  const { adults } = normalizeGuestRuleCounts(input);
  return Math.min(
    Math.max(0, adults - bookingGuestRules.basePackageGuestCount),
    bookingGuestRules.fullVillaAdultCount - bookingGuestRules.basePackageGuestCount
  );
}

export function resolveRoomPlanHeadcount(adults) {
  const adultCount = Math.max(0, parseGuestCount(adults, 0));
  if (adultCount < 1 || adultCount > bookingGuestRules.maxAdultCount) return null;
  return Math.max(bookingGuestRules.basePackageGuestCount, adultCount);
}

export function getRoomPlanForHeadcount(roomPlanHeadcount) {
  return bookingGuestRules.roomPlans[roomPlanHeadcount] || null;
}

export function getDefaultRoomOption(roomOptions = []) {
  return [...roomOptions].sort((a, b) => a.roomCount - b.roomCount)[0] || null;
}

export function getRoomOptionById(roomOptions = [], roomOptionId = "") {
  const normalizedId = typeof roomOptionId === "string" ? roomOptionId.trim() : "";
  if (!normalizedId) return null;
  return roomOptions.find((option) => option.id === normalizedId) || null;
}

export function formatRoomOptionLabel(roomOption) {
  if (!roomOption) return "";
  return [
    roomOption.quadRoomCount > 0 ? `${roomOption.quadRoomCount} 間四人房` : "",
    roomOption.doubleRoomCount > 0 ? `${roomOption.doubleRoomCount} 間雙人房` : "",
  ].filter(Boolean).join("＋");
}

export function formatRoomOptionSummary(roomOption) {
  if (!roomOption) return "";
  return `${formatRoomOptionLabel(roomOption)}｜共 ${roomOption.roomCount} 間房`;
}

function resolveRoomPlanForCounts(counts) {
  const roomPlanHeadcount = resolveRoomPlanHeadcount(counts.adults);
  const roomPlan = getRoomPlanForHeadcount(roomPlanHeadcount);
  if (!roomPlan) return { roomPlanHeadcount, roomPlan };
  const roomOptions = roomPlan.roomOptions || [];

  const countedTowardMinimumPackage = counts.adults + counts.children;
  if (
    roomPlanHeadcount === bookingGuestRules.basePackageGuestCount &&
    countedTowardMinimumPackage < bookingGuestRules.basePackageGuestCount
  ) {
    const defaultRoomOption = getDefaultRoomOption(roomOptions);
    return {
      roomPlanHeadcount,
      roomPlan: {
        ...roomPlan,
        roomOptions: defaultRoomOption ? [defaultRoomOption] : [],
        roomCountMin: bookingGuestRules.minimumRoomCountBelowPackageHeadcount,
        roomCountMax: bookingGuestRules.minimumRoomCountBelowPackageHeadcount,
      },
    };
  }

  const roomCounts = roomOptions.map((option) => option.roomCount);
  return {
    roomPlanHeadcount,
    roomPlan: {
      ...roomPlan,
      roomCountMin: roomCounts.length ? Math.min(...roomCounts) : null,
      roomCountMax: roomCounts.length ? Math.max(...roomCounts) : null,
    },
  };
}

export function resolveBookingGuestPlan(input = {}) {
  const counts = normalizeGuestRuleCounts(input);
  const actualGuestCount = counts.adults + counts.children + counts.infants;
  const chargeableChildCount = calculateChargeableChildCount(counts);
  const extraAdultCount = calculateExtraAdultCount(counts);
  const regularExtraAdultCount = calculateRegularExtraAdultCount(counts);
  const { roomPlanHeadcount, roomPlan } = resolveRoomPlanForCounts(counts);
  const roomOptions = roomPlan?.roomOptions || [];
  const defaultRoomOption = getDefaultRoomOption(roomOptions);
  const childFeeTotal = chargeableChildCount * bookingGuestRules.childFeeUnitPrice * counts.nights;
  const extraAdultFeeTotal = extraAdultCount * bookingGuestRules.extraAdultUnitPrice * counts.nights;
  const isAdultCountSupported = counts.adults >= 1 && counts.adults <= bookingGuestRules.maxAdultCount;
  const isChildCountSupported = counts.children <= bookingGuestRules.maxChildCount;
  const isActualGuestCountSupported = true;
  const unsupportedReason = !isAdultCountSupported
    ? "adult_count_exceeds_capacity"
    : !isChildCountSupported
      ? "child_count_exceeds_capacity"
      : "";

  return {
    ...counts,
    adultCount: counts.adults,
    childCount: counts.children,
    infantCount: counts.infants,
    actualGuestCount,
    chargeableChildCount,
    childFeeUnitPrice: bookingGuestRules.childFeeUnitPrice,
    childFeeTotal,
    regularExtraAdultCount,
    extraAdultCount,
    extraAdultUnitPrice: bookingGuestRules.extraAdultUnitPrice,
    extraAdultFeeTotal,
    roomPlanHeadcount,
    doubleBedCount: roomPlan?.doubleBedCount ?? null,
    singleBedCount: roomPlan?.singleBedCount ?? 0,
    sleepCapacity: roomPlan?.sleepCapacity ?? null,
    roomCountMin: roomPlan?.roomCountMin ?? null,
    roomCountMax: roomPlan?.roomCountMax ?? null,
    roomOptions,
    defaultRoomOptionId: defaultRoomOption?.id || "",
    defaultRoomOption,
    isAdultCountSupported,
    isChildCountSupported,
    isActualGuestCountSupported,
    unsupportedReason,
  };
}

export function resolveRoomOptionSelection(guestPlan, roomOptionId = "") {
  const roomOptions = Array.isArray(guestPlan?.roomOptions) ? guestPlan.roomOptions : [];
  const defaultRoomOption = getDefaultRoomOption(roomOptions);
  if (!defaultRoomOption) {
    return { ok: false, reason: "missing_room_options", selectedRoomOption: null };
  }

  const normalizedId = typeof roomOptionId === "string" ? roomOptionId.trim() : "";
  if (!normalizedId) {
    return { ok: true, reason: "", selectedRoomOption: defaultRoomOption };
  }

  const selectedRoomOption = getRoomOptionById(roomOptions, normalizedId);
  if (!selectedRoomOption) {
    return { ok: false, reason: "invalid_room_option", selectedRoomOption: null };
  }

  return { ok: true, reason: "", selectedRoomOption };
}

export function resolvePackageAvailability(input = {}, packageType = "villa_10") {
  const plan = resolveBookingGuestPlan(input);
  if (!plan.isAdultCountSupported || !plan.isChildCountSupported) {
    return { ok: false, reason: plan.unsupportedReason || "unsupported_guest_count", plan };
  }

  if (packageType === "villa_10") {
    if (plan.adultCount >= bookingGuestRules.fullVillaAdultCount) {
      return { ok: false, reason: "guest_count_requires_full_villa", plan };
    }
    return { ok: true, reason: "", plan };
  }

  if (packageType === "villa_18") {
    if (plan.adultCount < bookingGuestRules.fullVillaAdultCount) {
      return { ok: false, reason: "full_villa_requires_18_guests", plan };
    }
    return { ok: true, reason: "", plan };
  }

  return { ok: false, reason: "unsupported_package_type", plan };
}

export function resolveAdultPricingGuestCount(input = {}, packageType = "villa_10") {
  const availability = resolvePackageAvailability(input, packageType);
  if (!availability.ok) {
    return { ok: false, reason: availability.reason, pricingGuestCount: null, plan: availability.plan };
  }

  return {
    ok: true,
    reason: "",
    pricingGuestCount: availability.plan.roomPlanHeadcount,
    plan: availability.plan,
  };
}
