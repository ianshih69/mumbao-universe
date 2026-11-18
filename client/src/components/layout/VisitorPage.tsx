import { useEffect, type ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import "./VisitorPage.css";

type Props = {
  seo: { title: string; description: string; canonical: string };
  children: ReactNode;
};

export function VisitorPage({ seo, children }: Props) {
  useEffect(() => {
    document.title = seo.title;
    for (const [key, value] of [
      ["description", seo.description],
      ["og:title", seo.title], ["og:description", seo.description], ["og:url", seo.canonical],
      ["twitter:title", seo.title], ["twitter:description", seo.description], ["twitter:url", seo.canonical],
    ]) {
      const meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${key}"], meta[property="${key}"]`);
      if (meta) meta.content = value;
    }
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = seo.canonical;
  }, [seo]);

  return (
    <div className={"visitor-page"}>
      <Header />
      <main className={"visitor-main"}>{children}</main>
      <Footer />
    </div>
  );
}
