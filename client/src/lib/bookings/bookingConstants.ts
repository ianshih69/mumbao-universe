import { bookingGuestRules } from "./bookingGuestRules.js";

export const DEFAULT_BOOKING_SETTINGS = {
  bookingWindowMonths: 6,
  bookingWindowLabel: "6 個月",
  allowVillaBooking: true,
  allowRoomBooking: false,
  totalRoomCount: 5,
  allowPets: true,
} as const;

export const MIN_ADULTS = 1;
export const MAX_BOOKING_ADULTS = bookingGuestRules.maxAdultCount;
export const MAX_BOOKING_CHILDREN = bookingGuestRules.maxChildCount;

export type PublicBookingSettings = {
  bookingWindowMonths: number;
  bookingWindowLabel: string;
  allowVillaBooking: boolean;
  allowRoomBooking: boolean;
  totalRoomCount: number;
  allowPets: boolean;
};

export function formatBookingWindowLabel(months: number) {
  return `${months} 個月`;
}
