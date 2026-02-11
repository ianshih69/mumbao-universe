import { Facebook, Instagram, Phone, MapPin, MessageCircle } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#EAE8E4] py-12 md:py-16 text-gray-800 border-t border-stone-300">
      <div className="container mx-auto px-6 md:px-8 max-w-6xl">
        {/* Main Grid: 12 Columns on Desktop */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-8 items-start mb-8 md:mb-12">

          {/* Column 1: Brand Identity (Desktop: col-span-4) */}
          <div className="md:col-span-4 space-y-3 text-left">
            <h2 className="font-serif text-3xl md:text-4xl tracking-widest text-[#2C2C2C] font-medium leading-none">
              MUMBAO
            </h2>
            <p className="text-base text-stone-600 tracking-wide font-serif italic font-medium">
              "什麼都不做，也值得被愛"
            </p>
          </div>

          {/* Column 2: Navigation (Desktop: col-span-4) */}
          <div className="md:col-span-4 space-y-4 text-left">
            <h3 className="font-sans text-xs tracking-[0.25em] font-semibold text-stone-500 uppercase mb-3 border-b border-stone-300 pb-2 inline-block">
              Explore
            </h3>
            {/* Mobile: 2-Col Grid, Desktop: 1-Col Stack */}
            <ul className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-2 text-base tracking-wide text-stone-700 font-serif leading-relaxed">
              <li>
                <a href="/#about" className="group flex items-baseline justify-start gap-2">
                  <span className="block font-medium group-hover:text-black transition-colors">About Us</span>
                  <span className="block text-xs text-stone-500 group-hover:text-stone-700 transition-colors">/ 關於慢寶</span>
                </a>
              </li>
              <li>
                <a href="/#experience" className="group flex items-baseline justify-start gap-2">
                  <span className="block font-medium group-hover:text-black transition-colors">Experience</span>
                  <span className="block text-xs text-stone-500 group-hover:text-stone-700 transition-colors">/ 慢食慢遊</span>
                </a>
              </li>
              <li>
                <a href="/#rooms" className="group flex items-baseline justify-start gap-2">
                  <span className="block font-medium group-hover:text-black transition-colors">Rooms</span>
                  <span className="block text-xs text-stone-500 group-hover:text-stone-700 transition-colors">/ 空間棲息</span>
                </a>
              </li>
              <li>
                <a href="/#news" className="group flex items-baseline justify-start gap-2">
                  <span className="block font-medium group-hover:text-black transition-colors">News</span>
                  <span className="block text-xs text-stone-500 group-hover:text-stone-700 transition-colors">/ 最新消息</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Social (Desktop: col-span-4) */}
          <div className="md:col-span-4 space-y-4 text-left">
            <h3 className="font-sans text-xs tracking-[0.25em] font-semibold text-stone-500 uppercase mb-3 border-b border-stone-300 pb-2 inline-block">
              Contact
            </h3>

            <div className="flex flex-row items-start gap-6">
              {/* Left (Text Info) */}
              <div className="space-y-2 text-base tracking-wide text-stone-700 font-serif leading-snug flex-1">
                <div className="space-y-1.5 align-top">
                  <div className="flex items-start justify-start gap-2">
                    <MapPin className="w-4 h-4 mt-1 text-stone-500 shrink-0" />
                    <span className="text-sm md:text-base">宜蘭縣員山鄉深洲二路158號</span>
                  </div>
                  <a href="tel:+886987274888" className="flex items-center justify-start gap-2 hover:text-black transition-colors">
                    <Phone className="w-4 h-4 text-stone-500 shrink-0" />
                    <span className="text-sm md:text-base">+886 987-274-888</span>
                  </a>
                </div>

                <div className="pt-1 text-sm md:text-base text-stone-700">
                  統編：12345678
                </div>

                <div className="flex items-center justify-start gap-3 pt-2">
                  <a href="#" className="text-stone-500 hover:text-stone-900 transition-colors duration-300">
                    <Facebook className="w-5 h-5" />
                  </a>
                  <a href="#" className="text-stone-500 hover:text-stone-900 transition-colors duration-300">
                    <Instagram className="w-5 h-5" />
                  </a>
                  <a href="#" className="text-stone-500 hover:text-[#00C300] transition-colors duration-300" title="LINE">
                    <MessageCircle className="w-5 h-5" />
                  </a>
                </div>
              </div>

              {/* Right (QR Code) - Side by Side */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-24 h-24 bg-white p-1.5 border border-stone-300">
                  <img
                    src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://line.me/ti/p/@mumbao"
                    alt="LINE QR Code"
                    className="w-full h-full object-contain opacity-80"
                  />
                </div>
                <span className="text-[10px] text-stone-500 tracking-wide text-center">LINE 預約</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-stone-300 pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-xs text-stone-600 tracking-wider font-medium font-sans">
          <p>© 2026 The Mumbao Studio. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-black transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-black transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
