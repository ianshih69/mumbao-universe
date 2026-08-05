import type { BookingPublicSettings, StayType } from "./bookingApi";

export type BookingSaleMode = "whole_house" | "room" | "closed";
export type BookingCalendarFilter = "all" | "whole_house" | "room";
export type BookingRangeIssue = "ok" | "invalid_range" | "unavailable" | "mode_mismatch";

export type BookingCalendarDaySource = {
  date: string;
  saleMode?: string | null;
  sale_mode?: string | null;
  isAvailable?: boolean | null;
  is_available?: boolean | null;
  remainingRooms?: number | null;
  remaining_rooms?: number | null;
  unavailableReason?: string | null;
  unavailable_reason?: string | null;
};

export type BookingCalendarDayView = {
  date: string;
  saleMode: BookingSaleMode;
  isAvailable: boolean;
  remainingRooms: number | null;
  unavailableReason: string | null;
};

export function addCalendarDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeBookingSaleMode(value: unknown): BookingSaleMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["whole_house", "villa", "full_house", "exclusive"].includes(normalized)) return "whole_house";
  if (["room", "rooms", "single_room"].includes(normalized)) return "room";
  if (["closed", "unavailable", "blocked", "maintenance"].includes(normalized)) return "closed";
  return null;
}

export function defaultBookingSaleMode(settings: BookingPublicSettings): BookingSaleMode {
  if (settings.allowVillaBooking) return "whole_house";
  if (settings.allowRoomBooking) return "room";
  return "closed";
}

export function saleModeToStayType(saleMode: BookingSaleMode): StayType | null {
  if (saleMode === "whole_house") return "villa";
  if (saleMode === "room") return "room";
  return null;
}

export function stayTypeToSaleMode(stayType: StayType): BookingSaleMode {
  return stayType === "villa" ? "whole_house" : "room";
}

export function normalizeBookingCalendarDay(
  date: string,
  settings: BookingPublicSettings,
  unavailableDates: Set<string>,
  source?: BookingCalendarDaySource,
): BookingCalendarDayView {
  const fallbackSaleMode = defaultBookingSaleMode(settings);
  const saleMode = normalizeBookingSaleMode(source?.saleMode ?? source?.sale_mode) ?? fallbackSaleMode;
  const remainingRoomsValue = source?.remainingRooms ?? source?.remaining_rooms;
  const remainingRooms = Number.isFinite(Number(remainingRoomsValue)) ? Number(remainingRoomsValue) : null;
  const sourceAvailable = source?.isAvailable ?? source?.is_available;
  const isUnavailableByRange = unavailableDates.has(date);
  const isAvailable =
    saleMode !== "closed" &&
    (typeof sourceAvailable === "boolean" ? sourceAvailable : !isUnavailableByRange) &&
    !(saleMode === "room" && remainingRooms !== null && remainingRooms <= 0);

  return {
    date,
    saleMode,
    isAvailable,
    remainingRooms,
    unavailableReason: source?.unavailableReason ?? source?.unavailable_reason ?? (isUnavailableByRange ? "unavailable" : null),
  };
}

export function isCalendarFilterMismatch(day: BookingCalendarDayView, filter: BookingCalendarFilter) {
  return filter !== "all" && day.saleMode !== filter;
}

export function isBookableStayNight(day: BookingCalendarDayView, minDate: string, maxDate: string) {
  return day.date >= minDate && day.date <= maxDate && day.saleMode !== "closed" && day.isAvailable;
}

export function getBookingRangeIssue({
  checkIn,
  checkOut,
  saleMode,
  minDate,
  maxDate,
  getDay,
}: {
  checkIn: string;
  checkOut: string;
  saleMode: BookingSaleMode;
  minDate: string;
  maxDate: string;
  getDay: (date: string) => BookingCalendarDayView;
}): BookingRangeIssue {
  if (!checkIn || !checkOut || checkOut <= checkIn) return "invalid_range";

  let current = checkIn;
  while (current < checkOut) {
    const day = getDay(current);
    if (!isBookableStayNight(day, minDate, maxDate)) return "unavailable";
    if (day.saleMode !== saleMode) return "mode_mismatch";
    current = addCalendarDays(current, 1);
  }

  return "ok";
}
