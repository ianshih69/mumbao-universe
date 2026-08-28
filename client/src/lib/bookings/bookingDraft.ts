import type { BookingPetTypeValue, StayType } from "./bookingApi";
import { bookingGuestRules } from "./bookingGuestRules.js";

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
  selected_room_option_id: string;
  room_count: number;
  has_pets: boolean;
  pet_count: number;
  pet_type: BookingPetTypeValue;
  pet_notes: string;
  dog_under_10kg_count: number;
  dog_10_to_20kg_count: number;
  dog_over_20kg_count: number;
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

function cleanDogDraftCounts(draft: Partial<BookingDraftForm>, fallback: BookingDraftForm) {
  const dogUnder10kgCount = cleanCount(
    draft.dog_under_10kg_count,
    fallback.dog_under_10kg_count || 0,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const dog10To20kgCount = cleanCount(
    draft.dog_10_to_20kg_count,
    fallback.dog_10_to_20kg_count || 0,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const dogOver20kgCount = cleanCount(
    draft.dog_over_20kg_count,
    fallback.dog_over_20kg_count || 0,
    0,
    Number.MAX_SAFE_INTEGER
  );

  return {
    dog_under_10kg_count: dogUnder10kgCount,
    dog_10_to_20kg_count: dog10To20kgCount,
    dog_over_20kg_count: dogOver20kgCount,
    dog_count: dogUnder10kgCount + dog10To20kgCount + dogOver20kgCount,
  };
}

export function normalizeBookingDraft(value: unknown, fallback: BookingDraftForm): BookingDraftForm {
  const draft = value && typeof value === "object" ? (value as Partial<BookingDraftForm>) : {};
  const dogCounts = cleanDogDraftCounts(draft, fallback);
  const petCount = dogCounts.dog_count;

  return {
    guest_name: cleanText(draft.guest_name),
    email: cleanText(draft.email),
    phone: cleanText(draft.phone),
    check_in: cleanText(draft.check_in),
    check_out: cleanText(draft.check_out),
    stay_type: cleanStayType(draft.stay_type, fallback.stay_type),
    adults: cleanCount(draft.adults, fallback.adults, 1, bookingGuestRules.maxAdultCount),
    children: cleanCount(draft.children, fallback.children, 0, bookingGuestRules.maxChildCount),
    infants: cleanCount(draft.infants, fallback.infants, 0, Number.MAX_SAFE_INTEGER),
    selected_room_option_id: cleanText(draft.selected_room_option_id),
    room_count: cleanCount(draft.room_count, fallback.room_count, 1, 20),
    has_pets: dogCounts.dog_count > 0,
    pet_count: petCount,
    pet_type: dogCounts.dog_count > 0 ? "dog" : "",
    pet_notes: dogCounts.dog_count > 0 ? cleanText(draft.pet_notes) : "",
    dog_under_10kg_count: dogCounts.dog_under_10kg_count,
    dog_10_to_20kg_count: dogCounts.dog_10_to_20kg_count,
    dog_over_20kg_count: dogCounts.dog_over_20kg_count,
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
