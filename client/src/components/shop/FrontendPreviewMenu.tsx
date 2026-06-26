import { Link } from "wouter";

export const frontendPreviewLinks = [
  { label: "官網首頁", href: "/" },
  { label: "線上訂房", href: "/booking" },
  { label: "宇宙碎品", href: "/shop" },
];

export default function FrontendPreviewMenu() {
  return (
    <details className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-full border border-stone-200 bg-white px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
        前台預覽
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-stone-200 bg-white py-2 text-sm shadow-lg shadow-stone-200/60">
        {frontendPreviewLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="block px-4 py-2.5 text-stone-700 transition hover:bg-[#f7f1e9]"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
