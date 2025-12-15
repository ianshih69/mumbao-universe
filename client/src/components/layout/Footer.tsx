import { Facebook, Instagram, Mail, Phone, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#F5F5F5] pt-20 pb-10 text-primary">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Contact Info */}
          <div className="space-y-6">
            <h3 className="font-serif text-xl tracking-widest mb-6 border-b border-primary/10 pb-4 inline-block">
              CONTACT
            </h3>
            <div className="space-y-4 text-sm tracking-wide opacity-80">
              <a href="tel:+88688899270" className="flex items-center gap-3 hover:text-[#E8A0BF] transition-colors">
                <Phone className="w-4 h-4" />
                <span>+886 987274888</span>
              </a>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-1" />
                <span>946 屏東縣恆春鎮崁頭路270號</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-xs border border-primary/30 px-2 py-0.5">統編</span>
                <span>85582148</span>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="space-y-6">
            <h3 className="font-serif text-xl tracking-widest mb-6 border-b border-primary/10 pb-4 inline-block">
              FOLLOW US
            </h3>
            <div className="flex gap-6">
              <a href="#" className="hover:text-[#E8A0BF] transition-colors transform hover:-translate-y-1 duration-300">
                <Facebook className="w-6 h-6" />
              </a>
              <a href="#" className="hover:text-[#E8A0BF] transition-colors transform hover:-translate-y-1 duration-300">
                <Instagram className="w-6 h-6" />
              </a>
              <a href="#" className="hover:text-[#E8A0BF] transition-colors transform hover:-translate-y-1 duration-300">
                <Mail className="w-6 h-6" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
             <h3 className="font-serif text-xl tracking-widest mb-6 border-b border-primary/10 pb-4 inline-block">
              EXPLORE
            </h3>
            <ul className="space-y-3 text-sm tracking-wide opacity-80">
              <li><a href="#" className="hover:text-[#E8A0BF] transition-colors">About Us</a></li>
              <li><a href="#" className="hover:text-[#E8A0BF] transition-colors">Rooms</a></li>
              <li><a href="#" className="hover:text-[#E8A0BF] transition-colors">Dining</a></li>
              <li><a href="#" className="hover:text-[#E8A0BF] transition-colors">News</a></li>
            </ul>
          </div>
          
           {/* Newsletter */}
          <div className="space-y-6">
             <h3 className="font-serif text-xl tracking-widest mb-6 border-b border-primary/10 pb-4 inline-block">
              NEWSLETTER
            </h3>
            <p className="text-sm opacity-60 mb-4">Subscribe to receive updates and special offers.</p>
            <div className="flex border-b border-primary/30 pb-2">
                <input type="email" placeholder="Your Email" className="bg-transparent w-full outline-none text-sm" />
                <button className="text-xs font-bold uppercase tracking-widest hover:text-[#E8A0BF] transition-colors">Send</button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-primary/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs opacity-50 tracking-wider">
          <p>Copyright © 2025 The Wandering Walls. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:opacity-100 transition-opacity">Sitemap</a>
            <a href="#" className="hover:opacity-100 transition-opacity">Privacy Policy</a>
            <span>Design by Manus</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
