import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Pencil, Search, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { FormulaireProduit } from "@/components/boutiques/FormulaireProduit";
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
            <div style="font-family: monospace;">${e(p.reference ?? "")}</div>
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
                    {p.reference && (
                      <div className="mt-1 text-center font-mono text-[10px] text-muted-foreground">
                        {p.reference}
                      </div>
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
                reference: produitAModifier.reference,
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
