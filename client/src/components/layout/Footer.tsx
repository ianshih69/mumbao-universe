import { Facebook, Instagram, MessageCircle } from "lucide-react";

const policyLinks = [
  { href: "/privacy", label: "隱私權政策" },
  { href: "/terms", label: "服務條款" },
  { href: "/data-deletion", label: "資料刪除說明" },
];

const socialLinks = [
  { href: "#", label: "Facebook", Icon: Facebook },
  { href: "#", label: "Instagram", Icon: Instagram },
  { href: "#", label: "LINE", Icon: MessageCircle },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-[#eee5da] bg-[#fbf8f2] px-5 pb-20 pt-8 text-center font-serif text-[#75685d] md:pb-7 md:pt-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1 text-[13px] leading-6 md:text-sm">
          <span className="hidden sm:inline">宜蘭縣民宿3148號</span>
          <a
            href="tel:+886988098367"
            className="transition-colors duration-200 hover:text-[#B77C4B]"
          >
            <span className="font-medium text-[#3D332B]">TEL :</span>{" "}
            +886 988-098-367
          </a>
          <span>
            <span className="font-medium text-[#3D332B] sm:hidden">
              ADD. :
            </span>
            <span className="hidden font-medium text-[#3D332B] sm:inline">
              ADD :
            </span>{" "}
            宜蘭縣員山鄉深洲二路158號
          </span>
          <span className="sm:hidden">宜蘭縣民宿3148號</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] leading-6">
          <span>Follow us on :</span>
          <div className="flex items-center justify-center gap-4">
            {socialLinks.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="text-[#5f5147] transition-colors duration-200 hover:text-[#B77C4B]"
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] leading-6 text-[#8a7a6d] md:text-[13px]">
          <span className="basis-full sm:basis-auto">
            © 2026 慢慢蒔光 STime Villa. All Rights Reserved.
          </span>
          {policyLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors duration-200 hover:text-[#B77C4B]"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
