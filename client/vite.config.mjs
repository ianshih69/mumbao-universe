import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localApiRoutes = new Map([
  ["/api/ping", path.resolve(__dirname, "api", "ping.js")],
  ["/api/env-test", path.resolve(__dirname, "api", "env-test.js")],
  ["/api/ai-chat-history", path.resolve(__dirname, "api", "ai-chat-history.js")],
  ["/api/ai-chat-message", path.resolve(__dirname, "api", "ai-chat-message.js")],
]);

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

function createVercelResponse(res) {
  return {
    status(code) {
      res.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
      return this;
    },
    json(body) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(body));
    },
    end(body) {
      res.end(body);
    },
  };
}

async function loadApiHandler(apiFile) {
  const source = await fs.readFile(apiFile, "utf8");
  const runnableSource = source
    .replace(
      /export\s+default\s+async\s+function\s+handler/,
      "exports.default = async function handler"
    )
    .replace(
      /export\s+default\s+function\s+handler/,
      "exports.default = function handler"
    );
  const exports = {};
  const factory = new Function(
    "exports",
    "process",
    "Buffer",
    "fetch",
    "AbortController",
    "setTimeout",
    "clearTimeout",
    "console",
    `${runnableSource}\nreturn exports.default;`
  );

  return factory(
    exports,
    process,
    Buffer,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    console
  );
}

function localApiPlugin() {
  return {
    name: "mumbao-local-vercel-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url || "/", "http://localhost");
        const apiFile = localApiRoutes.get(requestUrl.pathname);

        if (!apiFile) {
          next();
          return;
        }

        try {
          req.query = Object.fromEntries(requestUrl.searchParams.entries());

          if (!["GET", "HEAD"].includes(req.method || "GET")) {
            req.body = await readRequestBody(req);
          }

          const handler = await loadApiHandler(apiFile);
          await handler(req, createVercelResponse(res));
        } catch (error) {
          console.error("Local API handler error:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "Local API handler failed.",
              message: error instanceof Error ? error.message : String(error),
            })
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  for (const name of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AI_MODE",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "DEEPSEEK_MODEL",
  ]) {
    if (env[name]) {
      process.env[name] = env[name];
    }
  }

  return {
    plugins: [localApiPlugin(), react(), tailwindcss(), vitePluginManusRuntime()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@shared": path.resolve(__dirname, "..", "shared"),
        "@assets": path.resolve(__dirname, "..", "attached_assets"),
      },
    },
    envDir: path.resolve(__dirname, ".."),
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      strictPort: false,
      host: true,
      allowedHosts: [
        ".manuspre.computer",
        ".manus.computer",
        ".manus-asia.computer",
        ".manuscomputer.ai",
        ".manusvm.computer",
        "localhost",
        "127.0.0.1",
      ],
      fs: {
        strict: true,
        allow: [path.resolve(__dirname, "..")],
        deny: ["**/.*"],
      },
    },
  };
});
