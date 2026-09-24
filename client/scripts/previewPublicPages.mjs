import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  await readFile(path.join(client, "vercel.json"), "utf8")
);
const output = path.resolve(process.argv[2] || path.join(client, "dist"));
await readFile(path.join(output, "rooms", "index.html"), "utf8");
const temporary = await mkdtemp(path.join(tmpdir(), "mumbao-static-routing-"));
const localConfig = path.join(temporary, "vercel.json");
// Use the real routing configuration, but serve build artifacts only: no API, env pull, or project link.
const routing = Object.fromEntries(
  Object.entries(config).filter(([key]) =>
    ["rewrites", "redirects", "headers", "cleanUrls", "trailingSlash"].includes(
      key
    )
  )
);
await writeFile(
  localConfig,
  JSON.stringify({
    ...routing,
    framework: null,
    devCommand: null,
    buildCommand: null,
    installCommand: null,
  })
);
const child = spawn(
  process.execPath,
  [
    path.join(client, "..", "node_modules", "vercel", "dist", "vc.js"),
    "dev",
    "--local",
    "--cwd",
    output,
    "--local-config",
    localConfig,
    "--listen",
    "127.0.0.1:4178",
    "--non-interactive",
  ],
  { stdio: "inherit", env: { ...process.env, NO_UPDATE_NOTIFIER: "1" } }
);
child.on("exit", code => {
  process.exitCode = code ?? 1;
});
