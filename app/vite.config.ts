import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// `npm run dev` has no Vercel functions, so provide the same AI endpoints locally.
// Only used by the dev server; the build and the deployed site are unaffected.
const devApi = (): Plugin => ({
  name: "dev-api",
  apply: "serve",
  configureServer(server) {
    const rootEnv = loadEnv("development", path.resolve(__dirname, ".."), "");
    const appEnv = loadEnv("development", __dirname, "");
    process.env.AI_GATEWAY_API_KEY ??= appEnv.AI_GATEWAY_API_KEY || rootEnv.AI_GATEWAY_API_KEY;
    const routes = [
      { path: "/api/gemini", module: "/api/gemini.ts" },
      { path: "/api/check-gemini", module: "/api/check-gemini.ts" },
      { path: "/api/suggest-fix", module: "/api/suggest-fix.ts" },
    ];
    for (const route of routes) {
      server.middlewares.use(route.path, async (req, res, next) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const api = await server.ssrLoadModule(route.module);
          const method = req.method ?? "GET";
          const handler = api[method];
          if (typeof handler !== "function") {
            res.statusCode = 405;
            res.end();
            return;
          }
          const headers = new Headers(Object.entries(req.headers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value] as [string, string]] : [])));
          const host = req.headers.host || "localhost";
          const response: Response = await handler(new Request(`http://${host}${route.path}`, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks),
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          next(error);
        }
      });
    }
  },
});

export default defineConfig({
  plugins: [react(), devApi()],
  // Relative paths, and no separate image or style files, so the build can be put inside one page (scripts/inlinePage.mjs).
  base: "./",
  build: { assetsInlineLimit: 100_000_000, cssCodeSplit: false, modulePreload: false },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
