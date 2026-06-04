import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { LIVROTO_WHATSAPP } from "@/lib/whatsapp";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Livroto Bunia" },
      { name: "description", content: "Contacte Livroto à Bunia : WhatsApp, e-mail, adresse. On répond vite, en français, swahili ou lingala." },
      { property: "og:title", content: "Contact — Livroto" },
      { property: "og:description", content: "Une question ? Un partenariat ? Écris-nous." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const wa = `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent("Bonjour Livroto, j'aimerais avoir une info.")}`;
  return (
    <SiteLayout>
      <section className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
        <h1 className="font-display text-4xl md:text-5xl font-bold">On t'écoute.</h1>
        <p className="mt-3 text-muted-foreground">Réponse rapide, 7j/7, en français, swahili ou lingala.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <a href={wa} target="_blank" rel="noreferrer" className="group rounded-2xl border border-border bg-card p-6 hover:border-primary transition-colors">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="h-5 w-5" /></div>
            <h3 className="mt-4 font-display font-semibold">WhatsApp</h3>
            <p className="mt-1 text-sm text-muted-foreground">Le plus rapide. Clique pour discuter.</p>
            <p className="mt-2 text-sm font-medium">+{LIVROTO_WHATSAPP}</p>
          </a>
          <a href="mailto:hello@livroto.cd" className="group rounded-2xl border border-border bg-card p-6 hover:border-primary transition-colors">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Mail className="h-5 w-5" /></div>
            <h3 className="mt-4 font-display font-semibold">E-mail</h3>
            <p className="mt-1 text-sm text-muted-foreground">Pour les partenariats et la presse.</p>
            <p className="mt-2 text-sm font-medium">hello@livroto.cd</p>
          </a>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Phone className="h-5 w-5" /></div>
            <h3 className="mt-4 font-display font-semibold">Téléphone</h3>
            <p className="mt-1 text-sm text-muted-foreground">Appel direct, heures de bureau.</p>
            <p className="mt-2 text-sm font-medium">+{LIVROTO_WHATSAPP}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></div>
            <h3 className="mt-4 font-display font-semibold">Adresse</h3>
            <p className="mt-1 text-sm text-muted-foreground">Notre base</p>
            <p className="mt-2 text-sm font-medium">Bunia, Ituri — RDC</p>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}