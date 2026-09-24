import type { Plugin } from "vite";

export function renderPageHtml(template: string, page: {
  pathname: string;
  title: string;
  description: string;
  canonical: string;
  body: string;
}): string;

export function publicPagesPrerender(): Plugin;
