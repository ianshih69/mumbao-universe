export type BookingAvailabilityResult = {
  available: boolean;
  checkIn: string;
  checkOut: string;
};

export type BookingRequestPayload = {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  check_in: string;
  check_out: string;
  guest_count: string;
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

export function submitBookingRequest(payload: BookingRequestPayload) {
  return bookingRequest<{ ok: boolean; request: { id: string; status: string; check_in: string; check_out: string } }>(
    "?action=request",
    { method: "POST", body: JSON.stringify(payload) }
  );
}
