import { useEffect, useState } from "react";

const ENABLE_CONSTRUCTION_NOTICE = true;
const NOTICE_STORAGE_KEY = "mumbao_site_notice_seen";

export function SiteConstructionNotice() {
  const [shouldShowModal, setShouldShowModal] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!ENABLE_CONSTRUCTION_NOTICE) {
      return;
    }

    try {
      setShouldShowModal(localStorage.getItem(NOTICE_STORAGE_KEY) !== "true");
    } catch {
      setShouldShowModal(true);
    } finally {
      setIsReady(true);
    }
  }, []);

  if (!ENABLE_CONSTRUCTION_NOTICE) {
    return null;
  }

  const handleClose = () => {
    try {
      localStorage.setItem(NOTICE_STORAGE_KEY, "true");
    } catch {
      // Ignore storage failures so the notice can still be dismissed.
    }

    setShouldShowModal(false);
  };

  return (
    <>
      <div
        className="pointer-events-none fixed left-0 right-0 top-0 z-[60] bg-[#8b6f5b]/95 px-4 py-2 text-center text-xs font-medium tracking-wide text-white shadow-sm sm:text-sm"
        role="status"
        aria-live="polite"
      >
        官網建置中｜預計 2026 年 7～9 月試營運／正式營業
      </div>

      {isReady && shouldShowModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/35 px-5 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="construction-notice-title"
        >
          <div className="w-full max-w-md rounded-[8px] border border-[#eadfce] bg-[#fffaf3] p-6 text-center shadow-2xl sm:p-7">
            <p className="mb-3 text-xs font-semibold tracking-[0.24em] text-[#a87863]">
              STime Villa
            </p>
            <h2
              id="construction-notice-title"
              className="font-serif text-2xl font-semibold tracking-wide text-stone-900"
            >
              慢慢蒔光官網建置中
            </h2>
            <p className="mt-4 text-left text-sm leading-7 text-stone-700 sm:text-base sm:leading-8">
              慢慢蒔光 STime Villa 民宿目前官網與住宿空間仍在建置中，預計於 2026 年
              7～9 月期間開始試營運／正式營業。房型、訂房與最新資訊將陸續更新，請以官網公告為準。
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 w-full rounded-full bg-[#8b6f5b] px-5 py-3 text-sm font-semibold tracking-wide text-white shadow-sm transition hover:bg-[#745845] focus:outline-none focus:ring-2 focus:ring-[#c8aa8e] focus:ring-offset-2"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
