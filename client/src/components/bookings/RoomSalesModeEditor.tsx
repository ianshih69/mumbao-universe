import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchRoomSalesDate, saveRoomSalesDate } from "@/lib/bookings/adminBookingsApi";

export default function RoomSalesModeEditor({ token, date, onBusyChange }: {
  token: string; date: string; onBusyChange: (busy: boolean) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [value, setValue] = useState("default");
  const [saved, setSaved] = useState("default");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setEnabled(false); setError(""); setNotice("");
    (async () => {
      try {
        const result = await fetchRoomSalesDate(token, date);
        if (cancelled) return;
        setEnabled(result.enabled);
        const next = result.roomBookingEnabledOverride == null ? "default" : String(result.roomBookingEnabledOverride);
        setValue(next); setSaved(next);
      } catch { if (!cancelled) setError("無法讀取單間開放設定。"); }
    })();
    return () => { cancelled = true; };
  }, [token, date]);
  async function save() {
    if (inFlight.current || value === saved) return;
    inFlight.current = true; setBusy(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const override = value === "default" ? null : value === "true";
      await saveRoomSalesDate(token, date, override);
      const fresh = await fetchRoomSalesDate(token, date);
      if (!fresh.enabled || fresh.roomBookingEnabledOverride !== override) throw new Error("儲存後讀取結果不一致，請重新確認。");
      setSaved(value); setNotice("單間設定已儲存");
    } catch (e) { setError(e instanceof Error ? e.message : "無法儲存單間設定。"); }
    finally { inFlight.current = false; setBusy(false); onBusyChange(false); }
  }
  if (!enabled) return error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null;
  return <section className="grid gap-3 border-t border-stone-200 pt-4">
    <label className="grid gap-2 text-sm font-medium">開放單間訂房
      <select aria-label="開放單間訂房" className="h-11 w-full rounded-md border border-stone-300 bg-white px-3" value={value} disabled={busy}
        onChange={event => { setValue(event.target.value); setNotice(""); }}>
        <option value="default">使用預設（日～四開啟；週五、週六關閉）</option>
        <option value="true">ON 開啟</option><option value="false">OFF 關閉</option>
      </select>
    </label>
    {value !== saved && <p className="text-sm text-amber-800">單間設定尚未儲存</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <Button type="button" disabled={busy || value === saved} onClick={() => void save()} className="justify-self-end bg-[#8b6f5b]">
      {busy ? "儲存中…" : "儲存單間設定"}
    </Button>
  </section>;
}
