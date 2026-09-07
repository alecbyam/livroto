import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, LegalSection } from "@/components/livroto/LegalPage";

export const Route = createFileRoute("/cgv")({
  head: () => ({
    meta: [
      { title: "Conditions Générales de Vente — JuntoxShop" },
      { name: "description", content: "Conditions de commande, paiement, livraison et annulation sur JuntoxShop." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: CgvPage,
});

function CgvPage() {
  return (
    <LegalLayout
      title="Conditions Générales de Vente"
      updated="septembre 2026"
      intro="Ces conditions régissent les commandes passées sur JuntoxShop entre un client et un vendeur référencé sur la plateforme."
    >
      <LegalSection title="1. Prix">
        <p>
          Les prix des produits sont affichés en dollars américains (USD), toutes taxes comprises
          lorsque applicable. Un prix barré, s'il est affiché, correspond au prix habituel avant une
          remise en cours — le prix à payer est toujours celui affiché en évidence sur la fiche
          produit et au récapitulatif du panier.
        </p>
      </LegalSection>

      <LegalSection title="2. Frais de livraison">
        <p>
          JuntoxShop livre dans toute la ville de Bunia et dans l'ensemble de la province de
          l'Ituri. Le montant exact des frais de livraison n'est pas un forfait fixe par quartier :
          il t'est communiqué par le livreur juste après la validation de ta commande, en fonction
          de la distance réelle à parcourir.
        </p>
      </LegalSection>

      <LegalSection title="3. Paiement">
        <p>
          Le paiement s'effectue au choix : en espèces à la livraison, par mobile money (M-Pesa,
          Airtel Money, Orange Money) à la livraison, ou — lorsque l'option est disponible pour ta
          commande — par paiement mobile money en ligne via notre partenaire FlexPay, avec
          confirmation immédiate.
        </p>
        <p>Aucun frais caché n'est ajouté après la validation de ta commande.</p>
      </LegalSection>

      <LegalSection title="4. Confirmation et suivi de commande">
        <p>
          Après validation, ta commande est transmise au vendeur puis à un livreur disponible. Tu
          peux suivre son statut (en attente, confirmée, prête, en livraison, livrée) depuis la page
          « Mes commandes », et reçois une confirmation par WhatsApp et/ou SMS.
        </p>
      </LegalSection>

      <LegalSection title="5. Annulation">
        <p>
          Tu peux annuler une commande gratuitement tant qu'elle est encore au statut « en attente
          de confirmation ». Une fois la commande confirmée par le vendeur, contacte directement le
          support via WhatsApp pour toute demande d'annulation — elle reste possible tant que la
          commande n'est pas encore en cours de livraison, à l'appréciation du vendeur.
        </p>
      </LegalSection>

      <LegalSection title="6. Réception et réclamations">
        <p>
          Vérifie ta commande à la réception en présence du livreur autant que possible. En cas de
          produit manquant, endommagé ou non conforme, contacte le support JuntoxShop via WhatsApp
          dans les plus brefs délais avec une photo si possible — nous ferons le lien avec le
          vendeur pour trouver une solution (remplacement, geste commercial ou remboursement selon
          le cas).
        </p>
      </LegalSection>

      <LegalSection title="7. Stock et disponibilité">
        <p>
          Les quantités affichées reflètent le stock déclaré par le vendeur au moment de la
          consultation. Dans le cas rare où un produit ne serait plus disponible entre la commande
          et sa préparation, tu en es informé rapidement et la commande est ajustée ou annulée sans
          frais.
        </p>
      </LegalSection>

      <LegalSection title="8. Avis et notation">
        <p>
          Tu peux laisser un avis uniquement sur un produit ou un vendeur pour lequel tu as une
          commande réellement livrée — cela garantit des avis authentiques sur JuntoxShop.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact et textes associés">
        <p>
          Pour toute question : <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a>.
          Voir aussi les <Link to="/cgu" className="underline">Conditions Générales d'Utilisation</Link>, la{" "}
          <Link to="/confidentialite" className="underline">Politique de confidentialité</Link> et les{" "}
          <Link to="/mentions-legales" className="underline">Mentions légales</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
