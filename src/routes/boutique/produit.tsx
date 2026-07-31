import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  Minus,
  Plus,
  Share2,
  MessageCircle,
  Tag,
  Truck,
  Wallet,
  ShieldCheck,
  PackageSearch,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BoutiqueSiteLayout } from "@/components/boutiques/BoutiqueSiteLayout";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";
import { getPrixEffectif } from "@/lib/boutiques/prix-promo";
import { estNouveau, stockBas } from "@/lib/boutiques/produit-affichage";
import { urlProduit, whatsAppCommanderProduitUrl } from "@/lib/boutiques/whatsapp-links";

export const Route = createFileRoute("/boutique/produit")({
  validateSearch: (search: Record<string, unknown>) => {
    const parsed: { boutique?: string; produit?: string } = {};
    if (typeof search.boutique === "string") parsed.boutique = search.boutique;
    if (typeof search.produit === "string") parsed.produit = search.produit;
    return parsed;
  },
  component: FicheProduit,
});

type ProduitDetail = {
  id: string;
  nom: string;
  description: string | null;
  prix_usd: number;
  prix_promo_usd: number | null;
  promo_actif: boolean | null;
  promo_debut: string | null;
  promo_fin: string | null;
  image_url: string | null;
  images: string[] | null;
  categorie_id: string | null;
  taille: string | null;
  couleur: string | null;
  quantite: number;
  created_at: string;
  sous_categories: { nom: string } | null;
  boutique_categories: { nom: string; icone: string | null } | null;
};

type ProduitLie = {
  id: string;
  nom: string;
  prix_usd: number;
  prix_promo_usd: number | null;
  promo_actif: boolean | null;
  promo_debut: string | null;
  promo_fin: string | null;
  image_url: string | null;
};

async function partagerProduit(url: string, texte: string) {
  if (navigator.share) {
    try {
      await navigator.share({ title: texte, url });
    } catch {
      // Annulé par l'utilisateur — pas une erreur à signaler.
    }
    return;
  }
  await navigator.clipboard.writeText(url);
  toast.success("Lien de l'article copié !");
}

function FicheProduit() {
  const { boutique: boutiqueSlug, produit: produitId } = Route.useSearch();
  const boutique = useBoutique();
  const { ajouter } = useBoutiqueCart();
  const [quantiteChoisie, setQuantiteChoisie] = useState(1);
  const [imageActive, setImageActive] = useState(0);

  const { data: produit, isLoading } = useQuery({
    queryKey: ["boutique-produit", boutique.id, produitId],
    enabled: !!produitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select(
          "id,nom,description,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,image_url,images,categorie_id,taille,couleur,quantite,created_at,sous_categories(nom),boutique_categories(nom,icone)",
        )
        .eq("id", produitId as string)
        .eq("boutique_id", boutique.id)
        .eq("actif", true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ProduitDetail | null;
    },
  });

  const { data: produitsLies } = useQuery({
    queryKey: ["boutique-produits-lies", boutique.id, produit?.categorie_id, produit?.id],
    enabled: !!produit?.categorie_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits")
        .select("id,nom,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,image_url")
        .eq("boutique_id", boutique.id)
        .eq("categorie_id", produit!.categorie_id as string)
        .eq("actif", true)
        .neq("id", produit!.id)
        .limit(6);
      if (error) throw error;
      return (data ?? []) as ProduitLie[];
    },
  });

  if (isLoading) {
    return (
      <BoutiqueSiteLayout>
        <div className="container mx-auto max-w-4xl px-4 py-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
            <div className="space-y-3">
              <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-24 w-full animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      </BoutiqueSiteLayout>
    );
  }

  if (!produit) {
    return (
      <BoutiqueSiteLayout>
        <div className="container mx-auto flex flex-col items-center gap-3 px-4 py-24 text-center">
          <PackageSearch className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Cet article n'existe pas ou n'est plus en ligne.</p>
          <Link to="/boutique" search={{ boutique: boutiqueSlug ?? boutique.slug }}>
            <Button variant="outline" size="sm">
              Retour à la boutique
            </Button>
          </Link>
        </div>
      </BoutiqueSiteLayout>
    );
  }

  const promo = getPrixEffectif(produit);
  const enRupture = produit.quantite <= 0;
  const images = produit.images && produit.images.length > 0 ? produit.images : produit.image_url ? [produit.image_url] : [];

  function ajouterAuPanier() {
    for (let i = 0; i < quantiteChoisie; i++) {
      ajouter({
        produit_id: produit!.id,
        nom: produit!.nom,
        prix_usd: promo.prix,
        prix_original_usd: promo.enPromo ? promo.prixOriginal : null,
        image_url: produit!.image_url,
      });
    }
    toast.success(`${quantiteChoisie} × ${produit!.nom} ajouté${quantiteChoisie > 1 ? "s" : ""} au panier !`);
  }

  return (
    <BoutiqueSiteLayout>
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <Link
          to="/boutique"
          search={{ boutique: boutique.slug }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Retour à la boutique
        </Link>

        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
              {images.length > 0 ? (
                <img src={images[imageActive]} alt={produit.nom} className="h-full w-full object-cover" />
              ) : produit.boutique_categories?.icone ? (
                <div className="grid h-full w-full place-items-center text-6xl">{produit.boutique_categories.icone}</div>
              ) : (
                <div className="grid h-full w-full place-items-center">
                  <Tag className="h-16 w-16 text-muted-foreground/40" />
                </div>
              )}
              {enRupture ? (
                <span className="absolute inset-x-0 top-0 bg-foreground/80 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-background">
                  Rupture de stock
                </span>
              ) : (
                <>
                  {promo.enPromo && (
                    <span className="absolute left-3 top-3 rounded-full bg-destructive px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground shadow">
                      −{promo.pourcentage}%
                    </span>
                  )}
                  {!promo.enPromo && estNouveau(produit.created_at) && (
                    <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground shadow">
                      Nouveau
                    </span>
                  )}
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {images.map((src, i) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setImageActive(i)}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                      i === imageActive ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <h1 className="font-display text-2xl font-bold">{produit.nom}</h1>
            {(produit.sous_categories?.nom || produit.taille || produit.couleur) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {[produit.sous_categories?.nom, produit.taille, produit.couleur].filter(Boolean).join(" · ")}
              </p>
            )}

            <div className="mt-3">
              {promo.enPromo ? (
                <div className="flex items-center gap-2">
                  <span className="font-display text-3xl font-bold text-destructive">{promo.prix} $</span>
                  <span className="text-lg text-muted-foreground line-through">{promo.prixOriginal} $</span>
                </div>
              ) : (
                <span className="font-display text-3xl font-bold">{promo.prix} $</span>
              )}
              {promo.enPromo && (
                <p className="mt-0.5 text-sm font-medium text-destructive">
                  Vous économisez {promo.economie.toFixed(2)} $
                </p>
              )}
            </div>

            <p
              className={`mt-2 text-sm font-medium ${
                enRupture ? "text-destructive" : stockBas(produit.quantite) ? "text-amber-600" : "text-green-700"
              }`}
            >
              {enRupture
                ? "Rupture de stock"
                : stockBas(produit.quantite)
                  ? `Plus que ${produit.quantite} en stock !`
                  : "En stock"}
            </p>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center rounded-lg border">
                <button
                  type="button"
                  onClick={() => setQuantiteChoisie((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Diminuer la quantité"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-medium">{quantiteChoisie}</span>
                <button
                  type="button"
                  onClick={() => setQuantiteChoisie((q) => Math.min(produit.quantite || 99, q + 1))}
                  className="p-2.5 text-muted-foreground hover:text-foreground"
                  aria-label="Augmenter la quantité"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <Button size="lg" className="flex-1" disabled={enRupture} onClick={ajouterAuPanier}>
                {enRupture ? "Indisponible" : "Ajouter au panier"}
              </Button>
            </div>

            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() =>
                  partagerProduit(
                    urlProduit(boutique.slug, produit.id),
                    `${produit.nom} — ${promo.prix} $ chez ${boutique.nom}`,
                  )
                }
              >
                <Share2 className="h-4 w-4" /> Partager
              </Button>
              {boutique.telephone && (
                <Button
                  asChild
                  variant="outline"
                  className="flex-1 gap-1.5 border-green-600/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
                >
                  <a
                    href={whatsAppCommanderProduitUrl({
                      telephoneBoutique: boutique.telephone,
                      boutiqueNom: boutique.nom,
                      nom: produit.nom,
                      prixUsd: promo.prix,
                      url: urlProduit(boutique.slug, produit.id),
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" /> Commander
                  </a>
                </Button>
              )}
            </div>

            {produit.description && (
              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{produit.description}</p>
            )}

            <div className="mt-6 space-y-2 rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 shrink-0" /> Livraison à Bunia et environs
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 shrink-0" /> Paiement à la livraison disponible
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0" /> Une question ? Commande directement via WhatsApp
              </div>
            </div>
          </div>
        </div>

        {produitsLies && produitsLies.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-semibold">Vous pourriez aussi aimer</h2>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {produitsLies.map((p) => {
                const promoLie = getPrixEffectif(p);
                return (
                  <Link
                    key={p.id}
                    to="/boutique/produit"
                    search={{ boutique: boutique.slug, produit: p.id }}
                    className="w-36 shrink-0 rounded-xl border bg-card p-2 transition hover:shadow-md"
                  >
                    <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
                      {p.image_url && <img src={p.image_url} alt={p.nom} className="h-full w-full object-cover" />}
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-xs font-medium">{p.nom}</p>
                    <p className="text-xs font-bold">{promoLie.prix} $</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </BoutiqueSiteLayout>
  );
}
