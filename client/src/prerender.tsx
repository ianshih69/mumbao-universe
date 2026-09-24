import { renderToString } from "react-dom/server";
import { Router } from "wouter";
import App from "./App";
import { getPublicPageSeo, prerenderPaths } from "./lib/publicPageSeo";

export function renderPublicPages() {
  return prerenderPaths.map(pathname => ({
    pathname,
    ...getPublicPageSeo(pathname)!,
    body: renderToString(
      <Router ssrPath={pathname}>
        <App />
      </Router>
    ),
  }));
}
