import { Facebook, Instagram, MapPin, MessageCircle, Phone } from "lucide-react";

const footerLinks = [
  { href: "/about", label: "About / 關於慢慢蒔光" },
  { href: "/#experience", label: "Experience / 慢食慢遊" },
  { href: "/#rooms", label: "Rooms / 房型介紹" },
  { href: "/#news", label: "News / 最新消息" },
];

const policyLinks = [
  { href: "/privacy", label: "隱私權政策" },
  { href: "/terms", label: "服務條款" },
  { href: "/data-deletion", label: "資料刪除說明" },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-[#e7ded2] bg-[#F9F8F6] pb-24 pt-20 text-[#3D332B] md:pb-16 md:pt-[88px]">
      <div className="mx-auto max-w-[1160px] px-6 sm:px-8 lg:px-10">
        <div className="grid grid-cols-1 items-start gap-y-12 md:grid-cols-2 md:gap-x-12 lg:grid-cols-[1.45fr_1fr_1.15fr_136px] lg:gap-x-14">
          <div className="space-y-5">
            <h2 className="font-serif text-[42px] font-medium leading-none tracking-[0.05em] text-[#3D332B] md:text-[46px]">
              MUMBAO
            </h2>
            <p className="font-serif text-[16px] italic leading-[1.9] text-[#6F6258] md:text-[17px]">
              「什麼都不做，也值得被愛。」
            </p>
            <div className="space-y-2 bg-white/35 py-1 font-serif text-[15px] leading-[1.9] text-[#75685d] md:text-base">
              <p className="font-medium text-[#4A3A30]">
                慢慢蒔光 STime Villa
              </p>
              <p>
                宜蘭員山包棟民宿｜寵物友善住宿｜慢寶 MUMBAO 原創 IP
              </p>
            </div>
          </div>

          <nav aria-label="Footer navigation" className="space-y-5">
            <h3 className="border-b border-[#ded2c4] pb-3 font-serif text-[13px] font-semibold uppercase tracking-[0.18em] text-[#4A3A30]">
              EXPLORE
            </h3>
            <ul className="flex flex-col gap-4 font-serif text-base leading-relaxed text-[#5f5147]">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="transition-colors duration-200 hover:text-[#B77C4B]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-5">
            <h3 className="border-b border-[#ded2c4] pb-3 font-serif text-[13px] font-semibold uppercase tracking-[0.18em] text-[#4A3A30]">
              CONTACT
            </h3>
            <div className="space-y-3.5 font-serif text-[15px] leading-relaxed text-[#5f5147] md:text-base">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 shrink-0 text-[#8b6f5b]" strokeWidth={1.5} />
                <span>宜蘭縣員山鄉深洲二路158號</span>
              </div>
              <a
                href="tel:+886987274888"
                className="flex items-center gap-3 transition-colors duration-200 hover:text-[#B77C4B]"
              >
                <Phone className="h-5 w-5 shrink-0 text-[#8b6f5b]" strokeWidth={1.5} />
                <span>+886 987-274-888</span>
              </a>
              {/* TODO: 統編確認正式資料後再顯示，避免露出測試資料。 */}
            </div>

            <div className="flex items-center gap-4 pt-2">
              <a
                href="#"
                aria-label="Facebook"
                className="text-[#5f5147] transition-colors duration-200 hover:text-[#B77C4B]"
              >
                <Facebook className="h-[21px] w-[21px]" strokeWidth={1.5} />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="text-[#5f5147] transition-colors duration-200 hover:text-[#B77C4B]"
              >
                <Instagram className="h-[21px] w-[21px]" strokeWidth={1.5} />
              </a>
              <a
                href="#"
                aria-label="LINE"
                className="text-[#5f5147] transition-colors duration-200 hover:text-[#B77C4B]"
              >
                <MessageCircle className="h-[21px] w-[21px]" strokeWidth={1.5} />
              </a>
            </div>
          </div>

          <div className="flex w-[136px] flex-col items-center gap-3 md:mt-10 lg:mt-0">
            <div className="h-28 w-28 bg-white/75 shadow-[0_12px_30px_rgba(79,64,54,0.08)]">
              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://line.me/ti/p/@mumbao"
                alt="慢慢蒔光 LINE 洽詢 QR Code"
                className="h-full w-full object-contain"
                width={112}
                height={112}
                loading="lazy"
              />
            </div>
            <span className="text-center font-serif text-[13px] tracking-wide text-[#6F6258]">
              LINE 洽詢
            </span>
          </div>
        </div>

        <div className="mt-11 flex flex-col items-center gap-4 border-t border-[#ded2c4] pt-7 font-serif text-[13px] leading-relaxed text-[#75685d] md:flex-row md:justify-between md:text-sm">
          <p>© 2026 The Mumbao Studio. All Rights Reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
            {policyLinks.map((link, index) => (
              <span key={link.href} className="inline-flex items-center gap-x-2">
                {index > 0 && <span className="text-[#cdbfad]">｜</span>}
                <a
                  href={link.href}
                  className="transition-colors duration-200 hover:text-[#B77C4B]"
                >
                  {link.label}
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
