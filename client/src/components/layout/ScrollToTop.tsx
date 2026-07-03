import { useEffect } from "react";
import { useLocation } from "wouter";

function scrollToHash(hash: string) {
  const id = hash.replace("#", "");
  if (!id) return false;

  const element = document.getElementById(id);
  if (!element) return false;

  element.scrollIntoView({ behavior: "auto", block: "start" });
  return true;
}

function shouldSkipScroll(pathname: string) {
  return pathname.startsWith("/admin") || pathname === "/ai-chat" || pathname === "/chat";
}

export function ScrollToTop() {
  const [pathname] = useLocation();

  useEffect(() => {
    if (shouldSkipScroll(pathname)) {
      return;
    }

    const runScroll = () => {
      if (window.location.hash && scrollToHash(window.location.hash)) {
        return;
      }

      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    requestAnimationFrame(runScroll);
  }, [pathname]);

  useEffect(() => {
    const handleHashChange = () => {
      if (shouldSkipScroll(window.location.pathname)) {
        return;
      }

      requestAnimationFrame(() => {
        scrollToHash(window.location.hash);
      });
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  return null;
}
