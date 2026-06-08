import { writeFileSync, mkdirSync } from "fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const GF_URL =
  "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap";
const css = await (await fetch(GF_URL, { headers: { "User-Agent": UA } })).text();
mkdirSync("public/fonts", { recursive: true });

const blocks = css.split(/\/\* ([a-z-]+) \*\//).slice(1);
const faces = [];
for (let i = 0; i < blocks.length; i += 2) {
  const subset = blocks[i];
  const body = blocks[i + 1] || "";
  if (!["latin", "latin-ext"].includes(subset)) continue;
  const fam = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
  const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1];
  const url = (body.match(/src:\s*url\(([^)]+)\)/) || [])[1];
  const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1] || "";
  if (!fam || !weight || !url) continue;
  const slug = fam.toLowerCase().replace(/\s+/g, "-");
  const file = `${slug}-${weight}-${subset}.woff2`;
  faces.push({ fam, weight, url, range, file, subset });
}

console.log("Polices a telecharger:", faces.length);
let total = 0;
for (const f of faces) {
  const res = await fetch(f.url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`public/fonts/${f.file}`, buf);
  total += buf.length;
  console.log(`  ${f.file} (${(buf.length / 1024).toFixed(1)} Ko)`);
}

const out = faces
  .map(
    (f) => `@font-face {
  font-family: ${JSON.stringify(f.fam)};
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url("/fonts/${f.file}") format("woff2");
  unicode-range: ${f.range};
}`,
  )
  .join("\n");
writeFileSync("scripts/faces.css", out);
console.log(`Total: ${(total / 1024).toFixed(1)} Ko | @font-face -> scripts/faces.css`);
