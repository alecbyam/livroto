import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Bike, Heart, MapPin, ShieldCheck, Sparkles, Store } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "À propos — Livroto, marketplace de Bunia" },
      { name: "description", content: "Livroto connecte vendeurs, livreurs et clients à Bunia (Ituri, RDC). Commande locale, livraison rapide, paiement à la porte." },
      { property: "og:title", content: "À propos — Livroto" },
      { property: "og:description", content: "La marketplace locale de Bunia : commerçants vérifiés, livreurs du quartier, paiement cash." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <SiteLayout>
      <section className="container mx-auto max-w-4xl px-4 py-12 md:py-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Notre histoire
        </span>
        <h1 className="mt-4 font-display text-4xl md:text-6xl font-bold leading-tight">
          Bunia livre à <span className="text-primary">ta porte.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
          Livroto est née à Bunia, en Ituri (RDC), pour donner aux commerçants locaux les outils du e-commerce
          moderne — sans complications. Une commande, un livreur du quartier, et tu paies à la livraison.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <Card icon={<Store className="h-5 w-5" />} title="Vendeurs locaux">
            Boutiques, marchés, restos et artisans de Bunia, vérifiés et notés.
          </Card>
          <Card icon={<Bike className="h-5 w-5" />} title="Livreurs du quartier">
            Des moto-taxis fiables qui connaissent chaque ruelle de la ville.
          </Card>
          <Card icon={<ShieldCheck className="h-5 w-5" />} title="Paiement à la porte">
            Cash à la livraison. Tu vérifies, tu paies. Simple et sûr.
          </Card>
        </div>

        <div className="mt-16 rounded-3xl border border-border bg-card p-8 md:p-10">
          <h2 className="font-display text-2xl md:text-3xl font-bold">Notre mission</h2>
          <p className="mt-4 text-muted-foreground">
            Faire de Bunia une ville où acheter local est rapide, fiable et accessible à tous —
            depuis ton téléphone, en français, swahili ou lingala. On veut que chaque vendeur de quartier
            puisse vivre dignement de son travail, et que chaque famille reçoive ce qu'elle veut, là où elle est.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Bunia, Ituri — RDC</span>
            <span className="inline-flex items-center gap-1.5"><Heart className="h-4 w-4 text-primary" /> Fait avec amour ici, chez nous</span>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link to="/catalog" className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90">
            Découvrir le catalogue
          </Link>
          <Link to="/contact" className="inline-flex h-11 items-center rounded-full border border-border bg-card px-6 text-sm font-medium hover:border-primary/50">
            Nous contacter
          </Link>
        </div>
      </section>
    </SiteLayout>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 font-display font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}