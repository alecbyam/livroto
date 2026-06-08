import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, ShoppingBag, MapPin, ShieldCheck, Banknote, Clock } from "lucide-react";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { LIVROTO_WHATSAPP, genericWhatsAppUrl } from "@/lib/whatsapp";

export const Route = createFileRoute("/aide")({
  head: () => ({
    meta: [
      { title: "Aide & Contact — Livroto Bunia" },
      { name: "description", content: "Comment commander sur Livroto, paiement cash à la livraison, zones de Bunia et contact WhatsApp. On répond vite !" },
    ],
  }),
  component: AidePage,
});

const STEPS = [
  { icon: ShoppingBag, title: "1. Choisis", desc: "Parcours le catalogue et ajoute ce que tu veux au panier." },
  { icon: MapPin, title: "2. Indique où", desc: "Ton nom, ton WhatsApp et un repère (marché, carrefour…). Tu peux partager ta position GPS." },
  { icon: MessageCircle, title: "3. Confirme", desc: "On valide ta commande via WhatsApp en moins de 5 minutes." },
  { icon: Banknote, title: "4. Reçois & paie", desc: "Le livreur t'apporte ta commande. Tu paies cash à la livraison." },
];

const FAQ = [
  { q: "Comment je paie ?", a: "Cash à la livraison (la méthode la plus simple et sûre). Certains vendeurs acceptent aussi M-Pesa, Airtel Money ou Orange Money — leur numéro s'affiche alors sur ta commande." },
  { q: "Combien coûte la livraison ?", a: "Le tarif de la course se discute directement avec le livreur selon la distance et la charge. Aucun frais caché : tu sais toujours combien tu paies avant de confirmer." },
  { q: "Dans quels quartiers livrez-vous ?", a: "Centre-ville, Sayo, Lumumba, Bankoko, Mudzipela, Nyakasansa, Bigo, Sukisa… et on s'étend. Si ton quartier n'est pas listé, écris-nous sur WhatsApp." },
  { q: "En combien de temps je suis livré ?", a: "Généralement le jour même. Une fois le livreur en route, tu peux le suivre en direct et voir sa distance jusqu'à toi sur la page de ta commande." },
  { q: "Et si je n'ai pas une adresse exacte ?", a: "Pas de souci à Bunia ! Indique un repère connu (un marché, une église, un carrefour) ou partage ta position GPS — le livreur t'appelle pour te trouver." },
  { q: "Puis-je annuler ma commande ?", a: "Oui, gratuitement tant qu'elle n'est pas encore confirmée par le vendeur. Va sur « Mes commandes » et clique Annuler." },
  { q: "Comment devenir vendeur ou livreur ?", a: "Inscris-toi, puis demande à devenir vendeur ou livreur depuis ton tableau de bord. Notre équipe valide ton profil rapidement." },
];

function AidePage() {
  return (
    <SiteLayout>
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Aide & Contact</h1>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">
            Tout ce qu'il faut savoir pour commander à Bunia en toute confiance. Une question ? On répond vite sur WhatsApp.
          </p>
          <Button asChild size="lg" className="mt-5 bg-[color:var(--whatsapp)] text-white hover:brightness-105">
            <a href={genericWhatsAppUrl()} target="_blank" rel="noreferrer">
              <MessageCircle className="h-5 w-5" /> Nous écrire sur WhatsApp
            </a>
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">+{LIVROTO_WHATSAPP.replace(/(\d{3})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4")}</p>
        </div>

        {/* Comment commander */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Comment commander</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border bg-card p-4">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--brand-light)] text-[color:var(--brand-dark)]">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-2 font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Confiance */}
        <section className="mt-8 rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <ShieldCheck className="h-5 w-5 text-[color:var(--brand-dark)]" /> Paiement & confiance
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { emoji: "💵", t: "Paiement cash à la livraison" },
              { emoji: "🚫", t: "Aucun frais caché" },
              { emoji: "✅", t: "Annulation gratuite avant confirmation" },
              { emoji: "🛵", t: "Livreurs locaux de confiance, Bunia" },
            ].map(({ emoji, t }) => (
              <div key={t} className="flex items-center gap-2 text-sm">
                <span>{emoji}</span><span>{t}</span>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold">
            <Clock className="h-5 w-5 text-[color:var(--brand-dark)]" /> Questions fréquentes
          </h2>
          <Accordion type="single" collapsible className="mt-3">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm font-semibold">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <div className="mt-10 rounded-2xl bg-hero-gradient p-6 text-center text-white">
          <p className="font-display text-lg font-bold">Prêt à commander ?</p>
          <p className="mt-1 text-sm text-white/80">Bunia livre à ta porte. Senda order yako !</p>
          <Button asChild className="mt-4 bg-white text-[color:var(--brand-dark)] hover:bg-white/90">
            <Link to="/catalog">Voir le catalogue</Link>
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}
