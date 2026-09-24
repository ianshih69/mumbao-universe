import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse, parseFragment, serialize } from "parse5";

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.childNodes || []) {
    const match = find(child, predicate);
    if (match) return match;
  }
}
const attribute = (node, name) =>
  node.attrs?.find(attr => attr.name === name)?.value;
function setAttribute(node, name, value) {
  const existing = node.attrs.find(attr => attr.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
}

export function renderPageHtml(template, page) {
  const document = parse(template);
  const required = predicate => {
    const node = find(document, predicate);
    if (!node)
      throw new Error(
        `Prerender template is missing required markup: ${page.pathname}`
      );
    return node;
  };
  const title = required(node => node.tagName === "title");
  title.childNodes = [
    { nodeName: "#text", value: page.title, parentNode: title },
  ];
  for (const [key, value] of [
    ["description", page.description],
    ["og:title", page.title],
    ["og:description", page.description],
    ["og:url", page.canonical],
    ["twitter:title", page.title],
    ["twitter:description", page.description],
    ["twitter:url", page.canonical],
  ]) {
    const meta = required(
      node =>
        node.tagName === "meta" &&
        (attribute(node, "name") === key || attribute(node, "property") === key)
    );
    setAttribute(meta, "content", value);
  }
  const canonical = required(
    node => node.tagName === "link" && attribute(node, "rel") === "canonical"
  );
  setAttribute(canonical, "href", page.canonical);
  const robots = find(
    document,
    node => node.tagName === "meta" && attribute(node, "name") === "robots"
  );
  if (robots) setAttribute(robots, "content", "index,follow");
  const root = required(node => attribute(node, "id") === "root");
  setAttribute(root, "data-prerendered", "true");
  root.childNodes = parseFragment(page.body).childNodes;
  root.childNodes.forEach(child => {
    child.parentNode = root;
  });
  if (!find(root, node => node.tagName === "h1"))
    throw new Error(`Missing H1: ${page.pathname}`);
  return serialize(document);
}

export function publicPagesPrerender() {
  let config;
  return {
    name: "mumbao-public-pages-prerender",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      // Vite's config runner is already closed here; render in a native Node worker.
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          path.join(config.root, "scripts", "prerender.mjs"),
          config.root,
          path.resolve(config.root, config.build.outDir),
        ],
        { maxBuffer: 1024 * 1024 }
      );
      config.logger.info(stdout.trim());
    },
  };
}

async function prerender(root, outDir) {
  const source = path.join(root, "src");
  // Resolve external dependencies before importing the in-memory server bundle.
  const result = await build({
    entryPoints: [path.join(source, "prerender.tsx")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    alias: { "@": source },
    define: { "import.meta.env": "{}" },
    loader: { ".css": "empty", ".module.css": "empty" },
    plugins: [
      {
        name: "prerender-external-packages",
        setup(build) {
          build.onResolve({ filter: /^[^./]/ }, async args => {
            if (
              args.pluginData?.resolving ||
              args.path.startsWith("@/") ||
              path.isAbsolute(args.path)
            )
              return;
            const resolved = await build.resolve(args.path, {
              resolveDir: args.resolveDir,
              kind: args.kind,
              pluginData: { resolving: true },
            });
            if (resolved.errors.length) return { errors: resolved.errors };
            return { path: pathToFileURL(resolved.path).href, external: true };
          });
        },
      },
    ],
  });
  // No SSR server/function, runtime state, or secrets are written to the output.
  const code = result.outputFiles[0].text;
  const { renderPublicPages } = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  const template = await readFile(path.join(outDir, "index.html"), "utf8");
  for (const page of renderPublicPages()) {
    const directory = path.join(outDir, page.pathname.slice(1));
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "index.html"),
      renderPageHtml(template, page),
      "utf8"
    );
    console.log(`prerender: ${page.pathname}`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prerender(path.resolve(process.argv[2]), path.resolve(process.argv[3])).catch(
    error => {
      console.error("Prerender failed:", error.message);
      process.exitCode = 1;
    }
  );
}
