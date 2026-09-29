import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// `npm run dev` has no Vercel functions, so run api/suggest-fix.ts here too (with GEMINI_API_KEY from app/.env).
// Only used by the dev server; the build and the deployed site are unaffected.
const devApi = (): Plugin => ({
  name: "dev-api",
  apply: "serve",
  configureServer(server) {
    process.env.GEMINI_API_KEY ??= loadEnv("development", __dirname, "").GEMINI_API_KEY;
    server.middlewares.use("/api/suggest-fix", async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const { POST } = await server.ssrLoadModule("/api/suggest-fix.ts");
      const headers = new Headers(Object.entries(req.headers).flatMap(([key, value]) => (typeof value === "string" ? [[key, value] as [string, string]] : [])));
      const response: Response = await POST(new Request(`http://${req.headers.host}/api/suggest-fix`, { method: req.method, headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });
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
