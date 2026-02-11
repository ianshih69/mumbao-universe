import { Facebook, Instagram, Phone, MapPin, MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#F9F8F6] py-12 md:py-16 text-gray-800 border-t border-stone-200">
      <div className="container mx-auto px-6 md:px-8 max-w-6xl">
        {/* Main Grid: 12 Columns on Desktop */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-8 items-start mb-10 md:mb-12">

          {/* Column 1: Brand Identity (Desktop: col-span-4) */}
          <div className="md:col-span-4 space-y-4 text-left">
            <h2 className="font-serif text-4xl md:text-5xl tracking-[0.05em] text-[#1c1c1c] font-medium leading-none">
              MUMBAO
            </h2>
            <p className="text-base md:text-lg text-stone-600 tracking-wide font-serif italic">
              “什麼都不做，也值得被愛”
            </p>
          </div>

          {/* Column 2: Navigation (Desktop: col-span-4) */}
          <div className="md:col-span-4 space-y-4 text-left">
            <h3 className="font-serif text-sm tracking-[0.15em] font-semibold text-stone-900 uppercase mb-4 border-b border-stone-200 pb-3 block">
              EXPLORE
            </h3>
            {/* Mobile: Vertical list, Desktop: 1-Col Stack */}
            <ul className="flex flex-col gap-4 text-base tracking-wide text-stone-800 font-serif leading-relaxed">
              <li>
                <a href="/#about" className="group flex items-baseline justify-start gap-2 hover:text-[#000] transition-colors">
                  <span className="block font-normal">About Us</span>
                  <span className="block text-sm text-stone-500">/ 關於慢寶</span>
                </a>
              </li>
              <li>
                <a href="/#experience" className="group flex items-baseline justify-start gap-2 hover:text-[#000] transition-colors">
                  <span className="block font-normal">Experience</span>
                  <span className="block text-sm text-stone-500">/ 慢食慢遊</span>
                </a>
              </li>
              <li>
                <a href="/#rooms" className="group flex items-baseline justify-start gap-2 hover:text-[#000] transition-colors">
                  <span className="block font-normal">Rooms</span>
                  <span className="block text-sm text-stone-500">/ 空間棲息</span>
                </a>
              </li>
              <li>
                <a href="/#news" className="group flex items-baseline justify-start gap-2 hover:text-[#000] transition-colors">
                  <span className="block font-normal">News</span>
                  <span className="block text-sm text-stone-500">/ 最新消息</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Social (Desktop: col-span-4) */}
          <div className="md:col-span-4 space-y-4 text-left">
            <h3 className="font-serif text-sm tracking-[0.15em] font-semibold text-stone-900 uppercase mb-4 border-b border-stone-200 pb-3 block">
              CONTACT
            </h3>

            <div className="flex flex-row items-start justify-between gap-4">
              {/* Left (Text Info) */}
              <div className="space-y-3 text-base tracking-wide text-stone-700 font-serif leading-snug flex-1">
                <div className="space-y-2">
                  <div className="flex items-center justify-start gap-2.5">
                    <MapPin className="w-4 h-4 text-stone-800 shrink-0" strokeWidth={1.5} />
                    <span className="text-sm md:text-base whitespace-nowrap text-stone-800">宜蘭縣員山鄉深洲二路158號</span>
                  </div>
                  <a href="tel:+886987274888" className="flex items-center justify-start gap-2.5 hover:text-black transition-colors">
                    <Phone className="w-4 h-4 text-stone-800 shrink-0" strokeWidth={1.5} />
                    <span className="text-sm md:text-base text-stone-800">+886 987-274-888</span>
                  </a>
                  <div className="pl-[26px] text-sm md:text-base text-stone-800">
                    統編：12345678
                  </div>
                </div>

                <div className="flex items-center justify-start gap-4 pt-3 pl-1">
                  <a href="#" className="text-stone-800 hover:text-black transition-colors duration-300">
                    <Facebook className="w-5 h-5" strokeWidth={1.5} />
                  </a>
                  <a href="#" className="text-stone-800 hover:text-black transition-colors duration-300">
                    <Instagram className="w-5 h-5" strokeWidth={1.5} />
                  </a>
                  <a href="#" className="text-stone-800 hover:text-[#00C300] transition-colors duration-300" title="LINE">
                    <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                  </a>
                </div>
              </div>

              {/* Right (QR Code) */}
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="w-28 h-28 bg-white p-1 border border-stone-200">
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://line.me/ti/p/@mumbao"
                    alt="LINE QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[11px] text-stone-900 tracking-wider font-serif text-center">LINE 預約</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-stone-200 pt-8 flex flex-col items-start gap-3 md:gap-4 font-serif text-stone-600">
          <p className="text-sm tracking-wide">© 2026 The Mumbao Studio. All rights reserved.</p>
          <div className="flex gap-4 text-xs md:text-sm tracking-wide text-stone-500">
            <a href="#" className="hover:text-stone-800 transition-colors">Privacy Policy</a>
            <span className="text-stone-300">|</span>
            <a href="#" className="hover:text-stone-800 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
