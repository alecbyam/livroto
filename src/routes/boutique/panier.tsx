import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { BoutiqueSiteLayout } from "@/components/boutiques/BoutiqueSiteLayout";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";
import { boutiqueCreerCommande } from "@/lib/boutiques/ecommerce.functions";

export const Route = createFileRoute("/boutique/panier")({
  component: PanierPage,
});

function PanierPage() {
  const boutique = useBoutique();
  const { articles, retirer, changerQuantite, vider, sousTotal } = useBoutiqueCart();
  const creerCommandeFn = useServerFn(boutiqueCreerCommande);

  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [adresse, setAdresse] = useState("");
  const [modePaiement, setModePaiement] = useState<"mobile_money" | "paiement_livraison">("paiement_livraison");
  const [enCours, setEnCours] = useState(false);
  const [commandeConfirmee, setCommandeConfirmee] = useState<{ numero: string; total_usd: number } | null>(null);

  async function commander(e: React.FormEvent) {
    e.preventDefault();
    if (articles.length === 0) return;
    setEnCours(true);
    try {
      const { commande } = await creerCommandeFn({
        data: {
          boutique_id: boutique.id,
          client_nom: nom,
          client_telephone: telephone,
          adresse_livraison: adresse,
          mode_paiement: modePaiement,
          lignes: articles.map((a) => ({ produit_id: a.produit_id, quantite: a.quantite })),
        },
      });
      setCommandeConfirmee({ numero: commande.numero ?? "", total_usd: commande.total_usd });
      vider();
      toast.success(`Commande ${commande.numero} enregistrée !`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  if (commandeConfirmee) {
    return (
      <BoutiqueSiteLayout>
        <div className="container mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Merci pour ta commande !</h1>
          <p className="mt-2 text-muted-foreground">
            Commande <span className="font-mono font-semibold">{commandeConfirmee.numero}</span> — {commandeConfirmee.total_usd} $
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Garde ce numéro et ton numéro de téléphone pour suivre ta commande.
          </p>
        </div>
      </BoutiqueSiteLayout>
    );
  }

  return (
    <BoutiqueSiteLayout>
      <div className="container mx-auto grid gap-8 px-4 py-8 md:grid-cols-[1fr_360px]">
        <div>
          <h1 className="text-2xl font-bold">Mon panier</h1>
          {articles.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">Ton panier est vide.</p>
          ) : (
            <div className="mt-4 divide-y rounded-xl border">
              {articles.map((a) => (
                <div key={a.produit_id} className="flex items-center gap-3 p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.nom}</p>
                    <p className="text-xs text-muted-foreground">{a.prix_usd} $</p>
                  </div>
                  <Button size="icon" variant="outline" onClick={() => changerQuantite(a.produit_id, a.quantite - 1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm">{a.quantite}</span>
                  <Button size="icon" variant="outline" onClick={() => changerQuantite(a.produit_id, a.quantite + 1)}><Plus className="h-3 w-3" /></Button>
                  <span className="w-16 text-right text-sm font-medium">{(a.prix_usd * a.quantite).toFixed(2)} $</span>
                  <Button size="icon" variant="ghost" onClick={() => retirer(a.produit_id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {articles.length > 0 && (
          <form onSubmit={commander} className="h-fit space-y-3 rounded-xl border p-4">
            <h2 className="font-semibold">Livraison</h2>
            <div><Label>Nom</Label><Input value={nom} onChange={(e) => setNom(e.target.value)} required minLength={2} /></div>
            <div><Label>Téléphone</Label><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} required minLength={6} /></div>
            <div><Label>Adresse de livraison</Label><Textarea value={adresse} onChange={(e) => setAdresse(e.target.value)} required minLength={5} /></div>
            <div>
              <Label>Paiement</Label>
              <Select value={modePaiement} onValueChange={(v) => setModePaiement(v as typeof modePaiement)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paiement_livraison">Paiement à la livraison</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border-t pt-3 text-lg font-bold">
              <span>Total</span>
              <span>{sousTotal.toFixed(2)} $</span>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={enCours}>
              {enCours ? "Envoi..." : "Commander"}
            </Button>
          </form>
        )}
      </div>
    </BoutiqueSiteLayout>
  );
}
