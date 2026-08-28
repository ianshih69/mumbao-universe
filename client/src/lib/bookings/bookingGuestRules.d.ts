export type BookingGuestCountsInput = {
  adults?: number | string | null;
  children?: number | string | null;
  infants?: number | string | null;
  nights?: number | string | null;
};

export type BookingRoomPlan = {
  roomPlanHeadcount: number;
  doubleBedCount: number;
  singleBedCount?: number;
  sleepCapacity: number;
  roomOptions: BookingRoomOption[];
  roomCountMin: number;
  roomCountMax: number;
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

export type BookingGuestPlan = {
  adults: number;
  children: number;
  infants: number;
  nights: number;
  adultCount: number;
  childCount: number;
  infantCount: number;
  actualGuestCount: number;
  chargeableChildCount: number;
  childFeeUnitPrice: number;
  childFeeTotal: number;
  regularExtraAdultCount: number;
  extraAdultCount: number;
  extraAdultUnitPrice: number;
  extraAdultFeeTotal: number;
  roomPlanHeadcount: number | null;
  doubleBedCount: number | null;
  singleBedCount: number;
  sleepCapacity: number | null;
  roomCountMin: number | null;
  roomCountMax: number | null;
  roomOptions: BookingRoomOption[];
  defaultRoomOptionId: string;
  defaultRoomOption: BookingRoomOption | null;
  isAdultCountSupported: boolean;
  isChildCountSupported: boolean;
  isActualGuestCountSupported: boolean;
  unsupportedReason: string;
};

export const bookingGuestRules: {
  basePackageGuestCount: 10;
  fullVillaAdultCount: 18;
  minimumRoomCountBelowPackageHeadcount: 3;
  maxAdultCount: 20;
  maxChildCount: 9;
  childFeeUnitPrice: 500;
  extraAdultUnitPrice: 800;
  roomPlans: Record<number, BookingRoomPlan>;
};

export function normalizeGuestRuleCounts(input?: BookingGuestCountsInput): {
  adults: number;
  children: number;
  infants: number;
  nights: number;
};
export function calculateActualGuestCount(input?: BookingGuestCountsInput): number;
export function calculateChargeableChildCount(input?: BookingGuestCountsInput): number;
export function calculateExtraAdultCount(input?: BookingGuestCountsInput): number;
export function calculateRegularExtraAdultCount(input?: BookingGuestCountsInput): number;
export function resolveRoomPlanHeadcount(adults: number | string | null | undefined): number | null;
export function getRoomPlanForHeadcount(roomPlanHeadcount: number | null | undefined): BookingRoomPlan | null;
export function getDefaultRoomOption(roomOptions?: BookingRoomOption[]): BookingRoomOption | null;
export function getRoomOptionById(roomOptions?: BookingRoomOption[], roomOptionId?: string): BookingRoomOption | null;
export function formatRoomOptionLabel(roomOption?: BookingRoomOption | null): string;
export function formatRoomOptionSummary(roomOption?: BookingRoomOption | null): string;
export function resolveBookingGuestPlan(input?: BookingGuestCountsInput): BookingGuestPlan;
export function resolveRoomOptionSelection(
  guestPlan: BookingGuestPlan,
  roomOptionId?: string,
): { ok: boolean; reason: string; selectedRoomOption: BookingRoomOption | null };
export function resolvePackageAvailability(
  input?: BookingGuestCountsInput,
  packageType?: "villa_10" | "villa_18" | string,
): { ok: boolean; reason: string; plan: BookingGuestPlan };
export function resolveAdultPricingGuestCount(
  input?: BookingGuestCountsInput,
  packageType?: "villa_10" | "villa_18" | string,
): { ok: boolean; reason: string; pricingGuestCount: number | null; plan: BookingGuestPlan };
