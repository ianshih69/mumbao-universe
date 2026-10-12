import { useEffect, useState, type FormEvent, type ReactNode } from "react";

export const chatTestLockedEvent = "mumbao-chat-test-locked";
const endpoint = "/api/ai-chat?action=test-access";
type Access = { authorized: boolean; enabled?: boolean; expiresIn?: number; error?: string };

export async function getChatTestAccess(signal?: AbortSignal): Promise<Access> {
  const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store", signal });
  const data = await response.json();
  return { ...data, authorized: response.ok && data.authorized === true };
}

export function ChatTestGate({ children, active = true }: { children: ReactNode; active?: boolean }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAccess(null);
    if (!active) return;
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout>;
    let sequence = 0;
    const apply = (value: Access) => {
      clearTimeout(expiry);
      setAccess(value);
      if (value.authorized && value.enabled !== false) {
        expiry = setTimeout(() => setAccess({ authorized: false }), Math.max(0, value.expiresIn || 0));
      }
    };
    const check = async () => {
      const current = ++sequence;
      try {
        const next = await getChatTestAccess(controller.signal);
        if (!controller.signal.aborted && current === sequence) apply(next);
      } catch {
        if (!controller.signal.aborted && current === sequence) apply({ authorized: false });
      }
    };
    const locked = () => { sequence++; apply({ authorized: false }); };
    const granted = () => { void check(); };
    void check();
    window.addEventListener("focus", check);
    window.addEventListener(chatTestLockedEvent, locked);
    window.addEventListener("mumbao-chat-test-granted", granted);
    return () => {
      controller.abort();
      clearTimeout(expiry);
      window.removeEventListener("focus", check);
      window.removeEventListener(chatTestLockedEvent, locked);
      window.removeEventListener("mumbao-chat-test-granted", granted);
    };
  }, [active]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const result: Access = await response.json();
      if (!response.ok || result.authorized !== true) {
        setError(result.error || "客服測試暫時無法使用，請稍後再試。");
      } else {
        // Re-read the HttpOnly grant before mounting any chat or LIFF effects.
        window.dispatchEvent(new Event("mumbao-chat-test-granted"));
      }
    } catch { setError("客服測試暫時無法使用，請稍後再試。"); }
    finally { setPassword(""); setBusy(false); }
  }

  if (!active) return null;
  if (access?.authorized) return <>{children}</>;
  return (
    <section className="mx-auto flex h-full min-h-[360px] w-full max-w-[390px] flex-col justify-center rounded-[24px] border border-[#eadfce] bg-[#fbf7f1] p-6 text-stone-900 shadow-sm sm:min-w-[340px]" aria-label="問慢寶測試驗證">
      <p className="text-xs font-semibold text-[#b08d73]">STime Villa</p>
      <h2 className="mt-4 font-serif text-2xl font-light">問慢寶客服測試中</h2>
      <p className="mt-4 text-sm leading-7 text-stone-600">此功能目前正在測試中，尚未正式開放。</p>
      {access === null ? <p role="status" className="mt-6 text-sm">正在確認測試授權…</p> : (
        <form className="mt-6 grid gap-4" onSubmit={unlock}>
          <label className="grid gap-1.5 text-sm font-medium text-stone-700">
            測試密碼
            <input type="password" autoComplete="off" maxLength={128} required value={password}
              onChange={event => { setPassword(event.target.value); setError(""); }}
              className="h-12 min-w-0 w-full rounded-lg border border-[#ded3c5] bg-white px-3 outline-none focus:ring-2 focus:ring-[#b08d73]" />
          </label>
          {(error || access.error) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error || access.error}</p>}
          <button disabled={busy} className="h-12 rounded-lg bg-[#8b6f5b] px-4 text-sm font-medium text-white hover:bg-[#765d4a] disabled:opacity-60">{busy ? "驗證中…" : "進入測試"}</button>
        </form>
      )}
    </section>
  );
}
