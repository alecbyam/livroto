import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MapPin, MessageCircle, Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { BoutiqueSiteLayout } from "@/components/boutiques/BoutiqueSiteLayout";
import { BoutiqueFlexPayDialog } from "@/components/boutiques/BoutiqueFlexPayDialog";
import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import { useBoutiqueCart } from "@/lib/boutiques/BoutiqueCartContext";
import { boutiqueCreerCommande } from "@/lib/boutiques/ecommerce.functions";
import { whatsAppCommanderPanierUrl } from "@/lib/boutiques/whatsapp-links";

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
  const [modePaiement, setModePaiement] = useState<"mobile_money" | "paiement_livraison" | "carte">("paiement_livraison");
  const [enCours, setEnCours] = useState(false);
  const [commandeConfirmee, setCommandeConfirmee] = useState<{ numero: string; total_usd: number } | null>(null);
  // Commande créée mais paiement FlexPay pas encore résolu — la confirmation
  // finale n'est affichée qu'après fermeture du dialog (succès, échec ou
  // "boutique pas configurée", ce dernier cas fermant le dialog aussitôt).
  const [flexpayEnAttente, setFlexpayEnAttente] = useState<{ id: string; numero: string; total_usd: number } | null>(null);

  // Position GPS ajoutée en texte brut dans le champ adresse existant —
  // adresse_livraison est déjà un champ libre (pas de colonnes lat/lng sur
  // commandes_ecommerce), donc aucune migration n'est nécessaire ici.
  function partagerPosition() {
    if (!navigator.geolocation) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lien = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
        setAdresse((prev) => (prev.trim() ? `${prev}\n📍 Ma position : ${lien}` : `📍 Ma position : ${lien}`));
        toast.success("Ta position a été ajoutée à l'adresse.");
      },
      () => toast.error("Impossible d'obtenir ta position — vérifie que la localisation est autorisée."),
    );
  }

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
      vider();
      toast.success(`Commande ${commande.numero} enregistrée !`);
      if (modePaiement === "mobile_money") {
        // La confirmation finale s'affiche seulement une fois le dialog
        // FlexPay résolu (cf. onDone) — sauf si la boutique n'a pas configuré
        // FlexPay, auquel cas le dialog se ferme lui-même immédiatement.
        setFlexpayEnAttente({ id: commande.id, numero: commande.numero ?? "", total_usd: commande.total_usd });
      } else {
        setCommandeConfirmee({ numero: commande.numero ?? "", total_usd: commande.total_usd });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnCours(false);
    }
  }

  if (flexpayEnAttente) {
    return (
      <BoutiqueSiteLayout>
        <div className="container mx-auto max-w-lg px-4 py-16 text-center text-muted-foreground">
          Commande <span className="font-mono font-semibold text-foreground">{flexpayEnAttente.numero}</span> enregistrée…
        </div>
        <BoutiqueFlexPayDialog
          boutiqueId={boutique.id}
          commandeId={flexpayEnAttente.id}
          phone={telephone}
          amountLabel={`${flexpayEnAttente.total_usd} $`}
          onDone={() => {
            setCommandeConfirmee({ numero: flexpayEnAttente.numero, total_usd: flexpayEnAttente.total_usd });
            setFlexpayEnAttente(null);
          }}
        />
      </BoutiqueSiteLayout>
    );
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
                    <p className="text-xs text-muted-foreground">
                      {a.prix_original_usd ? (
                        <>
                          <span className="text-destructive">{a.prix_usd} $</span>{" "}
                          <span className="line-through">{a.prix_original_usd} $</span>
                        </>
                      ) : (
                        `${a.prix_usd} $`
                      )}
                    </p>
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
            <div>
              <div className="flex items-center justify-between">
                <Label>Adresse de livraison</Label>
                <button
                  type="button"
                  onClick={partagerPosition}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" /> Partager ma position
                </button>
              </div>
              <Textarea value={adresse} onChange={(e) => setAdresse(e.target.value)} required minLength={5} className="mt-1.5" />
            </div>
            <div>
              <Label>Paiement</Label>
              <Select value={modePaiement} onValueChange={(v) => setModePaiement(v as typeof modePaiement)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paiement_livraison">Paiement à la livraison</SelectItem>
                  <SelectItem value="mobile_money">FlexPay (Mobile Money)</SelectItem>
                  <SelectItem value="carte">Carte bancaire</SelectItem>
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

            {boutique.telephone && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> ou <div className="h-px flex-1 bg-border" />
                </div>
                <Button asChild variant="outline" size="lg" className="w-full gap-2 border-green-600/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30">
                  <a
                    href={whatsAppCommanderPanierUrl({
                      telephoneBoutique: boutique.telephone,
                      boutiqueNom: boutique.nom,
                      lignes: articles.map((a) => ({ nom: a.nom, quantite: a.quantite, prixUsd: a.prix_usd })),
                      totalUsd: sousTotal,
                      nomClient: nom,
                      adresseClient: adresse,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-5 w-5" /> Commander via WhatsApp
                  </a>
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Envoie directement ta commande par message, sans passer par le formulaire.
                </p>
              </>
            )}
          </form>
        )}
      </div>
    </BoutiqueSiteLayout>
  );
}
