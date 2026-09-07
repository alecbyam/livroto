import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, LegalSection, LegalPlaceholder } from "@/components/livroto/LegalPage";

export const Route = createFileRoute("/mentions-legales")({
  head: () => ({
    meta: [
      { title: "Mentions légales — JuntoxShop" },
      { name: "description", content: "Mentions légales de JuntoxShop, marketplace locale de Bunia et de l'Ituri, RDC." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: MentionsLegalesPage,
});

function MentionsLegalesPage() {
  return (
    <LegalLayout title="Mentions légales" updated="septembre 2026">
      <LegalSection title="1. Éditeur du site">
        <p>
          Le site et l'application JuntoxShop (« la Plateforme ») sont édités par <strong>JuntoX</strong>,
          société propriétaire de la marque JuntoxShop, dont l'activité s'exerce à Bunia (Ituri,
          République Démocratique du Congo).
        </p>
        <p>
          Forme juridique, numéro RCCM et Identification Nationale :{" "}
          <LegalPlaceholder>à compléter par l'éditeur</LegalPlaceholder>.
        </p>
        <p>
          Adresse du siège :{" "}
          <LegalPlaceholder>adresse complète à compléter</LegalPlaceholder> — Bunia, Ituri, RDC.
        </p>
        <p>
          Responsable de la publication :{" "}
          <LegalPlaceholder>nom du responsable à compléter</LegalPlaceholder>.
        </p>
        <p>
          Contact :{" "}
          <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a> —{" "}
          <a href="https://wa.me/243988648433" target="_blank" rel="noreferrer" className="underline">
            WhatsApp +243 98 864 8433
          </a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Hébergement">
        <p>
          Application web (JuntoxShop) : hébergée par <strong>Railway Corporation</strong>
          (railway.com), infrastructure cloud.
        </p>
        <p>
          Base de données et authentification : <strong>Supabase Inc.</strong> (supabase.com).
        </p>
        <p>
          Nom de domaine : <code className="rounded bg-muted px-1.5 py-0.5 text-sm">shop.juntoxrdc.com</code>.
        </p>
      </LegalSection>

      <LegalSection title="3. Propriété intellectuelle">
        <p>
          La marque « JuntoxShop », le logo JuntoX, la charte graphique et les contenus originaux du
          site (textes, mise en page) sont la propriété de JuntoX, sauf mention contraire. Les
          photos et descriptions de produits publiées par les vendeurs restent la propriété de ces
          derniers, qui garantissent disposer des droits nécessaires à leur publication.
        </p>
        <p>
          Toute reproduction non autorisée de ces éléments est susceptible de constituer une
          contrefaçon.
        </p>
      </LegalSection>

      <LegalSection title="4. Rôle de JuntoxShop">
        <p>
          JuntoxShop est une plateforme d'intermédiation qui met en relation des vendeurs
          indépendants, des livreurs indépendants et des clients à Bunia et dans la province de
          l'Ituri. JuntoxShop n'est pas elle-même vendeuse des produits proposés par les commerçants
          référencés, sauf lorsque cela est explicitement indiqué sur une fiche produit.
        </p>
      </LegalSection>

      <LegalSection title="5. Textes associés">
        <p>
          Les conditions d'utilisation de la Plateforme sont détaillées dans les{" "}
          <a href="/cgu" className="underline">Conditions Générales d'Utilisation</a>, les
          conditions de commande dans les{" "}
          <a href="/cgv" className="underline">Conditions Générales de Vente</a>, et le traitement
          des données personnelles dans la{" "}
          <a href="/confidentialite" className="underline">Politique de confidentialité</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
