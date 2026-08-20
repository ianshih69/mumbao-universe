export const MIN_BOOKING_DATE = "2026-11-01";

export type BookingDateRange = {
  check_in: string;
  check_out: string;
};

function toDateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addBookingDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateText(date);
}

export function resolveEarliestBookingDate(todayText: string) {
  return todayText < MIN_BOOKING_DATE ? MIN_BOOKING_DATE : todayText;
}

export function createDefaultBookingDateRange(todayText: string): BookingDateRange {
  const checkIn = resolveEarliestBookingDate(todayText);
  return {
    check_in: checkIn,
    check_out: addBookingDays(checkIn, 1),
  };
}

export function resolveBookingDraftDateRange<T extends BookingDateRange>(
  draft: T,
  fallback: BookingDateRange,
  minDate = MIN_BOOKING_DATE,
) {
  if (draft.check_in >= minDate) {
    if (draft.check_out > draft.check_in) {
      return { draft, adjusted: false };
    }
    return {
      draft: {
        ...draft,
        check_out: addBookingDays(draft.check_in, 1),
      },
      adjusted: true,
    };
  }

  return {
    draft: {
      ...draft,
      check_in: fallback.check_in,
      check_out: fallback.check_out,
    },
    adjusted: true,
  };
}
