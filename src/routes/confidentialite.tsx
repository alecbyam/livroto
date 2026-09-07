import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalSection } from "@/components/livroto/LegalPage";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — JuntoxShop" },
      { name: "description", content: "Comment JuntoxShop collecte, utilise et protège tes données personnelles." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalLayout
      title="Politique de confidentialité"
      updated="septembre 2026"
      intro="Cette page explique simplement quelles données JuntoxShop collecte, pourquoi, et comment tu peux les contrôler."
    >
      <LegalSection title="1. Données que nous collectons">
        <p><strong>À l'inscription :</strong> nom, numéro de téléphone (WhatsApp), adresse e-mail.</p>
        <p>
          <strong>À la commande :</strong> nom du destinataire, numéro de téléphone, adresse de
          livraison, quartier, mode de paiement, note optionnelle pour le livreur. Si tu choisis de
          partager ta position, tes coordonnées GPS sont enregistrées pour aider le livreur à te
          localiser — ce partage est toujours volontaire et tu peux le retirer.
        </p>
        <p>
          <strong>Si tu deviens vendeur ou livreur :</strong> nom du commerce ou nom complet, numéro
          WhatsApp, zone de service, et pour les vendeurs, les produits et photos que tu publies.
        </p>
        <p>
          <strong>Automatiquement :</strong> historique de tes commandes, avis laissés, et données
          techniques minimales en cas d'erreur technique (pour nous permettre de corriger les bugs).
        </p>
      </LegalSection>

      <LegalSection title="2. Pourquoi nous les utilisons">
        <p>
          Exclusivement pour : créer et gérer ton compte, traiter et livrer tes commandes, te
          contacter au sujet d'une commande (confirmation, statut, problème), traiter les paiements
          mobile money, prévenir la fraude, et améliorer le service.
        </p>
        <p>Nous ne vendons jamais tes données à des tiers, et ne les utilisons pas à des fins publicitaires externes.</p>
      </LegalSection>

      <LegalSection title="3. Avec qui nous les partageons">
        <p>Tes données de commande (nom, téléphone, adresse) sont partagées uniquement avec :</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>le <strong>vendeur</strong> et le <strong>livreur</strong> concernés par ta commande, pour qu'ils puissent la préparer et te la livrer ;</li>
          <li>nos prestataires techniques strictement nécessaires au service : envoi de messages WhatsApp/SMS (Meta WhatsApp Cloud API, Twilio, Africa's Talking, CallMeBot), traitement des paiements mobile money (FlexPay), hébergement et base de données (Railway, Supabase).</li>
        </ul>
        <p>Ces prestataires n'accèdent qu'aux données nécessaires à leur mission et ne sont pas autorisés à les réutiliser à d'autres fins.</p>
      </LegalSection>

      <LegalSection title="4. Cookies et stockage local">
        <p>
          JuntoxShop utilise principalement le <strong>stockage local de ton navigateur</strong>
          (« localStorage »), pas des cookies de suivi publicitaire. Ce stockage sert uniquement à
          faire fonctionner le site : garder ton panier et tes favoris, mémoriser ta langue et ton
          thème (clair/sombre), et garder ta session connectée. Rien de tout cela n'est transmis à
          des régies publicitaires — JuntoxShop n'affiche aucune publicité tierce ni traceur
          marketing. Détails dans notre{" "}
          <a href="/cookies" className="underline">politique cookies</a>.
        </p>
      </LegalSection>

      <LegalSection title="5. Durée de conservation">
        <p>
          Tes données sont conservées tant que ton compte est actif. Si tu supprimes ton compte,
          tes données personnelles sont supprimées ou anonymisées, à l'exception des informations
          que nous devons conserver pour des raisons comptables ou légales (ex. historique de
          transactions), conservées le temps requis par la loi.
        </p>
      </LegalSection>

      <LegalSection title="6. Tes droits">
        <p>
          Tu peux à tout moment demander à consulter, corriger ou supprimer tes données
          personnelles, ou retirer ton consentement au partage de position GPS. Il te suffit
          d'écrire à{" "}
          <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a>{" "}
          ou de nous contacter sur{" "}
          <a href="https://wa.me/243988648433" target="_blank" rel="noreferrer" className="underline">WhatsApp</a>.
          Nous répondons sous quelques jours ouvrés.
        </p>
      </LegalSection>

      <LegalSection title="7. Sécurité">
        <p>
          Tes données transitent en connexion chiffrée (HTTPS) et sont stockées derrière des règles
          d'accès strictes : seules les personnes et fonctions qui en ont réellement besoin peuvent
          y accéder (toi, le vendeur/livreur de ta commande, et l'équipe technique pour la
          maintenance). Les mots de passe ne sont jamais stockés en clair.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Pour toute question sur cette politique, écris-nous à{" "}
          <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
