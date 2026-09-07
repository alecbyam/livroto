import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteLayout } from "@/components/livroto/SiteLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Conditions générales — JuntoxShop" },
      { name: "description", content: "Conditions générales d'utilisation, politique de confidentialité et règles de la marketplace JuntoxShop." },
      { property: "og:title", content: "Conditions générales — JuntoxShop" },
      { property: "og:description", content: "Les règles qui encadrent l'utilisation de JuntoxShop à Bunia." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <SiteLayout>
      <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16 prose-livroto">
        <h1 className="font-display text-4xl md:text-5xl font-bold">Conditions générales</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : septembre 2026</p>
        <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Ceci est un résumé pratique. Les textes détaillés et à jour sont : les{" "}
          <Link to="/cgu" className="underline text-foreground">Conditions Générales d'Utilisation</Link>, les{" "}
          <Link to="/cgv" className="underline text-foreground">Conditions Générales de Vente</Link>, la{" "}
          <Link to="/confidentialite" className="underline text-foreground">Politique de confidentialité</Link>, la{" "}
          <Link to="/cookies" className="underline text-foreground">Politique cookies</Link> et les{" "}
          <Link to="/mentions-legales" className="underline text-foreground">Mentions légales</Link>.
        </p>

        <Section title="1. Présentation">
          JuntoxShop est une marketplace locale qui met en relation des vendeurs, des livreurs et des clients à Bunia
          (Ituri, RDC). Le service est édité par l'équipe JuntoxShop, joignable à <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a>.
        </Section>

        <Section title="2. Compte et inscription">
          L'inscription est gratuite. Tu garantis l'exactitude des informations fournies (nom, téléphone, adresse).
          Tu es responsable de la confidentialité de ton mot de passe.
        </Section>

        <Section title="3. Commandes & paiement">
          Les prix sont affichés en dollars américains (USD). Le paiement se fait <strong>en cash ou en mobile money à la livraison</strong>
          (M-Pesa, Airtel Money, Orange Money), ou en ligne via FlexPay lorsque l'option est proposée. JuntoxShop livre dans toute la ville
          de Bunia et la province de l'Ituri — le montant exact des frais de livraison t'est communiqué par le livreur juste après la
          validation de ta commande, aucun frais caché. Détails complets dans les <Link to="/cgv" className="underline">Conditions Générales de Vente</Link>.
        </Section>

        <Section title="4. Rôle de JuntoxShop">
          JuntoxShop est une plateforme d'intermédiation. La qualité des produits est de la responsabilité des vendeurs ;
          la livraison, de celle des livreurs. JuntoxShop modère et vérifie les comptes mais n'est pas partie au contrat
          de vente.
        </Section>

        <Section title="5. Annulations et remboursements">
          Tu peux annuler une commande tant qu'elle est en statut "En attente". Une fois confirmée par le vendeur,
          contacte le support via WhatsApp pour toute demande.
        </Section>

        <Section title="6. Données personnelles">
          Nous collectons les données strictement nécessaires (nom, téléphone, adresse, historique de commandes)
          pour assurer la livraison et le support. Tes données ne sont jamais vendues à des tiers.
          Pour les supprimer, écris à <a href="mailto:contact@juntoxrdc.com" className="underline">contact@juntoxrdc.com</a>.
        </Section>

        <Section title="7. Comportement attendu">
          Pas de produits illégaux, contrefaits ou dangereux. Pas de harcèlement entre utilisateurs.
          Tout manquement peut entraîner la suspension du compte.
        </Section>

        <Section title="8. Contact">
          Pour toute question, voir la page <Link to="/contact" className="underline">Contact</Link>.
        </Section>
      </article>
    </SiteLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl md:text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-muted-foreground leading-relaxed">{children}</p>
    </section>
  );
}