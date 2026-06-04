import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X, SlidersHorizontal, Star } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { type ProductCategory, CATEGORY_LIST } from "@/components/livroto/products";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";
import { supabase } from "@/integrations/supabase/client";

const CATEGORY_IDS = CATEGORY_LIST.map((c) => c.id) as [ProductCategory, ...ProductCategory[]];

const catalogSearchSchema = z.object({
  cat: fallback(z.enum(["all", ...CATEGORY_IDS]), "all").default("all"),
  sub: fallback(z.string(), "all").default("all"),
  q:   fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["new", "price_asc", "price_desc", "rating", "popular"]), "new").default("new"),
  min:  fallback(z.coerce.number().min(0), 0).default(0),
  max:  fallback(z.coerce.number().min(0), 0).default(0),
  rate: fallback(z.coerce.number().min(0).max(5), 0).default(0),
  stk:  fallback(z.coerce.boolean(), false).default(false),
});

export const Route = createFileRoute("/catalog")({
  validateSearch: zodValidator(catalogSearchSchema),
  head: () => ({
    meta: [
      { title: "Catalogue — Livroto" },
      { name: "description", content: "Parcours les produits Livroto : accessoires téléphone, cuisine locale, livraison à Bunia." },
      { property: "og:title", content: "Catalogue — Livroto" },
      { property: "og:description", content: "Tout ce qu'il te faut, livré à Bunia." },
    ],
  }),
  component: Catalog,
});

const CATS: { id: "all" | ProductCategory; label: string; emoji: string }[] = [
  { id: "all", label: "Tout", emoji: "✨" },
  ...CATEGORY_LIST.map((c) => ({ id: c.id, label: c.label, emoji: c.emoji })),
];

type Subcat = { id: string; name: string; emoji: string | null; parent_category: ProductCategory };

function Catalog() {
  const { t } = useI18n();
  const { cat, sub: subId, q: query, sort, min, max, rate, stk } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog" });
  const setCat = (next: "all" | ProductCategory) =>
    navigate({ search: (p: any) => ({ ...p, cat: next, sub: "all" }) });
  const setSubId = (next: "all" | string) =>
    navigate({ search: (p: any) => ({ ...p, sub: next }) });
  const setQuery = (next: string) =>
    navigate({ search: (p: any) => ({ ...p, q: next }), replace: true });
  const patchSearch = (patch: Record<string, any>) =>
    navigate({ search: (p: any) => ({ ...p, ...patch }), replace: true });
  const [openFilters, setOpenFilters] = useState(false);
  const [products, setProducts] = useState<(DisplayProduct & { category: ProductCategory; subcategory_id: string | null })[]>([]);
  const [subcats, setSubcats] = useState<Subcat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [{ data, error }, { data: subs }] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,description,price_usd,stock,emoji,image_url,category,subcategory_id,vendor_id,rating_avg,rating_count")
          .eq("approved", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("product_subcategories")
          .select("id,name,emoji,parent_category,sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (cancel) return;
      if (!error && data) {
        setProducts(
          data.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price_usd: Number(p.price_usd),
            stock: p.stock,
            emoji: p.emoji,
            image_url: p.image_url,
            category: p.category as ProductCategory,
            subcategory_id: p.subcategory_id,
            vendor_id: p.vendor_id,
            rating_avg: p.rating_avg ? Number(p.rating_avg) : 0,
            rating_count: p.rating_count ?? 0,
          })),
        );
      }
      if (subs) setSubcats(subs as Subcat[]);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const visibleSubcats = useMemo(
    () => (cat === "all" ? [] : subcats.filter((s) => s.parent_category === cat)),
    [cat, subcats],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      if (subId !== "all" && p.subcategory_id !== subId) return false;
      if (stk && p.stock <= 0) return false;
      if (min > 0 && p.price_usd < min) return false;
      if (max > 0 && p.price_usd > max) return false;
      if (rate > 0 && Number(p.rating_avg ?? 0) < rate) return false;
      if (q) {
        const hay = `${p.name} ${p.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list];
    switch (sort) {
      case "price_asc": sorted.sort((a, b) => a.price_usd - b.price_usd); break;
      case "price_desc": sorted.sort((a, b) => b.price_usd - a.price_usd); break;
      case "rating": sorted.sort((a, b) => Number(b.rating_avg ?? 0) - Number(a.rating_avg ?? 0)); break;
      case "popular": sorted.sort((a, b) => Number(b.rating_count ?? 0) - Number(a.rating_count ?? 0)); break;
      default: break;
    }
    return sorted;
  }, [query, cat, subId, products, sort, min, max, rate, stk]);

  const activeFiltersCount = (min > 0 ? 1 : 0) + (max > 0 ? 1 : 0) + (rate > 0 ? 1 : 0) + (stk ? 1 : 0);
  const resetFilters = () => patchSearch({ min: 0, max: 0, rate: 0, stk: false, sort: "new" });

  return (
    <SiteLayout>
      <section className="container mx-auto px-4 pt-10 md:pt-14">
        <h1 className="font-display text-3xl md:text-5xl font-bold">{t("catalog.title")}</h1>
        <p className="mt-2 text-muted-foreground">Ce que tu veux, là où tu es.</p>

        <div className="mt-6 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("catalog.search")}
              className="pl-9 pr-10 min-h-[48px]"
            />
            {query && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            {CATS.map((c) => {
              const active = cat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  <span>{c.emoji}</span> {c.label}
                </button>
              );
            })}
          </div>
          {visibleSubcats.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
              <button
                onClick={() => setSubId("all")}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  subId === "all"
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted-foreground border-border hover:border-foreground/40"
                }`}
              >
                Toutes
              </button>
              {visibleSubcats.map((s) => {
                const active = subId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSubId(s.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-card text-muted-foreground border-border hover:border-foreground/40"
                    }`}
                  >
                    {s.emoji && <span>{s.emoji}</span>} {s.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sort + filters bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpenFilters((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:border-primary/50 min-h-[40px]"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtres
              {activeFiltersCount > 0 && (
                <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {activeFiltersCount}
                </span>
              )}
            </button>
            <select
              value={sort}
              onChange={(e) => patchSearch({ sort: e.target.value })}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium min-h-[40px]"
            >
              <option value="new">Nouveautés</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
              <option value="rating">Mieux notés</option>
              <option value="popular">Plus populaires</option>
            </select>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Réinitialiser
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</span>
          </div>

          {openFilters && (
            <div className="rounded-2xl border border-border bg-card p-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">Prix (USD)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={0} placeholder="Min"
                    value={min || ""}
                    onChange={(e) => patchSearch({ min: Number(e.target.value) || 0 })}
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="number" min={0} placeholder="Max"
                    value={max || ""}
                    onChange={(e) => patchSearch({ max: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">Note minimum</label>
                <div className="flex gap-1">
                  {[0, 3, 4, 4.5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patchSearch({ rate: n })}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        rate === n ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:border-foreground/40"
                      }`}
                    >
                      {n === 0 ? "Toutes" : (<><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {n}+</>)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2">Disponibilité</label>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stk}
                    onChange={(e) => patchSearch({ stk: e.target.checked })}
                    className="h-4 w-4 rounded border-border"
                  />
                  En stock uniquement
                </label>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="container mx-auto px-4 mt-8">
        {loading ? (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            {t("catalog.empty")}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
