import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueListerFournisseurs, boutiqueCreerFournisseur,
  boutiqueListerBonsCommande, boutiqueCreerBonCommande, boutiqueReceptionnerLigne,
} from "@/lib/boutiques/fournisseurs.functions";

export const Route = createFileRoute("/boutique/admin/fournisseurs")({
  component: FournisseursAdminPage,
});

const STATUT_LABEL: Record<string, string> = {
  brouillon: "Brouillon", envoye: "Envoyé", recu_partiel: "Reçu partiel", recu_complet: "Reçu complet", annule: "Annulé",
};

function FournisseursAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();

  const listerFournisseursFn = useServerFn(boutiqueListerFournisseurs);
  const { data: fournisseursData } = useQuery({
    queryKey: ["boutique-fournisseurs", boutique.id],
    queryFn: () => listerFournisseursFn({ data: { boutique_id: boutique.id } }),
  });
  const fournisseurs = fournisseursData?.rows ?? [];

  const listerBcFn = useServerFn(boutiqueListerBonsCommande);
  const { data: bcData } = useQuery({
    queryKey: ["boutique-bons-commande", boutique.id],
    queryFn: () => listerBcFn({ data: { boutique_id: boutique.id, offset: 0 } }),
  });

  const creerFournisseurFn = useServerFn(boutiqueCreerFournisseur);
  const creerFournisseur = useMutation({
    mutationFn: creerFournisseurFn,
    onSuccess: () => { toast.success("Fournisseur ajouté."); qc.invalidateQueries({ queryKey: ["boutique-fournisseurs", boutique.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const creerBcFn = useServerFn(boutiqueCreerBonCommande);
  const creerBc = useMutation({
    mutationFn: creerBcFn,
    onSuccess: () => { toast.success("Bon de commande créé."); qc.invalidateQueries({ queryKey: ["boutique-bons-commande", boutique.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const receptionnerFn = useServerFn(boutiqueReceptionnerLigne);
  const receptionner = useMutation({
    mutationFn: receptionnerFn,
    onSuccess: () => { toast.success("Réception enregistrée, stock mis à jour."); qc.invalidateQueries({ queryKey: ["boutique-bons-commande", boutique.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto grid gap-8 px-4 py-8 lg:grid-cols-[300px_1fr]">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Fournisseurs</h2>
          <NouveauFournisseurDialog onCreer={(v) => creerFournisseur.mutate({ data: { boutique_id: boutique.id, ...v } })} enCours={creerFournisseur.isPending} />
        </div>
        <div className="mt-3 space-y-2">
          {fournisseurs.map((f: any) => (
            <div key={f.id} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{f.nom}</p>
              <p className="text-xs text-muted-foreground">{f.contact} {f.telephone}</p>
            </div>
          ))}
          {fournisseurs.length === 0 && <p className="text-sm text-muted-foreground">Aucun fournisseur.</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Bons de commande — {boutique.nom}</h1>
          <NouveauBonCommandeDialog
            fournisseurs={fournisseurs}
            enCours={creerBc.isPending}
            onCreer={(v) => creerBc.mutate({ data: { boutique_id: boutique.id, ...v } })}
          />
        </div>

        <div className="mt-4 space-y-4">
          {(bcData?.rows ?? []).map((bc: any) => (
            <div key={bc.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{bc.numero} — {bc.fournisseurs?.nom}</p>
                  <p className="text-xs text-muted-foreground">{new Date(bc.created_at).toLocaleDateString("fr-FR")}</p>
                </div>
                <Badge variant={bc.statut === "recu_complet" ? "secondary" : "outline"}>{STATUT_LABEL[bc.statut] ?? bc.statut}</Badge>
              </div>
              <div className="mt-3 divide-y">
                {(bc.lignes ?? []).map((l: any) => (
                  <LigneBonCommande
                    key={l.id}
                    ligne={l}
                    onReceptionner={(quantite, prixVente) =>
                      receptionner.mutate({ data: { boutique_id: boutique.id, ligne_id: l.id, quantite_recue: quantite, prix_vente_usd: prixVente } })
                    }
                    enCours={receptionner.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
          {(bcData?.rows ?? []).length === 0 && <p className="text-sm text-muted-foreground">Aucun bon de commande.</p>}
        </div>
      </div>
    </div>
  );
}

function LigneBonCommande({
  ligne, onReceptionner, enCours,
}: { ligne: any; onReceptionner: (quantite: number, prixVente?: number) => void; enCours: boolean }) {
  const [quantite, setQuantite] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const restant = ligne.quantite_commandee - ligne.quantite_recue;
  const nouveauProduit = !ligne.produit_id;

  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="flex-1">
        {ligne.nom_produit ?? "Produit existant"} — commandé {ligne.quantite_commandee}, reçu {ligne.quantite_recue}
        {restant > 0 && <span className="text-amber-600"> (reste {restant})</span>}
      </span>
      {restant > 0 && (
        <>
          <Input className="w-20" type="number" min="1" max={restant} placeholder="Qté" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
          {nouveauProduit && (
            <Input className="w-28" type="number" min="0" step="0.01" placeholder="Prix vente" value={prixVente} onChange={(e) => setPrixVente(e.target.value)} />
          )}
          <Button
            size="sm" disabled={enCours || !quantite}
            onClick={() => onReceptionner(Number(quantite), prixVente ? Number(prixVente) : undefined)}
          >
            Réceptionner
          </Button>
        </>
      )}
    </div>
  );
}

function NouveauFournisseurDialog({ onCreer, enCours }: { onCreer: (v: any) => void; enCours: boolean }) {
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState("");
  const [contact, setContact] = useState("");
  const [telephone, setTelephone] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">+ Fournisseur</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau fournisseur</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onCreer({ nom, contact: contact || undefined, telephone: telephone || undefined }); setOpen(false); }} className="space-y-3">
          <div><Label>Nom</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} required minLength={2} /></div>
          <div><Label>Contact</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
          <div><Label>Téléphone</Label><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={enCours}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NouveauBonCommandeDialog({
  fournisseurs, onCreer, enCours,
}: { fournisseurs: any[]; onCreer: (v: any) => void; enCours: boolean }) {
  const [open, setOpen] = useState(false);
  const [fournisseurId, setFournisseurId] = useState("");
  const [lignes, setLignes] = useState([{ nom_produit: "", quantite_commandee: "", prix_achat_unitaire_usd: "" }]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={fournisseurs.length === 0}>Nouveau bon de commande</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouveau bon de commande</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreer({
              fournisseur_id: fournisseurId,
              lignes: lignes
                .filter((l) => l.nom_produit && l.quantite_commandee)
                .map((l) => ({
                  nom_produit: l.nom_produit,
                  quantite_commandee: Number(l.quantite_commandee),
                  prix_achat_unitaire_usd: Number(l.prix_achat_unitaire_usd || 0),
                })),
            });
            setOpen(false);
            setLignes([{ nom_produit: "", quantite_commandee: "", prix_achat_unitaire_usd: "" }]);
          }}
          className="space-y-3"
        >
          <div>
            <Label>Fournisseur</Label>
            <Select value={fournisseurId} onValueChange={setFournisseurId}>
              <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
              <SelectContent>
                {fournisseurs.map((f) => <SelectItem key={f.id} value={f.id}>{f.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Lignes (nouveaux articles à commander)</Label>
            {lignes.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Nom du produit" value={l.nom_produit}
                  onChange={(e) => setLignes((prev) => prev.map((x, j) => j === i ? { ...x, nom_produit: e.target.value } : x))}
                />
                <Input
                  className="w-20" type="number" placeholder="Qté" value={l.quantite_commandee}
                  onChange={(e) => setLignes((prev) => prev.map((x, j) => j === i ? { ...x, quantite_commandee: e.target.value } : x))}
                />
                <Input
                  className="w-28" type="number" step="0.01" placeholder="Prix achat" value={l.prix_achat_unitaire_usd}
                  onChange={(e) => setLignes((prev) => prev.map((x, j) => j === i ? { ...x, prix_achat_unitaire_usd: e.target.value } : x))}
                />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLignes((prev) => [...prev, { nom_produit: "", quantite_commandee: "", prix_achat_unitaire_usd: "" }])}>
              + Ligne
            </Button>
          </div>
          <DialogFooter><Button type="submit" disabled={enCours || !fournisseurId}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
