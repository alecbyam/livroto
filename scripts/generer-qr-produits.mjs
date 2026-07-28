// Backfill des images QR pour les produits qui ont un qr_code_data (posé par
// le trigger DB) mais pas encore de qr_code_url (ex: produits seedés en SQL,
// migration 38). Réutilise service_role — jamais exposé au client.
//
// Usage : node scripts/generer-qr-produits.mjs [boutique_id]
// Lit SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY depuis .env (racine du projet).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

function loadEnv() {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env");

const supabase = createClient(url, key, { auth: { persistSession: false } });
const boutiqueId = process.argv[2] ?? null;

async function main() {
  let q = supabase.from("produits").select("id,boutique_id,nom,qr_code_data").is("qr_code_url", null);
  if (boutiqueId) q = q.eq("boutique_id", boutiqueId);
  const { data: produits, error } = await q;
  if (error) throw error;

  console.log(`${produits.length} produit(s) sans QR à traiter.`);
  for (const p of produits) {
    const png = await QRCode.toBuffer(p.qr_code_data, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 400,
    });
    const path = `${p.boutique_id}/${p.id}.png`;
    const { error: upErr } = await supabase.storage
      .from("boutiques-qr")
      .upload(path, png, { contentType: "image/png", upsert: true, cacheControl: "31536000" });
    if (upErr) { console.error(`  ✗ ${p.nom}: ${upErr.message}`); continue; }

    const { data: pub } = supabase.storage.from("boutiques-qr").getPublicUrl(path);
    const { error: updErr } = await supabase.from("produits").update({ qr_code_url: pub.publicUrl }).eq("id", p.id);
    if (updErr) { console.error(`  ✗ ${p.nom}: ${updErr.message}`); continue; }
    console.log(`  ✓ ${p.nom} -> ${pub.publicUrl}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
