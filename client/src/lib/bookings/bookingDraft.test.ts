import { describe, expect, it } from "vitest";
import {
  bookingDraftStorageKey,
  readBookingDraft,
  writeBookingDraft,
  type BookingDraftForm,
} from "./bookingDraft";

const fallbackDraft: BookingDraftForm = {
  guest_name: "",
  email: "",
  phone: "",
  check_in: "",
  check_out: "",
  stay_type: "villa",
  adults: 2,
  children: 0,
  room_count: 5,
  has_pets: false,
  pet_count: 0,
  pet_type: "",
  pet_notes: "",
  notes: "",
};

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  } as Storage;
}

describe("booking draft persistence", () => {
  it("preserves booking dates, guests, and pet fields across a login round trip", () => {
    const storage = createMemoryStorage();
    const draft: BookingDraftForm = {
      ...fallbackDraft,
      check_in: "2026-11-20",
      check_out: "2026-11-22",
      adults: 4,
      children: 1,
      room_count: 3,
      stay_type: "room",
      has_pets: true,
      pet_count: 2,
      pet_type: "cat",
      pet_notes: "兩隻貓",
    };

    writeBookingDraft(storage, draft);

    expect(readBookingDraft(storage, fallbackDraft)).toMatchObject(draft);
  });

  it("falls back safely when the stored draft is damaged", () => {
    const storage = createMemoryStorage({
      [bookingDraftStorageKey]: "{not-json",
    });

    expect(readBookingDraft(storage, fallbackDraft)).toEqual(fallbackDraft);
  });
});
