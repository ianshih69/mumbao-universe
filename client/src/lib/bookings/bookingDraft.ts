import type { BookingPetTypeValue, StayType } from "./bookingApi";

export const bookingDraftStorageKey = "mumbao_booking_draft_v1";

export type BookingDraftForm = {
  guest_name: string;
  email: string;
  phone: string;
  check_in: string;
  check_out: string;
  stay_type: StayType;
  adults: number;
  children: number;
  infants: number;
  selected_package_quantity: number;
  room_count: number;
  has_pets: boolean;
  pet_count: number;
  pet_type: BookingPetTypeValue;
  pet_notes: string;
  notes: string;
};

type BookingDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function cleanText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cleanCount(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function cleanStayType(value: unknown, fallback: StayType): StayType {
  return value === "villa" || value === "room" ? value : fallback;
}

function cleanPetType(value: unknown, fallback: BookingPetTypeValue): BookingPetTypeValue {
  if (value === "") return "";
  return value === "dog" || value === "cat" || value === "other" ? value : fallback;
}

export function normalizeBookingDraft(value: unknown, fallback: BookingDraftForm): BookingDraftForm {
  const draft = value && typeof value === "object" ? (value as Partial<BookingDraftForm>) : {};

  return {
    guest_name: cleanText(draft.guest_name),
    email: cleanText(draft.email),
    phone: cleanText(draft.phone),
    check_in: cleanText(draft.check_in),
    check_out: cleanText(draft.check_out),
    stay_type: cleanStayType(draft.stay_type, fallback.stay_type),
    adults: cleanCount(draft.adults, fallback.adults, 1, 30),
    children: cleanCount(draft.children, fallback.children, 0, 30),
    infants: cleanCount(draft.infants, fallback.infants, 0, 30),
    selected_package_quantity: cleanCount(draft.selected_package_quantity, fallback.selected_package_quantity, 0, 1),
    room_count: cleanCount(draft.room_count, fallback.room_count, 1, 20),
    has_pets: Boolean(draft.has_pets),
    pet_count: cleanCount(draft.pet_count, fallback.pet_count, 0, 20),
    pet_type: cleanPetType(draft.pet_type, fallback.pet_type),
    pet_notes: cleanText(draft.pet_notes),
    notes: cleanText(draft.notes),
  };
}

export function readBookingDraft(storage: BookingDraftStorage | null | undefined, fallback: BookingDraftForm) {
  try {
    const rawDraft = storage?.getItem(bookingDraftStorageKey);
    if (!rawDraft) return fallback;
    return normalizeBookingDraft(JSON.parse(rawDraft), fallback);
  } catch {
    return fallback;
  }
}

export function writeBookingDraft(storage: BookingDraftStorage | null | undefined, draft: BookingDraftForm) {
  try {
    storage?.setItem(bookingDraftStorageKey, JSON.stringify(draft));
  } catch {
    // Ignore storage failures; booking can continue without draft persistence.
  }
}
