import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Search, Loader2, X, SlidersHorizontal, Star } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useCategories } from "@/components/livroto/products";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";
import { PRODUCT_CATALOG_SELECT } from "@/lib/products";
import { supabase } from "@/integrations/supabase/client";

// Taille de page du catalogue paginé côté serveur (voir CatalogProducts ci-dessous).
// Divise proprement les 3 largeurs de grille (2/3/4 colonnes selon l'écran).
const PAGE_SIZE = 24;

const catalogSearchSchema = z.object({
  cat: fallback(z.string(), "all").default("all"),
  sub: fallback(z.string(), "all").default("all"),
  zone: fallback(z.string(), "all").default("all"),
  q:   fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["new", "price_asc", "price_desc", "rating", "popular"]), "new").default("new"),
  min:  fallback(z.coerce.number().min(0), 0).default(0),
  max:  fallback(z.coerce.number().min(0), 0).default(0),
  rate: fallback(z.coerce.number().min(0).max(5), 0).default(0),
  stk:  fallback(z.coerce.boolean(), false).default(false),
  promo: fallback(z.coerce.boolean(), false).default(false),
});

export const Route = createFileRoute("/catalog")({
  validateSearch: zodValidator(catalogSearchSchema),
  head: () => ({
    meta: [
      { title: "Catalogue — Livroto" },
      { name: "description", content: "Parcours les produits Livroto : accessoires téléphone, cuisine locale, livraison à Bunia et dans toute la province de l'Ituri." },
      { property: "og:title", content: "Catalogue — Livroto" },
      { property: "og:description", content: "Tout ce qu'il te faut, livré à Bunia et dans toute l'Ituri." },
    ],
  }),
  component: Catalog,
});

type Subcat = { id: string; name: string; emoji: string | null; category_id: string };
type CatProduct = DisplayProduct & { subcategory_id: string };
type VendorMeta = Map<string, { shopName: string; zoneIds: Set<string> }>;

// Références vides stables -> évitent de recalculer les useMemo à chaque rendu.
const EMPTY_PRODUCTS: CatProduct[] = [];
const EMPTY_SUBCATS: Subcat[] = [];
const EMPTY_ZONES: { id: string; name: string }[] = [];
const EMPTY_META: VendorMeta = new Map();

function Catalog() {
  const { t } = useI18n();
  const { cat, sub: subId, zone, q: query, sort, min, max, rate, stk, promo } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog" });
  const { data: categories } = useCategories();
  const setCat = (next: string) =>
    navigate({ search: (p: any) => ({ ...p, cat: next, sub: "all" }) });
  const setSubId = (next: "all" | string) =>
    navigate({ search: (p: any) => ({ ...p, sub: next }) });
  const setQuery = (next: string) =>
    navigate({ search: (p: any) => ({ ...p, q: next }), replace: true });
  const patchSearch = (patch: Record<string, any>) =>
    navigate({ search: (p: any) => ({ ...p, ...patch }), replace: true });
  const [openFilters, setOpenFilters] = useState(false);

  // Recherche locale + debounce (évite de re-router à chaque frappe sur connexion lente)
  const [searchInput, setSearchInput] = useState(query);
  useEffect(() => { setSearchInput(query); }, [query]);
  useEffect(() => {
    if (searchInput === query) return;
    const id = setTimeout(() => setQuery(searchInput), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Facettes du catalogue (sous-catégories, quartiers, métadonnées vendeur) — petites tables,
  // bornées par le nombre de vendeurs/zones (PAS par le nombre de produits), donc chargées en
  // une fois comme avant. Sert à peupler les filtres ET à résoudre catégorie->sous-catégories /
  // quartier->vendeurs pour la requête produits paginée ci-dessous (CatalogProducts).
  // Avant le 6/08/2026 : cette même requête chargeait TOUS les produits approuvés d'un coup,
  // sans .limit() ni recherche/tri côté serveur — coûteux en bande passante 2G dès quelques
  // centaines de produits. La liste de produits elle-même est maintenant dans CatalogProducts.
  const { data: facets } = useQuery({
    queryKey: ["catalog-facets"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: subs }, { data: zoneRows }, { data: vendorRows }, { data: vzRows }] = await Promise.all([
        supabase
          .from("product_subcategories")
          .select("id,name,emoji,category_id,sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("zones")
          .select("id,name")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("vendors")
          .select("id,owner_id,shop_name,base_zone_id")
          .eq("status", "approved"),
        supabase
          .from("vendor_zones")
          .select("vendor_id,zone_id"),
      ]);

      // Quartiers desservis par chaque boutique : base_zone_id + vendor_zones,
      // indexés par owner_id car products.vendor_id = owner_id du vendeur.
      const zonesByVendorRowId = new Map<string, Set<string>>();
      (vzRows ?? []).forEach((vz: any) => {
        const set = zonesByVendorRowId.get(vz.vendor_id) ?? new Set<string>();
        set.add(vz.zone_id);
        zonesByVendorRowId.set(vz.vendor_id, set);
      });
      const meta: VendorMeta = new Map();
      (vendorRows ?? []).forEach((v: any) => {
        const zoneIds = new Set<string>(zonesByVendorRowId.get(v.id) ?? []);
        if (v.base_zone_id) zoneIds.add(v.base_zone_id);
        meta.set(v.owner_id, { shopName: v.shop_name ?? "", zoneIds });
      });

      return {
        subcats: (subs ?? []) as Subcat[],
        zones: (zoneRows ?? []) as { id: string; name: string }[],
        vendorMeta: meta,
      };
    },
  });

  const subcats = facets?.subcats ?? EMPTY_SUBCATS;
  const zones = facets?.zones ?? EMPTY_ZONES;
  const vendorMeta = facets?.vendorMeta ?? EMPTY_META;

  const catPills = useMemo(
    () => [{ slug: "all", name: "Tout", icon: "✨" }, ...(categories ?? [])],
    [categories],
  );

  const selectedCategoryId = useMemo(
    () => (cat === "all" ? null : (categories ?? []).find((c) => c.slug === cat)?.id ?? null),
    [cat, categories],
  );

  const visibleSubcats = useMemo(
    () => (selectedCategoryId ? subcats.filter((s) => s.category_id === selectedCategoryId) : []),
    [selectedCategoryId, subcats],
  );

  // Sous-catégories de la catégorie sélectionnée -> permet de filtrer les
  // produits par catégorie sans dupliquer category_id sur `products`
  // (la catégorie d'un produit se déduit toujours de sa sous-catégorie).
  const subcatIdsInCategory = useMemo(
    () => new Set(visibleSubcats.map((s) => s.id)),
    [visibleSubcats],
  );

  // Quartier -> ids vendeurs qui y livrent (owner_id, car products.vendor_id = owner_id).
  // Résolu depuis les facettes (petite table), utilisé pour filtrer la requête produits
  // paginée ci-dessous sans avoir à charger tous les produits pour les filtrer en JS.
  const vendorIdsInZone = useMemo(() => {
    if (zone === "all") return null;
    const ids: string[] = [];
    vendorMeta.forEach((m, vendorId) => { if (m.zoneIds.has(zone)) ids.push(vendorId); });
    return ids;
  }, [zone, vendorMeta]);

  const searchKey = query.trim().toLowerCase();

  const productsQuery = useInfiniteQuery({
    queryKey: [
      "catalog-products",
      { subIds: subId !== "all" ? [subId] : Array.from(subcatIdsInCategory).sort(),
        zoneVendors: vendorIdsInZone ? [...vendorIdsInZone].sort() : null,
        q: searchKey, sort, min, max, rate, stk, promo },
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      // Zone sélectionnée mais aucun vendeur ne la dessert -> aucun résultat, inutile
      // d'interroger products (et .in("vendor_id", []) renverrait tout, pas rien, en PostgREST).
      if (vendorIdsInZone && vendorIdsInZone.length === 0) return { rows: [] as CatProduct[], total: 0 };

      let q = supabase
        .from("products")
        .select(PRODUCT_CATALOG_SELECT, { count: "exact" })
        .eq("approved", true);

      if (subId !== "all") q = q.eq("subcategory_id", subId);
      else if (selectedCategoryId) q = q.in("subcategory_id", Array.from(subcatIdsInCategory));
      if (vendorIdsInZone) q = q.in("vendor_id", vendorIdsInZone);
      if (stk) q = q.gt("stock", 0);
      if (min > 0) q = q.gte("price_usd", min);
      if (max > 0) q = q.lte("price_usd", max);
      if (rate > 0) q = q.gte("rating_avg", rate);
      if (promo) {
        // Reproduit getPromo().active (src/lib/promo.ts), sauf la garde
        // promo_price_usd < price_usd (comparaison colonne-à-colonne, pas exprimable en
        // filtre PostgREST simple) — en pratique l'admin bloque déjà ce cas à la validation
        // de la promo, donc cette garde ne change quasiment jamais le résultat réel.
        const nowIso = new Date().toISOString();
        q = q
          .eq("promo_active", true)
          .eq("promo_approved", true)
          .not("promo_price_usd", "is", null)
          .gt("promo_price_usd", 0)
          .or(`promo_starts_at.is.null,promo_starts_at.lte.${nowIso}`)
          .or(`promo_ends_at.is.null,promo_ends_at.gte.${nowIso}`);
      }
      if (searchKey) {
        // Valeur entre guillemets doubles (échappement PostgREST) : une virgule ou parenthèse
        // dans le terme cherché casserait sinon la syntaxe de la liste .or().
        const safe = searchKey.replace(/"/g, '\\"');
        q = q.or(`name.ilike."%${safe}%",description.ilike."%${safe}%"`);
        // Note : ne cherche plus dans le nom de la boutique (contrairement à avant le
        // 6/08/2026) — croiser ça proprement avec pagination serveur demanderait une requête
        // supplémentaire à chaque frappe ; accepté comme perte mineure, la recherche par nom
        // de produit reste le cas d'usage très majoritaire.
      }

      switch (sort) {
        case "price_asc": q = q.order("price_usd", { ascending: true }); break;
        case "price_desc": q = q.order("price_usd", { ascending: false }); break;
        case "rating": q = q.order("rating_avg", { ascending: false }); break;
        case "popular": q = q.order("rating_count", { ascending: false }); break;
        default: q = q.order("created_at", { ascending: false }); break;
      }

      const { data, error, count } = await q.range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      const rows: CatProduct[] = (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price_usd: Number(p.price_usd),
        stock: p.stock,
        emoji: p.emoji,
        image_url: p.image_url,
        subcategory_id: p.subcategory_id,
        vendor_id: p.vendor_id,
        rating_avg: p.rating_avg ? Number(p.rating_avg) : 0,
        rating_count: p.rating_count ?? 0,
        promo_price_usd: p.promo_price_usd != null ? Number(p.promo_price_usd) : null,
        promo_active: p.promo_active ?? null,
        promo_approved: p.promo_approved ?? null,
        promo_starts_at: p.promo_starts_at ?? null,
        promo_ends_at: p.promo_ends_at ?? null,
      }));
      return { rows, total: count ?? 0 };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const filtered = useMemo(
    () => productsQuery.data ? productsQuery.data.pages.flatMap((p) => p.rows) : EMPTY_PRODUCTS,
    [productsQuery.data],
  );
  const total = productsQuery.data?.pages[0]?.total ?? 0;
  const loading = productsQuery.isLoading;

  const activeFiltersCount = (min > 0 ? 1 : 0) + (max > 0 ? 1 : 0) + (rate > 0 ? 1 : 0) + (stk ? 1 : 0) + (zone !== "all" ? 1 : 0) + (promo ? 1 : 0);
  const resetFilters = () => patchSearch({ min: 0, max: 0, rate: 0, stk: false, sort: "new", zone: "all", promo: false });
  const zoneName = zone === "all" ? null : (zones.find((z) => z.id === zone)?.name ?? null);

  return (
    <SiteLayout>
      <section className="container mx-auto px-4 pt-10 md:pt-14">
        <h1 className="font-display text-3xl md:text-5xl font-bold">{t("catalog.title")}</h1>
        <p className="mt-2 text-muted-foreground">Ce que tu veux, là où tu es.</p>

        <div className="mt-6 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("catalog.search")}
              className="pl-9 pr-10 min-h-[48px]"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
            {catPills.map((c) => {
              const active = cat === c.slug;
              return (
                <button
                  key={c.slug}
                  onClick={() => setCat(c.slug)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  <span>{c.icon}</span> {c.name}
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
            <button
              type="button"
              onClick={() => patchSearch({ promo: !promo })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium min-h-[40px] transition-colors ${
                promo ? "border-red-500 bg-red-500/10 text-red-600" : "border-border bg-card hover:border-red-400/50"
              }`}
              aria-pressed={promo}
            >
              🔖 En promo
            </button>
            {zones.length > 0 && (
              <select
                value={zone}
                onChange={(e) => patchSearch({ zone: e.target.value })}
                className={`rounded-full border px-4 py-2 text-sm font-medium min-h-[40px] ${
                  zone !== "all" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
                }`}
                aria-label="Filtrer par quartier"
              >
                <option value="all">📍 Tous les quartiers</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            )}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> Réinitialiser
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{total} résultat{total > 1 ? "s" : ""}</span>
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
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="skeleton aspect-square" />
                <div className="space-y-2 p-3">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-4 w-1/2 rounded" />
                  <div className="skeleton mt-2 h-9 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            {zoneName ? (
              <div className="space-y-2">
                <p>Aucun produit livré à <b className="text-foreground">{zoneName}</b> pour ces critères.</p>
                <button
                  type="button"
                  onClick={() => patchSearch({ zone: "all" })}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/50"
                >
                  <X className="h-3.5 w-3.5" /> Voir tous les quartiers
                </button>
              </div>
            ) : (
              t("catalog.empty")
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p, i) => (
                <div key={p.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                  <ProductCard product={p} verified={!!(p.vendor_id && vendorMeta.has(p.vendor_id))} />
                </div>
              ))}
            </div>
            {productsQuery.hasNextPage && (
              <div className="mt-8 text-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => productsQuery.fetchNextPage()}
                  disabled={productsQuery.isFetchingNextPage}
                >
                  {productsQuery.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Voir plus de produits"}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </SiteLayout>
  );
}
