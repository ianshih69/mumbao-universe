import { useState, useEffect } from "react";
import { Menu, Globe, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const menuItems = [
    "關於我們",
    "最新消息",
    "房間",
    "線上訂房",
    "媒體報導",
    "隱私權政策",
  ];

  const languages = ["繁體中文", "日本語", "韓語", "English"];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out",
        isScrolled
          ? "bg-white/90 backdrop-blur-md py-4 shadow-sm"
          : "bg-transparent py-6"
      )}
    >
      <div className="container mx-auto px-4 md:px-8 flex items-center justify-between">
        {/* Left: Menu + Menu Image */}
        <Sheet>
          <SheetTrigger asChild>
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="p-2 rounded-full hover:bg-black/5 transition-colors">
                <Menu
                  className={cn(
                    "w-6 h-6",
                    isScrolled ? "text-primary" : "text-white"
                  )}
                />
              </div>
              <img
                src="/images/menu.webp"
                alt="Menu"
                className="h-12 md:h-16 object-contain"
              />
            </div>
          </SheetTrigger>
          <SheetContent side="left" className="w-full md:w-[400px] bg-white/95 backdrop-blur-xl border-none p-0">
            <SheetTitle asChild>
              <VisuallyHidden>Navigation Menu</VisuallyHidden>
            </SheetTitle>
            <div className="flex flex-col h-full p-12">
              <div className="flex justify-end mb-12">
                <SheetClose className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X className="w-6 h-6 text-primary" />
                </SheetClose>
              </div>
              <nav className="flex flex-col gap-8">
                {menuItems.map((item) => (
                  <a
                    key={item}
                    href="#"
                    className="font-serif text-2xl md:text-3xl text-primary hover:text-[#E8A0BF] transition-colors tracking-wider"
                  >
                    {item}
                  </a>
                ))}
              </nav>
            </div>
          </SheetContent>
        </Sheet>

        {/* Center: Logo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <img
            src="/images/logo.webp"
            alt="STime Villa Logo"
            className="h-12 md:h-16 object-contain"
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 md:gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 text-sm font-medium tracking-wider cursor-pointer hover:opacity-70 transition-opacity",
                  isScrolled ? "text-primary" : "text-white"
                )}
              >
                <Globe className="w-4 h-4 mr-1" />
                <span>TW</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white/95 backdrop-blur-xl border-none shadow-lg min-w-[150px]">
              {languages.map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  className="font-serif text-primary hover:text-[#E8A0BF] hover:bg-black/5 cursor-pointer py-3 px-4 text-sm tracking-wide"
                >
                  {lang}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
