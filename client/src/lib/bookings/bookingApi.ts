export type StayType = "villa" | "room";
export type PetType = "dog" | "cat" | "other";

export type BookingAvailabilityResult = {
  available: boolean;
  checkIn: string;
  checkOut: string;
};

export type BookingCalendarResult = {
  from: string;
  to: string;
  maxDate: string;
  unavailableDates: string[];
};

export type BookingRequestPayload = {
  guest_name: string;
  email: string;
  phone: string;
  check_in: string;
  check_out: string;
  stay_type: StayType;
  adults: number;
  children: number;
  room_count: number;
  has_pets: boolean;
  pet_count: number;
  pet_type: PetType;
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
  const params = new URLSearchParams({ action: "calendar", from, months: "12" });
  return bookingRequest<BookingCalendarResult & { ok: boolean }>(`?${params.toString()}`);
}

export function submitBookingRequest(payload: BookingRequestPayload) {
  return bookingRequest<{ ok: boolean; request: { id: string; status: string; check_in: string; check_out: string } }>(
    "?action=request",
    { method: "POST", body: JSON.stringify(payload) }
  );
}
