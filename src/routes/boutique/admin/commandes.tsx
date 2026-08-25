import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useBoutique } from "@/lib/boutiques/BoutiqueProvider";
import {
  boutiqueListerCommandesEcommerce,
  boutiqueChangerStatutCommande,
} from "@/lib/boutiques/ecommerce.functions";
import {
  boutiqueObtenirOuCreerLivraison,
  boutiqueMettreAJourLivraison,
  boutiqueListerLivreursDisponibles,
} from "@/lib/boutiques/livraisons.functions";
import { echapperHtml } from "@/lib/boutiques/html-escape";

// Le champ adresse_livraison reste du texte libre (pas de colonnes lat/lng) —
// quand un client a utilisé "Partager ma position" côté vitrine, un lien
// Google Maps est mêlé au texte. On le rend cliquable ici pour le staff sans
// changer le stockage ; le lien texte brut original reste intact ailleurs
// (bon de livraison imprimé notamment, volontairement laissé en texte simple).
function AdresseAvecLien({ adresse }: { adresse: string }) {
  const parties = adresse.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parties.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:no-underline"
          >
            Voir sur la carte
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

const MODE_PAIEMENT_LABEL: Record<string, string> = {
  mobile_money: "FlexPay",
  paiement_livraison: "Paiement à la livraison",
  carte: "Carte bancaire",
};

// statut_paiement (migration 54) : distinct du statut de traitement `statut`
// ci-dessus. Reste "non_requis" (donc invisible) pour paiement_livraison/carte
// — seul un vrai push FlexPay produit en_attente/paye/echoue.
const STATUT_PAIEMENT_BADGE: Record<string, { label: string; className: string }> = {
  en_attente: { label: "Paiement en attente", className: "border-amber-500 text-amber-700" },
  paye: { label: "Payé ✅", className: "border-green-600 text-green-700" },
  echoue: { label: "Paiement échoué", className: "border-destructive text-destructive" },
};

export const Route = createFileRoute("/boutique/admin/commandes")({
  component: CommandesAdminPage,
});

const STATUTS = ["en_attente", "confirmee", "expediee", "livree", "annulee"] as const;
const STATUT_LABEL: Record<string, string> = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée",
};

const STATUT_LIVRAISON = [
  "en_attente",
  "prise_en_charge",
  "en_transit",
  "livree",
  "echec",
  "retournee",
] as const;
const STATUT_LIVRAISON_LABEL: Record<string, string> = {
  en_attente: "En attente",
  prise_en_charge: "Prise en charge",
  en_transit: "En transit",
  livree: "Livrée",
  echec: "Échec",
  retournee: "Retournée",
};

// Pas de transporteur externe : soit JuntoX livre via le réseau de livreurs
// JuntoxShop existant (assignation d'un rider réel), soit la boutique livre
// elle-même (juste un suivi de statut manuel) — cf. livraisons.functions.ts.
function LivraisonInline({ boutiqueId, commandeId }: { boutiqueId: string; commandeId: string }) {
  const qc = useQueryClient();
  const obtenirFn = useServerFn(boutiqueObtenirOuCreerLivraison);
  const { data } = useQuery({
    queryKey: ["boutique-livraison", commandeId],
    queryFn: () => obtenirFn({ data: { boutique_id: boutiqueId, commande_id: commandeId } }),
  });
  const livreursFn = useServerFn(boutiqueListerLivreursDisponibles);
  const { data: livreursData } = useQuery({
    queryKey: ["boutique-livreurs", boutiqueId],
    queryFn: () => livreursFn({ data: { boutique_id: boutiqueId } }),
    enabled: data?.livraison?.mode_livraison === "juntox_livroto",
  });
  const majFn = useServerFn(boutiqueMettreAJourLivraison);
  const maj = useMutation({
    mutationFn: majFn,
    onSuccess: () => {
      toast.success("Livraison mise à jour.");
      qc.invalidateQueries({ queryKey: ["boutique-livraison", commandeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!data?.livraison) return null;
  const l = data.livraison;
  return (
    <div className="flex items-center gap-2">
      <Select
        value={l.mode_livraison}
        onValueChange={(v) =>
          maj.mutate({
            data: {
              boutique_id: boutiqueId,
              livraison_id: l.id,
              statut_livraison: l.statut_livraison,
              mode_livraison: v as "juntox_livroto" | "boutique",
            },
          })
        }
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="boutique">Livré par la boutique</SelectItem>
          <SelectItem value="juntox_livroto">Livré par JuntoX (JuntoxShop)</SelectItem>
        </SelectContent>
      </Select>

      {l.mode_livraison === "juntox_livroto" && (
        <Select
          value={l.rider_id ?? ""}
          onValueChange={(v) =>
            maj.mutate({
              data: {
                boutique_id: boutiqueId,
                livraison_id: l.id,
                statut_livraison: l.statut_livraison,
                rider_id: v,
              },
            })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Assigner un livreur" />
          </SelectTrigger>
          <SelectContent>
            {(livreursData?.livreurs ?? []).map((r: any) => (
              <SelectItem key={r.id} value={r.id}>
                {r.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={l.statut_livraison}
        onValueChange={(v) =>
          maj.mutate({
            data: {
              boutique_id: boutiqueId,
              livraison_id: l.id,
              statut_livraison: v as (typeof STATUT_LIVRAISON)[number],
            },
          })
        }
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUT_LIVRAISON.map((s) => (
            <SelectItem key={s} value={s}>
              Livraison : {STATUT_LIVRAISON_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CommandesAdminPage() {
  const boutique = useBoutique();
  const qc = useQueryClient();

  const listerFn = useServerFn(boutiqueListerCommandesEcommerce);
  const { data, isLoading } = useQuery({
    queryKey: ["boutique-admin-commandes", boutique.id],
    queryFn: () => listerFn({ data: { boutique_id: boutique.id, offset: 0 } }),
  });

  const changerStatutFn = useServerFn(boutiqueChangerStatutCommande);
  const changerStatut = useMutation({
    mutationFn: changerStatutFn,
    onSuccess: () => {
      toast.success("Statut mis à jour.");
      qc.invalidateQueries({ queryKey: ["boutique-admin-commandes", boutique.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function imprimerBonLivraison(commande: any) {
    const w = window.open("", "_blank");
    if (!w) return;
    // Toutes les valeurs ci-dessous (nom/téléphone/adresse client, mode de
    // paiement) viennent d'un checkout INVITÉ (aucun compte, texte libre côté
    // client) — échappées avant interpolation pour ne pas exécuter du HTML/JS
    // injecté dans la session du staff au moment de l'impression.
    const e = echapperHtml;
    w.document.write(`
      <html><head><title>Bon de livraison ${e(commande.numero)}</title>
      <style>body{font-family:sans-serif;padding:24px} table{width:100%;border-collapse:collapse} td,th{border:1px solid #ccc;padding:6px;text-align:left}</style>
      </head><body>
      <h1>Bon de livraison — ${e(boutique.nom)}</h1>
      <p><b>Commande :</b> ${e(commande.numero)}</p>
      <p><b>Client :</b> ${e(commande.clients_boutique?.nom ?? "")} — ${e(commande.clients_boutique?.telephone ?? "")}</p>
      <p><b>Adresse :</b> ${e(commande.adresse_livraison)}</p>
      <p><b>Paiement :</b> ${e(MODE_PAIEMENT_LABEL[commande.mode_paiement] ?? commande.mode_paiement)}</p>
      <table><thead><tr><th>Article</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead><tbody>
      ${(commande.lignes ?? []).map((l: any) => `<tr><td>${e(l.produits?.nom ?? "")}</td><td>${e(l.quantite)}</td><td>${e(l.prix_unitaire_usd)} $</td><td>${e(l.total_ligne_usd)} $</td></tr>`).join("")}
      </tbody></table>
      <p style="text-align:right;font-weight:bold;margin-top:12px">Total : ${e(commande.total_usd)} $</p>
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    w.document.close();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Commandes en ligne — {boutique.nom}</h1>

      {isLoading ? (
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      ) : (
        <div className="mt-6 space-y-4">
          {(data?.rows ?? []).map((c: any) => (
            <div key={c.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {c.numero} — {c.clients_boutique?.nom} ({c.clients_boutique?.telephone})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("fr-FR")} — <AdresseAvecLien adresse={c.adresse_livraison} />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {c.total_usd} $ · {MODE_PAIEMENT_LABEL[c.mode_paiement] ?? c.mode_paiement}
                  </Badge>
                  {c.statut_paiement && STATUT_PAIEMENT_BADGE[c.statut_paiement] && (
                    <Badge variant="outline" className={STATUT_PAIEMENT_BADGE[c.statut_paiement].className}>
                      {STATUT_PAIEMENT_BADGE[c.statut_paiement].label}
                    </Badge>
                  )}
                  <Select
                    value={c.statut}
                    onValueChange={(v) =>
                      changerStatut.mutate({
                        data: {
                          boutique_id: boutique.id,
                          commande_id: c.id,
                          statut: v as (typeof STATUTS)[number],
                        },
                      })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUT_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={() => imprimerBonLivraison(c)}>
                    Bon de livraison
                  </Button>
                  {(c.statut === "confirmee" ||
                    c.statut === "expediee" ||
                    c.statut === "livree") && (
                    <LivraisonInline boutiqueId={boutique.id} commandeId={c.id} />
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {(c.lignes ?? []).map((l: any, i: number) => (
                  <span key={i}>
                    {l.produits?.nom} x{l.quantite}
                    {i < c.lignes.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(data?.rows ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune commande.</p>
          )}
        </div>
      )}
    </div>
  );
}
