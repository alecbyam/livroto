import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Package, Pencil, Search, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueListerProduits,
  boutiqueCreerProduit,
  boutiqueModifierProduit,
  boutiqueSupprimerProduit,
  boutiqueAjusterStock,
  boutiqueProduitsPourPlancheQr,
} from "@/lib/boutiques/produits.functions";
import { stockOfflineQueue, isOnline } from "@/lib/boutiques/stock-offline-queue";
import { StockOfflineBanner } from "@/components/boutiques/StockOfflineBanner";
import { echapperHtml } from "@/lib/boutiques/html-escape";
import { GestionnairePhotosProduit } from "@/components/boutiques/GestionnairePhotosProduit";
import {
  boutiqueListerSousCategories,
  boutiqueCreerSousCategorie,
} from "@/lib/boutiques/sous-categories.functions";
import { boutiqueListerCategories, boutiqueCreerCategorie } from "@/lib/boutiques/categories.functions";
import { getPrixEffectif } from "@/lib/boutiques/prix-promo";

export const Route = createFileRoute("/boutique/admin/produits")({
  component: ProduitsAdminPage,
});

function ProduitsAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [produitAModifier, setProduitAModifier] = useState<any | null>(null);
  const [recherche, setRecherche] = useState("");
  const [produitPhotos, setProduitPhotos] = useState<{
    id: string;
    nom: string;
    images: string[];
  } | null>(null);
  // Force le recalcul de l'affichage "optimiste" (stock serveur + ajustements
  // en attente localement) après chaque ajout/synchro de la file offline —
  // stockOfflineQueue lit localStorage directement, ça ne déclenche pas de
  // re-rendu React tout seul.
  const [, forcerRafraichissement] = useState(0);

  const listerFn = useServerFn(boutiqueListerProduits);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-admin-produits", boutique.id, recherche],
    queryFn: () =>
      listerFn({ data: { boutique_id: boutique.id, offset: 0, recherche: recherche || undefined } }),
  });

  const creerFn = useServerFn(boutiqueCreerProduit);
  const creer = useMutation({
    mutationFn: creerFn,
    onSuccess: () => {
      toast.success("Produit créé, QR généré.");
      qc.invalidateQueries({ queryKey: ["boutique-admin-produits", boutique.id] });
      setOuvrirCreation(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modifierFn = useServerFn(boutiqueModifierProduit);
  const modifierPhotos = useMutation({
    mutationFn: (images: string[]) =>
      modifierFn({ data: { boutique_id: boutique.id, produit_id: produitPhotos!.id, images } }),
    onSuccess: (_r, images) => {
      setProduitPhotos((p) => (p ? { ...p, images } : p));
      qc.invalidateQueries({ queryKey: ["boutique-admin-produits", boutique.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const modifier = useMutation({
    mutationFn: modifierFn,
    onSuccess: () => {
      toast.success("Produit mis à jour.");
      qc.invalidateQueries({ queryKey: ["boutique-admin-produits", boutique.id] });
      setProduitAModifier(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supprimerFn = useServerFn(boutiqueSupprimerProduit);
  const supprimer = useMutation({
    mutationFn: supprimerFn,
    onSuccess: () => {
      toast.success("Produit supprimé.");
      qc.invalidateQueries({ queryKey: ["boutique-admin-produits", boutique.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ajusterFn = useServerFn(boutiqueAjusterStock);

  // Gestion de boutique en mode hors ligne : un ajustement de stock manuel
  // (ex. inventaire) est mis en file locale s'il n'y a pas de réseau, ou si
  // l'appel serveur échoue en cours de route — jamais perdu. L'affichage du
  // stock intègre immédiatement le delta en attente (optimiste), corrigé par
  // la vraie valeur serveur dès que la synchro aboutit.
  async function ajusterStock(produitId: string, type: "entree" | "sortie", quantiteDelta: number) {
    const payload = {
      boutique_id: boutique.id,
      produit_id: produitId,
      type,
      quantite_delta: quantiteDelta,
    };
    // Généré UNE SEULE FOIS pour cette tentative logique : si l'appel en ligne
    // échoue côté client alors qu'il a en fait abouti côté serveur (accusé de
    // réception perdu), la mise en file utilise le MÊME id — la relecture par
    // StockOfflineBanner sera donc détectée comme déjà traitée, jamais rejouée.
    const horsLigneId = crypto.randomUUID();
    if (!isOnline()) {
      stockOfflineQueue.add({ id: horsLigneId, createdAt: new Date().toISOString(), ...payload });
      forcerRafraichissement((n) => n + 1);
      toast.success("Hors ligne : ajustement enregistré localement.");
      return;
    }
    try {
      await ajusterFn({ data: { ...payload, hors_ligne_id: horsLigneId } });
      toast.success("Stock mis à jour.");
      qc.invalidateQueries({ queryKey: ["boutique-admin-produits", boutique.id] });
    } catch (err) {
      stockOfflineQueue.add({ id: horsLigneId, createdAt: new Date().toISOString(), ...payload });
      forcerRafraichissement((n) => n + 1);
      toast.error(`Échec réseau (${(err as Error).message}) — ajustement mis en attente.`);
    }
  }

  const plancheFn = useServerFn(boutiqueProduitsPourPlancheQr);
  const imprimerPlanche = async () => {
    if (selection.size === 0) {
      toast.error("Sélectionne au moins un produit.");
      return;
    }
    const { produits } = await plancheFn({
      data: { boutique_id: boutique.id, produit_ids: Array.from(selection) },
    });
    const w = window.open("", "_blank");
    if (!w) return;
    const e = echapperHtml;
    w.document.write(`
      <html><head><title>Étiquettes QR — ${e(boutique.nom)}</title>
      <style>
        body { font-family: sans-serif; }
        .grille { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .etiquette { border: 1px dashed #999; padding: 8px; text-align: center; }
        .etiquette img { width: 100%; max-width: 150px; }
        @media print { .etiquette { break-inside: avoid; } }
      </style></head><body>
      <div class="grille">
        ${produits
          .map(
            (p: any) => `
          <div class="etiquette">
            <img src="${e(p.qr_code_url ?? "")}" />
            <div>${e(p.nom)}</div>
            <div>${e(p.prix_usd)} $</div>
          </div>
        `,
          )
          .join("")}
      </div>
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Produits — {boutique.nom}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={imprimerPlanche} disabled={selection.size === 0}>
            Imprimer planche QR ({selection.size})
          </Button>
          <Dialog open={ouvrirCreation} onOpenChange={setOuvrirCreation}>
            <DialogTrigger asChild>
              <Button>Nouveau produit</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau produit</DialogTitle>
              </DialogHeader>
              <FormulaireProduit
                boutiqueId={boutique.id}
                enCours={creer.isPending}
                onSoumettre={(valeurs) =>
                  creer.mutate({ data: { boutique_id: boutique.id, ...valeurs } })
                }
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-4">
        <StockOfflineBanner
          onSynced={() =>
            qc.invalidateQueries({ queryKey: ["boutique-admin-produits", boutique.id] })
          }
        />
      </div>

      <div className="relative mt-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un produit..."
          className="pl-9"
        />
        {recherche && (
          <button
            type="button"
            onClick={() => setRecherche("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      ) : (data?.rows ?? []).length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <Package className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {recherche ? "Aucun produit ne correspond." : "Aucun produit pour le moment."}
          </p>
        </div>
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>QR</TableHead>
              <TableHead>Photos</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Ajuster</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows ?? []).map((p: any) => {
              const quantiteAffichee = p.quantite + stockOfflineQueue.deltaEnAttente(p.id);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selection.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selection);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelection(next);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {p.qr_code_url ? (
                      <img src={p.qr_code_url} alt="QR" className="h-12 w-12" />
                    ) : (
                      <span className="text-xs text-muted-foreground">génération...</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() =>
                        setProduitPhotos({ id: p.id, nom: p.nom, images: p.images ?? [] })
                      }
                      className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg border hover:border-primary/50"
                      title="Gérer les photos"
                    >
                      {p.images?.[0] ? (
                        <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {p.images?.length ?? 0}/8
                        </span>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.nom}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        p.boutique_categories ? `${p.boutique_categories.icone ?? ""} ${p.boutique_categories.nom}`.trim() : null,
                        p.sous_categories?.nom,
                        p.taille,
                        p.couleur,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getPrixEffectif(p).enPromo ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-destructive">{getPrixEffectif(p).prix} $</span>
                        <span className="text-xs text-muted-foreground line-through">{p.prix_usd} $</span>
                        <Badge variant="destructive" className="text-[10px]">
                          −{getPrixEffectif(p).pourcentage}%
                        </Badge>
                      </div>
                    ) : (
                      <div>{p.prix_usd} $</div>
                    )}
                    {p.prix_achat_usd != null && (
                      <div className="text-xs text-muted-foreground">
                        achat {p.prix_achat_usd} $ · marge{" "}
                        <span
                          className={
                            p.prix_usd - p.prix_achat_usd >= 0 ? "text-primary" : "text-destructive"
                          }
                        >
                          {(p.prix_usd - p.prix_achat_usd).toFixed(2)} $
                        </span>
                      </div>
                    )}
                    {p.prix_limite_vente_usd != null && (
                      <div className="text-[11px] text-muted-foreground">
                        plancher {p.prix_limite_vente_usd} $
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.stock_bas ? (
                      <Badge variant="destructive">{quantiteAffichee} (stock bas)</Badge>
                    ) : (
                      <Badge variant="secondary">{quantiteAffichee}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ajusterStock(p.id, "entree", 1)}
                      >
                        +1
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => ajusterStock(p.id, "sortie", 1)}
                      >
                        -1
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Modifier"
                        onClick={() => setProduitAModifier(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Supprimer"
                        onClick={() => {
                          if (confirm(`Supprimer définitivement "${p.nom}" ? Cette action est irréversible.`)) {
                            supprimer.mutate({ data: { boutique_id: boutique.id, produit_id: p.id } });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={!!produitPhotos} onOpenChange={(open) => !open && setProduitPhotos(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Photos — {produitPhotos?.nom}</DialogTitle>
          </DialogHeader>
          {produitPhotos && (
            <GestionnairePhotosProduit
              boutiqueId={boutique.id}
              dossierId={produitPhotos.id}
              images={produitPhotos.images}
              onChange={(images) => modifierPhotos.mutate(images)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!produitAModifier} onOpenChange={(open) => !open && setProduitAModifier(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier — {produitAModifier?.nom}</DialogTitle>
          </DialogHeader>
          {produitAModifier && (
            <FormulaireProduit
              boutiqueId={boutique.id}
              enCours={modifier.isPending}
              valeursInitiales={{
                id: produitAModifier.id,
                nom: produitAModifier.nom,
                categorie_id: produitAModifier.categorie_id,
                sous_categorie_id: produitAModifier.sous_categorie_id,
                taille: produitAModifier.taille,
                couleur: produitAModifier.couleur,
                prix_usd: produitAModifier.prix_usd,
                prix_achat_usd: produitAModifier.prix_achat_usd,
                prix_limite_vente_usd: produitAModifier.prix_limite_vente_usd,
                tva_applicable: produitAModifier.tva_applicable,
                prix_promo_usd: produitAModifier.prix_promo_usd,
                promo_debut: produitAModifier.promo_debut,
                promo_fin: produitAModifier.promo_fin,
                promo_actif: produitAModifier.promo_actif,
                seuil_alerte: produitAModifier.seuil_alerte,
                description: produitAModifier.description,
                images: produitAModifier.images ?? [],
              }}
              onSoumettre={(valeurs) =>
                modifier.mutate({
                  data: {
                    boutique_id: boutique.id,
                    produit_id: produitAModifier.id,
                    ...valeurs,
                  },
                })
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ValeursProduit = {
  id?: string;
  nom: string;
  categorie_id: string;
  sous_categorie_id?: string | null;
  taille?: string | null;
  couleur?: string | null;
  prix_usd: number;
  prix_achat_usd?: number | null;
  prix_limite_vente_usd?: number | null;
  tva_applicable?: boolean | null;
  prix_promo_usd?: number | null;
  promo_debut?: string | null;
  promo_fin?: string | null;
  promo_actif?: boolean | null;
  seuil_alerte?: number;
  description?: string | null;
  images?: string[];
};

// ISO <-> valeur d'<input type="datetime-local"> (heure locale) — même
// helper que côté marketplace (VendorPanel.tsx), dupliqué ici pour ne pas
// créer une dépendance croisée entre les deux modules de tarification promo.
function versLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FormulaireProduit({
  boutiqueId,
  onSoumettre,
  enCours,
  valeursInitiales,
}: {
  boutiqueId: string;
  onSoumettre: (v: {
    nom: string;
    categorie_id: string;
    sous_categorie_id?: string;
    taille?: string;
    couleur?: string;
    prix_usd: number;
    prix_achat_usd?: number;
    prix_limite_vente_usd?: number | null;
    tva_applicable?: boolean;
    prix_promo_usd?: number | null;
    promo_debut?: string | null;
    promo_fin?: string | null;
    promo_actif?: boolean;
    quantite?: number;
    seuil_alerte: number;
    description?: string;
    images?: string[];
  }) => void;
  enCours: boolean;
  valeursInitiales?: ValeursProduit;
}) {
  const modeEdition = !!valeursInitiales;
  const [nom, setNom] = useState(valeursInitiales?.nom ?? "");
  const [categorieId, setCategorieId] = useState(valeursInitiales?.categorie_id ?? "");
  const [sousCategorieId, setSousCategorieId] = useState(valeursInitiales?.sous_categorie_id ?? "");
  const [taille, setTaille] = useState(valeursInitiales?.taille ?? "");
  const [couleur, setCouleur] = useState(valeursInitiales?.couleur ?? "");
  const [prix, setPrix] = useState(valeursInitiales ? String(valeursInitiales.prix_usd) : "");
  const [prixAchat, setPrixAchat] = useState(
    valeursInitiales?.prix_achat_usd != null ? String(valeursInitiales.prix_achat_usd) : "",
  );
  const [prixLimiteVente, setPrixLimiteVente] = useState(
    valeursInitiales?.prix_limite_vente_usd != null ? String(valeursInitiales.prix_limite_vente_usd) : "",
  );
  const [tvaApplicable, setTvaApplicable] = useState(!!valeursInitiales?.tva_applicable);
  const [prixPromo, setPrixPromo] = useState(
    valeursInitiales?.prix_promo_usd != null ? String(valeursInitiales.prix_promo_usd) : "",
  );
  const [promoDebut, setPromoDebut] = useState(versLocal(valeursInitiales?.promo_debut));
  const [promoFin, setPromoFin] = useState(versLocal(valeursInitiales?.promo_fin));
  const [promoActif, setPromoActif] = useState(!!valeursInitiales?.promo_actif);
  const [quantite, setQuantite] = useState("0");
  const [seuil, setSeuil] = useState(
    valeursInitiales?.seuil_alerte != null ? String(valeursInitiales.seuil_alerte) : "3",
  );
  const [description, setDescription] = useState(valeursInitiales?.description ?? "");
  const [images, setImages] = useState<string[]>(valeursInitiales?.images ?? []);
  // Dossier de stockage stable pour toute la durée d'ouverture du formulaire.
  // En création, le produit n'existe pas encore en base (uuid temporaire) —
  // voir GestionnairePhotosProduit / migration 47. En édition, on réutilise
  // directement l'id réel du produit (déjà son dossier de stockage).
  const [dossierId] = useState(() => valeursInitiales?.id ?? crypto.randomUUID());

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!categorieId) {
          toast.error("Choisis une catégorie.");
          return;
        }
        if (promoActif) {
          if (!prixPromo || Number(prixPromo) >= Number(prix)) {
            toast.error("Le prix promo doit être renseigné et inférieur au prix de vente.");
            return;
          }
        }
        if (prixLimiteVente && prixAchat && Number(prixLimiteVente) < Number(prixAchat)) {
          toast.error("Le prix plancher doit être supérieur ou égal au prix d'achat.");
          return;
        }
        onSoumettre({
          nom,
          categorie_id: categorieId,
          sous_categorie_id: sousCategorieId || undefined,
          taille: taille || undefined,
          couleur: couleur || undefined,
          prix_usd: Number(prix),
          prix_achat_usd: prixAchat ? Number(prixAchat) : undefined,
          prix_limite_vente_usd: prixLimiteVente ? Number(prixLimiteVente) : null,
          tva_applicable: tvaApplicable,
          prix_promo_usd: prixPromo ? Number(prixPromo) : null,
          promo_debut: promoDebut ? new Date(promoDebut).toISOString() : null,
          promo_fin: promoFin ? new Date(promoFin).toISOString() : null,
          promo_actif: promoActif,
          quantite: modeEdition ? undefined : Number(quantite),
          seuil_alerte: Number(seuil),
          description: description || undefined,
          images: images.length > 0 ? images : undefined,
        });
      }}
    >
      <div>
        <Label>Photos (jusqu'à 8)</Label>
        <div className="mt-1.5">
          <GestionnairePhotosProduit
            boutiqueId={boutiqueId}
            dossierId={dossierId}
            images={images}
            onChange={setImages}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="nom">Nom</Label>
        <Input
          id="nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          minLength={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Catégorie</Label>
          <SelecteurCategorie
            boutiqueId={boutiqueId}
            value={categorieId}
            onChange={(id) => {
              setCategorieId(id);
              setSousCategorieId(""); // les sous-catégories dépendent de la catégorie
            }}
          />
        </div>
        <div>
          <Label>Sous-catégorie</Label>
          <SelecteurSousCategorie
            boutiqueId={boutiqueId}
            categorieId={categorieId}
            value={sousCategorieId}
            onChange={setSousCategorieId}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="prix">Prix de vente ($)</Label>
          <Input
            id="prix"
            type="number"
            step="0.01"
            min="0"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="prix-achat">Prix d'achat ($)</Label>
          <Input
            id="prix-achat"
            type="number"
            step="0.01"
            min="0"
            value={prixAchat}
            onChange={(e) => setPrixAchat(e.target.value)}
            placeholder="Optionnel"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="prix-limite">Prix plancher ($)</Label>
          <Input
            id="prix-limite"
            type="number"
            step="0.01"
            min="0"
            value={prixLimiteVente}
            onChange={(e) => setPrixLimiteVente(e.target.value)}
            placeholder="Optionnel — jamais de remise en dessous"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-2.5">
          <div>
            <Label htmlFor="tva-applicable">TVA applicable</Label>
            <p className="text-[11px] text-muted-foreground">Indicatif seulement, aucun calcul.</p>
          </div>
          <Switch id="tva-applicable" checked={tvaApplicable} onCheckedChange={setTvaApplicable} />
        </div>
      </div>
      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="promo-actif">Prix barré (promotion)</Label>
            <p className="text-xs text-muted-foreground">Affiche le prix promo barré sur la vitrine et l'applique à la caisse.</p>
          </div>
          <Switch id="promo-actif" checked={promoActif} onCheckedChange={setPromoActif} />
        </div>
        {promoActif && (
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="prix-promo">Prix promo ($)</Label>
              <Input
                id="prix-promo"
                type="number"
                step="0.01"
                min="0"
                value={prixPromo}
                onChange={(e) => setPrixPromo(e.target.value)}
                placeholder={`Inférieur à ${prix || "..."} $`}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="promo-debut">Début (optionnel)</Label>
                <Input id="promo-debut" type="datetime-local" value={promoDebut} onChange={(e) => setPromoDebut(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="promo-fin">Fin (optionnel)</Label>
                <Input id="promo-fin" type="datetime-local" value={promoFin} onChange={(e) => setPromoFin(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="taille">Taille</Label>
          <Input id="taille" value={taille} onChange={(e) => setTaille(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="couleur">Couleur</Label>
          <Input id="couleur" value={couleur} onChange={(e) => setCouleur(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!modeEdition && (
          <div>
            <Label htmlFor="quantite">Quantité initiale</Label>
            <Input
              id="quantite"
              type="number"
              min="0"
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
            />
          </div>
        )}
        <div>
          <Label htmlFor="seuil">Seuil d'alerte</Label>
          <Input
            id="seuil"
            type="number"
            min="0"
            value={seuil}
            onChange={(e) => setSeuil(e.target.value)}
          />
        </div>
      </div>
      {modeEdition && (
        <p className="text-xs text-muted-foreground">
          Le stock ne se modifie pas ici — utilise les boutons +1/-1 du tableau (ou l'inventaire) pour
          garder un historique fiable des mouvements.
        </p>
      )}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement..." : modeEdition ? "Enregistrer" : "Créer"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Sélecteur de sous-catégorie avec création à la volée — pas de page de
// gestion séparée, la liste se construit organiquement en créant des
// produits (KISS). Recharge la liste dès que `categorie` change côté parent.
const CREER_NOUVELLE = "__creer__";

function SelecteurSousCategorie({
  boutiqueId,
  categorieId,
  value,
  onChange,
}: {
  boutiqueId: string;
  categorieId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const qc = useQueryClient();
  const listerFn = useServerFn(boutiqueListerSousCategories);
  const creerFn = useServerFn(boutiqueCreerSousCategorie);
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");

  const { data } = useQuery({
    queryKey: ["boutique-sous-categories", boutiqueId, categorieId],
    queryFn: () => listerFn({ data: { boutique_id: boutiqueId, categorie_id: categorieId } }),
    enabled: !!categorieId,
  });
  const sousCategories = data?.sousCategories ?? [];

  const creer = useMutation({
    mutationFn: () =>
      creerFn({ data: { boutique_id: boutiqueId, categorie_id: categorieId, nom: nouveauNom.trim() } }),
    onSuccess: ({ sousCategorie }) => {
      qc.invalidateQueries({ queryKey: ["boutique-sous-categories", boutiqueId, categorieId] });
      onChange(sousCategorie.id);
      setOuvrirCreation(false);
      setNouveauNom("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!categorieId) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Choisis d'abord une catégorie" />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );
  }

  if (ouvrirCreation) {
    // Une <div>, pas un <form> : ce composant vit À L'INTÉRIEUR du <form>
    // du produit (FormulaireProduit) — un <form> imbriqué est invalide en
    // HTML et fait planter la soumission (le navigateur navigue "en dur" au
    // lieu de déclencher onSubmit React, perdant même le ?boutique=... de
    // l'URL). type="button" partout + Entrée gérée manuellement.
    const soumettre = () => {
      if (nouveauNom.trim() && !creer.isPending) creer.mutate();
    };
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              soumettre();
            }
          }}
          placeholder="Ex. Chemises"
          maxLength={60}
        />
        <Button
          type="button"
          size="sm"
          disabled={creer.isPending || !nouveauNom.trim()}
          onClick={soumettre}
        >
          Créer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvrirCreation(false)}>
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => (v === CREER_NOUVELLE ? setOuvrirCreation(true) : onChange(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Aucune (optionnel)" />
      </SelectTrigger>
      <SelectContent>
        {sousCategories.map((sc: { id: string; nom: string }) => (
          <SelectItem key={sc.id} value={sc.id}>
            {sc.nom}
          </SelectItem>
        ))}
        <SelectItem value={CREER_NOUVELLE}>+ Nouvelle sous-catégorie…</SelectItem>
      </SelectContent>
    </Select>
  );
}

// Même principe que SelecteurSousCategorie : création à la volée en plus de
// la page de gestion dédiée (/boutique/admin/categories) — un vendeur pressé
// n'a pas à quitter le formulaire produit pour créer une catégorie manquante.
function SelecteurCategorie({
  boutiqueId,
  value,
  onChange,
}: {
  boutiqueId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const qc = useQueryClient();
  const listerFn = useServerFn(boutiqueListerCategories);
  const creerFn = useServerFn(boutiqueCreerCategorie);
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");

  const { data } = useQuery({
    queryKey: ["boutique-categories", boutiqueId],
    queryFn: () => listerFn({ data: { boutique_id: boutiqueId } }),
  });
  const categories = data?.categories ?? [];

  const creer = useMutation({
    mutationFn: () => creerFn({ data: { boutique_id: boutiqueId, nom: nouveauNom.trim() } }),
    onSuccess: ({ categorie }) => {
      qc.invalidateQueries({ queryKey: ["boutique-categories", boutiqueId] });
      onChange(categorie.id);
      setOuvrirCreation(false);
      setNouveauNom("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ouvrirCreation) {
    // <div>, pas <form> : ce composant vit à l'intérieur du <form> produit —
    // voir la même remarque sur SelecteurSousCategorie plus haut.
    const soumettre = () => {
      if (nouveauNom.trim() && !creer.isPending) creer.mutate();
    };
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              soumettre();
            }
          }}
          placeholder="Ex. Chaussures"
          maxLength={60}
        />
        <Button
          type="button"
          size="sm"
          disabled={creer.isPending || !nouveauNom.trim()}
          onClick={soumettre}
        >
          Créer
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOuvrirCreation(false)}>
          Annuler
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => (v === CREER_NOUVELLE ? setOuvrirCreation(true) : onChange(v))}
    >
      <SelectTrigger>
        <SelectValue placeholder="Choisir…" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((c: { id: string; nom: string; icone: string | null }) => (
          <SelectItem key={c.id} value={c.id}>
            {c.icone ? `${c.icone} ` : ""}
            {c.nom}
          </SelectItem>
        ))}
        <SelectItem value={CREER_NOUVELLE}>+ Nouvelle catégorie…</SelectItem>
      </SelectContent>
    </Select>
  );
}
