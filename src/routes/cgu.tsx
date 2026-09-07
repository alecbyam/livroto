import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalLayout, LegalSection } from "@/components/livroto/LegalPage";

export const Route = createFileRoute("/cgu")({
  head: () => ({
    meta: [
      { title: "Conditions Générales d'Utilisation — JuntoxShop" },
      { name: "description", content: "Règles d'utilisation de la plateforme JuntoxShop : compte, comportement attendu, rôle de la plateforme." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: CguPage,
});

function CguPage() {
  return (
    <LegalLayout
      title="Conditions Générales d'Utilisation"
      updated="septembre 2026"
      intro="Ces conditions régissent l'utilisation de la plateforme JuntoxShop (site et application) — pas les commandes elles-mêmes, dont les règles sont dans les Conditions Générales de Vente."
    >
      <LegalSection title="1. Champ d'application">
        <p>
          Les présentes CGU s'appliquent à toute personne créant un compte ou utilisant JuntoxShop,
          que ce soit en tant que client, vendeur ou livreur.
        </p>
      </LegalSection>

      <LegalSection title="2. Création de compte">
        <p>
          L'inscription est gratuite. Tu garantis l'exactitude des informations fournies (nom,
          numéro de téléphone, adresse) et t'engages à les maintenir à jour. Tu es responsable de la
          confidentialité de tes identifiants de connexion et de toute activité effectuée depuis ton
          compte.
        </p>
        <p>
          Un compte est personnel. Tu peux activer la double authentification (2FA) depuis ton
          profil pour le sécuriser davantage.
        </p>
      </LegalSection>

      <LegalSection title="3. Rôle de la plateforme">
        <p>
          JuntoxShop est une plateforme d'intermédiation qui met en relation vendeurs, livreurs et
          clients à Bunia et dans la province de l'Ituri. JuntoxShop vérifie et modère les comptes
          vendeurs et livreurs, mais n'est pas partie au contrat de vente conclu entre le vendeur et
          le client — la qualité et la conformité des produits relèvent de la responsabilité du
          vendeur, et la bonne exécution de la livraison, de celle du livreur.
        </p>
      </LegalSection>

      <LegalSection title="4. Comptes vendeurs et livreurs">
        <p>
          Toute candidature (vendeur ou livreur) est soumise à validation par l'équipe JuntoxShop.
          Un compte vendeur ou livreur peut être suspendu en cas de manquement grave ou répété à ces
          conditions (produits non conformes, non-respect des commandes, comportement abusif envers
          les clients).
        </p>
      </LegalSection>

      <LegalSection title="5. Comportement attendu">
        <p>
          Sont interdits sur JuntoxShop : la vente de produits illégaux, contrefaits ou dangereux ;
          le harcèlement ou toute forme d'abus envers un autre utilisateur ; la publication de
          fausses informations ou de faux avis ; toute tentative de contournement de la sécurité de
          la plateforme.
        </p>
        <p>Tout manquement peut entraîner un avertissement, une suspension ou une suppression définitive du compte.</p>
      </LegalSection>

      <LegalSection title="6. Propriété et contenus publiés">
        <p>
          En publiant un produit, un avis ou une photo, tu garantis détenir les droits nécessaires
          et autorises JuntoxShop à l'afficher sur la plateforme dans le cadre normal du service.
          JuntoxShop peut retirer tout contenu non conforme à ces conditions.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilité du service">
        <p>
          JuntoxShop met tout en œuvre pour assurer un service continu, sans garantir une
          disponibilité absolue (maintenance, incident technique, réseau). En cas d'interruption
          prolongée, les commandes déjà validées restent honorées dès le retour du service.
        </p>
      </LegalSection>

      <LegalSection title="8. Modification des conditions">
        <p>
          JuntoxShop peut faire évoluer ces conditions pour refléter l'évolution du service. La date
          de dernière mise à jour en haut de page permet de suivre ces changements. Une utilisation
          continue de la plateforme après modification vaut acceptation des nouvelles conditions.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact et textes associés">
        <p>
          Pour toute question : <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a>.
          Voir aussi les <Link to="/cgv" className="underline">Conditions Générales de Vente</Link>, la{" "}
          <Link to="/confidentialite" className="underline">Politique de confidentialité</Link> et les{" "}
          <Link to="/mentions-legales" className="underline">Mentions légales</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
