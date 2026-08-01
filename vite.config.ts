// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Deploy target: Railway (Node.js server — remplace le preset vercel).
  nitro: {
    preset: "node-server",
    // pdfkit (facture-pdf.server.ts) charge ses polices standard (Helvetica)
    // via un chemin relatif à `__dirname`, qui n'existe pas dans un module
    // ESM — Nitro embarquait pdfkit dans le bundle ESM par défaut, cassant
    // `__dirname` et donc toute génération de facture en production
    // ("ReferenceError: __dirname is not defined", vu dans les logs Railway).
    // En le gardant externe, Node le charge via require() depuis node_modules
    // au runtime (présent dans l'image Railway), où __dirname est correct.
    // `rollupConfig` est bien supporté par Nitro (transmis tel quel par
    // @lovable.dev/vite-tanstack-config), mais absent du type TS exposé par ce
    // package (surface volontairement restreinte) — d'où le cast.
    rollupConfig: {
      external: ["pdfkit"],
    },
  } as { preset: string },
});
