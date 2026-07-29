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
  boutiqueAjusterStock,
  boutiqueProduitsPourPlancheQr,
} from "@/lib/boutiques/produits.functions";
import { stockOfflineQueue, isOnline } from "@/lib/boutiques/stock-offline-queue";
import { StockOfflineBanner } from "@/components/boutiques/StockOfflineBanner";
import { echapperHtml } from "@/lib/boutiques/html-escape";

export const Route = createFileRoute("/boutique/admin/produits")({
  component: ProduitsAdminPage,
});

function ProduitsAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [ouvrirCreation, setOuvrirCreation] = useState(false);
  // Force le recalcul de l'affichage "optimiste" (stock serveur + ajustements
  // en attente localement) après chaque ajout/synchro de la file offline —
  // stockOfflineQueue lit localStorage directement, ça ne déclenche pas de
  // re-rendu React tout seul.
  const [, forcerRafraichissement] = useState(0);

  const listerFn = useServerFn(boutiqueListerProduits);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-admin-produits", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id, offset: 0 } }),
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

      {isLoading ? (
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <Table className="mt-6">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>QR</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Ajuster</TableHead>
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
                    <div className="font-medium">{p.nom}</div>
                    <div className="text-xs text-muted-foreground">
                      {[p.taille, p.couleur].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>{p.prix_usd} $</TableCell>
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FormulaireProduit({
  onSoumettre,
  enCours,
}: {
  onSoumettre: (v: {
    nom: string;
    categorie: "vetement" | "accessoire";
    taille?: string;
    couleur?: string;
    prix_usd: number;
    quantite: number;
    seuil_alerte: number;
    description?: string;
  }) => void;
  enCours: boolean;
}) {
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState<"vetement" | "accessoire">("vetement");
  const [taille, setTaille] = useState("");
  const [couleur, setCouleur] = useState("");
  const [prix, setPrix] = useState("");
  const [quantite, setQuantite] = useState("0");
  const [seuil, setSeuil] = useState("3");
  const [description, setDescription] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSoumettre({
          nom,
          categorie,
          taille: taille || undefined,
          couleur: couleur || undefined,
          prix_usd: Number(prix),
          quantite: Number(quantite),
          seuil_alerte: Number(seuil),
          description: description || undefined,
        });
      }}
    >
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
          <Select
            value={categorie}
            onValueChange={(v) => setCategorie(v as "vetement" | "accessoire")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vetement">Vêtement</SelectItem>
              <SelectItem value="accessoire">Accessoire</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="prix">Prix ($)</Label>
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
          {enCours ? "Création..." : "Créer"}
        </Button>
      </DialogFooter>
    </form>
  );
}
