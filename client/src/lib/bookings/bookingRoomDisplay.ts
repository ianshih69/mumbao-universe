export type BookingRoomSnapshot = {
  roomId?: string | null;
  code?: string | null;
  publicName?: string | null;
  capacity?: number | null;
};

function roomCodePattern(code: string) {
  const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapedCode}\\b`, "i");
}

export function bookingRoomName(room?: BookingRoomSnapshot | null) {
  const name = room?.publicName?.trim() || "";
  const code = room?.code?.trim() || "";
  if (code && roomCodePattern(code).test(name)) return name;
  return [name, code].filter(Boolean).join(" ") || "房間資料未提供";
}

export function bookingRoomLabel(room?: BookingRoomSnapshot | null) {
  const code = room?.code?.trim() || "";
  const publicName = room?.publicName?.trim() || "";
  const name = code ? publicName.split(roomCodePattern(code)).map(part => part.trim()).filter(Boolean).join(" ") : publicName;
  const identity = [code, name].filter(Boolean).join(" ");
  const capacity = room?.capacity;
  return [
    identity || "房間資料未提供",
    typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0
      ? `最多 ${capacity} 位`
      : null,
  ].filter(Boolean).join("｜");
}

export function adminBookingStayLabel(booking: {
  stay_type: "villa" | "room";
  submitted_snapshot?: { summary?: { room?: BookingRoomSnapshot | null } | null } | null;
  pricing_breakdown?: { room?: BookingRoomSnapshot | null } | null;
}) {
  if (booking.stay_type === "villa") return "包棟 villa";
  const room = booking.submitted_snapshot?.summary?.room ?? booking.pricing_breakdown?.room;
  return `單間｜${bookingRoomLabel(room)}`;
}
