const policyLinks = [
  { href: "/privacy", label: "隱私權政策" },
  { href: "/terms", label: "服務條款" },
  { href: "/data-deletion", label: "資料刪除說明" },
];

const socialLinks = [
  {
    href: "https://www.facebook.com/STimeVilla",
    label: "Facebook",
    src: "/images/social/brand/facebook.svg",
  },
  {
    href: "https://www.instagram.com/mumbao.tw/",
    label: "Instagram",
    src: "/images/social/brand/instagram.svg",
  },
  {
    href: "https://line.me/ti/g/SRvrzLE8CY",
    label: "LINE",
    src: "/images/social/brand/line.svg",
  },
  {
    label: "Threads",
    src: "/images/social/brand/threads.svg",
  },
  {
    label: "X",
    src: "/images/social/brand/x.svg",
  },
  {
    label: "Google Maps",
    src: "/images/social/brand/google-maps.svg",
  },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-[#eee5da] bg-[#fbf8f2] px-5 pb-7 pt-5 text-center font-serif text-[#75685d] md:pb-7 md:pt-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-0 md:gap-3">
        <div className="flex flex-col items-center justify-center gap-y-1 text-[12px] leading-[1.5] tracking-[0.04em] md:flex-row md:flex-wrap md:gap-x-7 md:gap-y-1 md:text-sm md:leading-6 md:tracking-normal">
          <span className="order-3 md:order-1">宜蘭縣民宿3148號</span>
          <a
            href="tel:+886988098367"
            className="order-1 transition-colors duration-200 hover:text-[#B77C4B] md:order-2"
          >
            <span className="font-medium tracking-[0.08em] text-[#3D332B]">
              TEL :
            </span>{" "}
            +886 988-098-367
          </a>
          <span className="order-2 md:order-3">
            <span className="font-medium tracking-[0.08em] text-[#3D332B]">
              ADD :
            </span>{" "}
            宜蘭縣員山鄉深洲二路158號
          </span>
        </div>

        <div className="mt-3 flex flex-row items-center justify-center gap-3 text-[12px] leading-[1.5] md:mt-0 md:gap-x-4 md:gap-y-1 md:text-[13px] md:leading-6">
          <span>Follow us on :</span>
          <div className="flex items-center justify-center gap-3">
            {socialLinks.map(({ href, label, src }) =>
              href ? (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-[17px] w-[17px] items-center justify-center transition-opacity duration-200 hover:opacity-75 md:h-[18px] md:w-[18px]"
                >
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </a>
              ) : (
                <span
                  key={label}
                  aria-label={`${label}（暫未設定連結）`}
                  aria-disabled="true"
                  title={`${label}（暫未設定連結）`}
                  className="inline-flex h-[17px] w-[17px] cursor-default items-center justify-center md:h-[18px] md:w-[18px]"
                >
                  <img src={src} alt="" className="h-full w-full object-contain" />
                </span>
              )
            )}
          </div>
        </div>

        <div className="mt-3.5 flex flex-col items-center justify-center gap-y-1 text-[11px] leading-[1.5] text-[#8a7a6d] md:mt-0 md:flex-row md:flex-wrap md:gap-x-2 md:gap-y-1 md:text-[13px] md:leading-6">
          <span>
            © 2026 慢慢蒔光 STime Villa. All Rights Reserved.
          </span>
          <span className="hidden text-[#cdbfad] md:inline">｜</span>
          <nav className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 md:gap-x-2 md:gap-y-1" aria-label="Footer policies">
            {policyLinks.map((link, index) => (
              <span key={link.href} className="inline-flex items-center gap-x-1.5 md:gap-x-2">
                {index > 0 && <span className="text-[#cdbfad]">｜</span>}
                <a
                  href={link.href}
                  className="transition-colors duration-200 hover:text-[#B77C4B]"
                >
                  {link.label}
                </a>
              </span>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
