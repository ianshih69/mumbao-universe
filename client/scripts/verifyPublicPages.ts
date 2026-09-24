import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { getPublicPageSeo, prerenderPaths } from "../src/lib/publicPageSeo";

const origin = process.argv[2] || "http://127.0.0.1:4178";
const output = path.resolve(process.argv[3] || "client/dist");
type Node = DefaultTreeAdapterMap["node"];
const attr = (node: Node, key: string) =>
  "attrs" in node
    ? node.attrs.find(item => item.name === key)?.value
    : undefined;
const nodes = (node: Node): Node[] => [
  node,
  ...("childNodes" in node ? node.childNodes.flatMap(nodes) : []),
];
const text = (node: Node): string =>
  "value" in node
    ? node.value
    : "childNodes" in node
      ? node.childNodes.map(text).join("")
      : "";
const tag = (node: Node, name: string) =>
  "tagName" in node && node.tagName === name;
async function verify() {
  const sitemapResponse = await fetch(`${origin}/sitemap.xml`);
  assert.equal(sitemapResponse.status, 200);
  const sitemap = await sitemapResponse.text();

  for (const pathname of prerenderPaths) {
    const expected = getPublicPageSeo(pathname)!;
    const response = await fetch(`${origin}${pathname}`, {
      redirect: "manual",
    });
    assert.equal(response.status, 200, pathname);
    assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex/i);
    const html = await response.text();
    // Proves Vercel's local router served the route artifact, not the SPA fallback.
    assert.equal(
      html,
      await readFile(path.join(output, pathname.slice(1), "index.html"), "utf8")
    );
    const all = nodes(parse(html));
    const titles = all.filter(node => tag(node, "title"));
    const descriptions = all.filter(
      node => tag(node, "meta") && attr(node, "name") === "description"
    );
    const canonicals = all.filter(
      node => tag(node, "link") && attr(node, "rel") === "canonical"
    );
    assert.equal(titles.length, 1);
    assert.equal(text(titles[0]), expected.title);
    assert.equal(descriptions.length, 1);
    assert.equal(attr(descriptions[0], "content"), expected.description);
    assert.equal(canonicals.length, 1);
    assert.equal(attr(canonicals[0], "href"), expected.canonical);
    for (const node of all.filter(
      node => tag(node, "meta") && attr(node, "name") === "robots"
    )) {
      assert.doesNotMatch(attr(node, "content") || "", /noindex/i);
    }
    const h1 = all.filter(node => tag(node, "h1"));
    assert.equal(h1.length, 1);
    const main = all.find(node => tag(node, "main"))!;
    assert.ok(text(main).trim().length > 100);
    assert.ok(
      all.some(node => tag(node, "a") && attr(node, "href") === "/mumbao")
    );
    assert.equal(
      sitemap.split(`<loc>${expected.canonical}</loc>`).length - 1,
      1
    );
    console.log(
      JSON.stringify({
        pathname,
        status: response.status,
        title: text(titles[0]),
        description: attr(descriptions[0], "content"),
        canonical: attr(canonicals[0], "href"),
        h1: text(h1[0]),
        main_text_length: text(main).trim().length,
        artifact_match: true,
        sitemap_count: 1,
      })
    );
  }

  const fallback = await fetch(`${origin}/rooms/not-a-room`);
  assert.equal(fallback.status, 200);
  assert.equal(
    await fallback.text(),
    await readFile(path.join(output, "index.html"), "utf8")
  );
  console.log(
    "PUBLIC_PAGES_RAW_HTTP_PASS: 6 prerender routes + unchanged SPA fallback"
  );
}
verify().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
