import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShoppingBag, Store, MessageCircle, Check, MapPin, Zap, Quote, TrendingUp, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { categoryMeta, CATEGORY_LIST } from "@/components/livroto/products";
import { genericWhatsAppUrl } from "@/lib/whatsapp";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type DisplayProduct } from "@/components/livroto/ProductCard";
import { PRODUCT_LIST_SELECT } from "@/lib/products";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Livroto — Bunia livre à ta porte" },
      { name: "description", content: "Première marketplace locale de Bunia, Ituri. Accessoires, cuisine et livraison — cash à la porte." },
      { property: "og:title", content: "Livroto — Bunia livre à ta porte" },
      { property: "og:description", content: "Commande. Livroto arrive." },
    ],
  }),
  component: Index,
});

const zones = [
  { name: "Centre-ville", fee: 2 },
  { name: "Sayo", fee: 3 },
  { name: "Lumumba", fee: 3 },
  { name: "Bankoko", fee: 3 },
  { name: "Mudzi Pela", fee: 5 },
  { name: "Nyakasansa", fee: 5 },
  { name: "Bigo", fee: 5 },
  { name: "Sukisa", fee: 3 },
];

function Index() {
  return (
    <SiteLayout>
      <Hero />
      <FeaturedProducts />
      <Categories />
      <HowItWorks />
      <Zones />
      <SellerForm />
      <Testimonials />
    </SiteLayout>
  );
}

/* ---------- Featured Products (depuis la DB) ---------- */
function FeaturedProducts() {
  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_LIST_SELECT)
        .eq("approved", true)
        .gt("stock", 0)
        .order("rating_count", { ascending: false })
        .limit(8);
      return (data ?? []).map((p) => ({
        ...p,
        price_usd: Number(p.price_usd),
        rating_avg: p.rating_avg ? Number(p.rating_avg) : 0,
        rating_count: p.rating_count ?? 0,
      })) as DisplayProduct[];
    },
    staleTime: 5 * 60_000, // produits tendances : pas besoin de re-fetch souvent
  });

  if (!loading && products.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-12 md:py-16">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-5 w-5 text-[color:var(--brand-dark)]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--brand-dark)]">Tendances à Bunia</span>
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold">Les plus commandés</h2>
        </div>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link to="/catalog">Tout voir <ArrowRight className="h-4 w-4 ml-1" /></Link>
        </Button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-muted animate-pulse aspect-[3/4]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </section>
  );
}

function Hero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden">
      <div className="bg-hero-gradient text-white">
        <div className="container mx-auto px-4 py-16 md:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Zap className="h-3.5 w-3.5 text-[color:var(--amber)]" />
              {t("hero.badge")}
            </span>
            <h1 className="mt-5 font-display text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05]">
              {t("hero.tagline")}
            </h1>
            <p className="mt-5 max-w-xl text-base md:text-lg text-white/85">
              {t("hero.subtitle")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-[color:var(--amber)] text-[color:var(--amber-foreground)] hover:brightness-105 min-h-[52px] px-6">
                <Link to="/catalog">
                  <ShoppingBag className="h-5 w-5" />
                  {t("cta.orderNow")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 min-h-[52px]">
                <a href="#seller">
                  <Store className="h-5 w-5" />
                  {t("cta.becomeSeller")}
                </a>
              </Button>
              <Button asChild size="lg" variant="ghost" className="text-white hover:bg-white/10 min-h-[52px]">
                <a href={genericWhatsAppUrl()} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  {t("cta.whatsapp")}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Categories() {
  const { t } = useI18n();
  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <h2 className="font-display text-3xl md:text-4xl font-bold text-center">{t("categories.title")}</h2>
      <p className="mt-2 text-center text-muted-foreground">Téléphone, cuisine, maison, beauté, bijoux, ordinateurs, électronique… tout au même endroit.</p>
      <div className="mt-10 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {CATEGORY_LIST.map((c) => (
          <Link key={c.id} to="/catalog" search={{ cat: c.id, sub: "all", q: "" } as any}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[color:var(--brand-light)] text-3xl">
              {c.emoji}
            </div>
            <h3 className="mt-4 font-display text-lg font-bold">{c.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{c.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
              Voir <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  const steps = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`how.step${n}.title`),
    desc: t(`how.step${n}.desc`),
  }));
  return (
    <section id="how" className="bg-[color:var(--brand-light)]/60 py-16 md:py-24">
      <div className="container mx-auto px-4">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-center">{t("how.title")}</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-2xl bg-card p-6 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground font-display font-bold">
                {s.n}
              </div>
              <h3 className="mt-4 font-display text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Zones() {
  const { t } = useI18n();
  const { fmt } = useCurrency();
  // Zones réelles depuis la DB → l'estimation affichée colle au panier (anti-anxiété prix).
  const { data: dbZones = [] } = useQuery({
    queryKey: ["home-zones"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("zones")
        .select("id,name,delivery_fee_usd")
        .eq("active", true)
        .order("delivery_fee_usd", { ascending: true });
      return (data ?? []).map((z) => ({ ...z, delivery_fee_usd: Number(z.delivery_fee_usd) }));
    },
  });
  const list = dbZones.length > 0 ? dbZones : zones.map((z) => ({ id: z.name, name: z.name, delivery_fee_usd: z.fee }));

  return (
    <section id="zones" className="container mx-auto px-4 py-16 md:py-24">
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl md:text-4xl font-bold">{t("zones.title")}</h2>
        <p className="mt-3 text-muted-foreground">{t("zones.subtitle")}</p>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {list.map((z) => (
          <div key={z.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary" />
              <span className="font-medium">{z.name}</span>
            </div>
            <span className="text-xs font-semibold text-[color:var(--brand-dark)]">
              {z.delivery_fee_usd > 0 ? `≈ ${fmt(z.delivery_fee_usd)}` : "à confirmer"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Estimation indicative. Le tarif final se confirme avec le livreur selon la distance, la charge et l'urgence.
      </p>
    </section>
  );
}

function SellerForm() {
  const { t } = useI18n();
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState({ name: "", phone: "", category: "", zone: "" });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const msg =
      `Bonjour Livroto ! Je veux ouvrir ma boutique.\n` +
      `Nom de la boutique : ${fields.name}\n` +
      `Téléphone : ${fields.phone}\n` +
      `Catégorie : ${fields.category}\n` +
      `Quartier : ${fields.zone}`;
    window.open(`https://wa.me/243988648433?text=${encodeURIComponent(msg)}`, "_blank");
    toast.success(t("seller.success"));
    setFields({ name: "", phone: "", category: "", zone: "" });
    setSubmitting(false);
  };

  return (
    <section id="seller" className="bg-[color:var(--brand-dark)] text-white py-16 md:py-24">
      <div className="container mx-auto px-4 grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-bold">{t("seller.title")}</h2>
          <p className="mt-3 text-white/80 max-w-md">{t("seller.subtitle")}</p>
          <ul className="mt-6 space-y-2 text-sm text-white/85">
            <li className="flex gap-2"><Check className="h-5 w-5 text-[color:var(--amber)]" /> Catalogue en ligne offert</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-[color:var(--amber)]" /> Commandes via WhatsApp</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-[color:var(--amber)]" /> Livraison gérée par Livroto</li>
            <li className="flex gap-2"><Check className="h-5 w-5 text-[color:var(--amber)]" /> Paiement cash sécurisé</li>
          </ul>
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl bg-white text-foreground p-6 shadow-xl space-y-4">
          <div>
            <Label htmlFor="s-name">{t("seller.name")}</Label>
            <Input
              id="s-name" required className="mt-1.5 min-h-[48px]"
              placeholder="Ex. Maman Sarah Foods"
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="s-phone">{t("seller.phone")}</Label>
            <Input
              id="s-phone" required type="tel" className="mt-1.5 min-h-[48px]"
              placeholder="+243 ..."
              value={fields.phone}
              onChange={(e) => setFields({ ...fields, phone: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="s-cat">{t("seller.category")}</Label>
              <Input
                id="s-cat" required className="mt-1.5 min-h-[48px]"
                placeholder="Cuisine, accessoires…"
                value={fields.category}
                onChange={(e) => setFields({ ...fields, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="s-zone">{t("seller.zone")}</Label>
              <Input
                id="s-zone" required className="mt-1.5 min-h-[48px]"
                placeholder="Sayo, Centre-ville…"
                value={fields.zone}
                onChange={(e) => setFields({ ...fields, zone: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" size="lg" disabled={submitting} className="w-full min-h-[52px]">
            <MessageCircle className="h-5 w-5" />
            {t("seller.submit")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            En cliquant, tu seras redirigé vers WhatsApp pour finaliser ta candidature.
          </p>
        </form>
      </div>
    </section>
  );
}

function Testimonials() {
  const { t } = useI18n();
  // Vrais avis clients (preuve sociale authentique — réflexe Airbnb/Amazon).
  // On masque la section tant qu'il n'y a pas de vrais avis : jamais de faux témoignages.
  const { data: items = [] } = useQuery({
    queryKey: ["home-testimonials"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: revs } = await supabase
        .from("reviews")
        .select("id,rating,comment,created_at,author_id,product_id")
        .eq("target", "product")
        .gte("rating", 4)
        .not("comment", "is", null)
        .order("created_at", { ascending: false })
        .limit(12);
      const clean = (revs ?? []).filter((r) => (r.comment ?? "").trim().length >= 8).slice(0, 3);
      if (clean.length === 0) return [];

      const authorIds = [...new Set(clean.map((r) => r.author_id))];
      const productIds = [...new Set(clean.map((r) => r.product_id).filter(Boolean) as string[])];
      const [{ data: profs }, { data: prods }] = await Promise.all([
        supabase.from("profiles").select("id,name,zone").in("id", authorIds),
        productIds.length ? supabase.from("products").select("id,name").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const nameById = new Map((profs ?? []).map((p) => [p.id, p]));
      const prodById = new Map((prods ?? []).map((p) => [p.id, p.name]));

      return clean.map((r) => {
        const prof = nameById.get(r.author_id);
        return {
          id: r.id,
          quote: (r.comment ?? "").trim(),
          rating: r.rating,
          name: prof?.name?.trim() || "Client Livroto",
          zone: prof?.zone?.trim() || (r.product_id ? prodById.get(r.product_id) ?? "Bunia" : "Bunia"),
        };
      });
    },
  });

  if (items.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-16 md:py-24">
      <h2 className="font-display text-3xl md:text-4xl font-bold text-center">{t("testimonials.title")}</h2>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {items.map((tt) => (
          <figure key={tt.id} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Quote className="h-6 w-6 text-[color:var(--amber)]" />
            <div className="mt-2 flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`h-4 w-4 ${i <= tt.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
              ))}
            </div>
            <blockquote className="mt-3 text-base">{tt.quote}</blockquote>
            <figcaption className="mt-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{tt.name}</span> · {tt.zone}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
