import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STATIC_PATHS: Array<{ path: string; priority: string; changefreq: string }> = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/catalog", priority: "0.9", changefreq: "daily" },
  { path: "/boutiques", priority: "0.8", changefreq: "daily" },
  { path: "/aide", priority: "0.6", changefreq: "monthly" },
  { path: "/about", priority: "0.6", changefreq: "monthly" },
  { path: "/contact", priority: "0.6", changefreq: "monthly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
];

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const today = new Date().toISOString().slice(0, 10);

        const [vendorsRes, productsRes] = await Promise.all([
          supabaseAdmin
            .from("vendors")
            .select("slug,updated_at")
            .eq("status", "approved")
            .limit(5000),
          supabaseAdmin
            .from("products")
            .select("id,updated_at")
            .eq("approved", true)
            .limit(5000),
        ]);

        const urls: string[] = [];

        for (const s of STATIC_PATHS) {
          urls.push(
            `<url><loc>${origin}${s.path}</loc><lastmod>${today}</lastmod><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>`,
          );
        }

        for (const v of vendorsRes.data ?? []) {
          const lastmod = (v.updated_at ?? today).toString().slice(0, 10);
          urls.push(
            `<url><loc>${origin}/vendor/${xmlEscape(v.slug)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`,
          );
        }

        for (const p of productsRes.data ?? []) {
          const lastmod = (p.updated_at ?? today).toString().slice(0, 10);
          urls.push(
            `<url><loc>${origin}/product/${p.id}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
          );
        }

        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=1800",
          },
        });
      },
    },
  },
});