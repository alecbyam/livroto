import type { ReactNode } from "react";
import { SiteLayout } from "@/components/livroto/SiteLayout";

// Mise en page partagée pour les pages légales (mentions légales, CGU, CGV,
// confidentialité) — évite de dupliquer le même composant Section 4 fois.
export function LegalLayout({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SiteLayout>
      <article className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
        <h1 className="font-display text-4xl md:text-5xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p>
        {intro && <p className="mt-6 text-muted-foreground leading-relaxed">{intro}</p>}
        {children}
      </article>
    </SiteLayout>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-xl md:text-2xl font-semibold">{title}</h2>
      <div className="mt-2 text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

// Encart d'avertissement — utilisé pour signaler un champ à compléter par
// l'utilisateur (numéro RCCM, adresse exacte...) plutôt que d'inventer une
// information légale qui pourrait engager l'entreprise à tort.
export function LegalPlaceholder({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400 font-medium">
      {children}
    </span>
  );
}
