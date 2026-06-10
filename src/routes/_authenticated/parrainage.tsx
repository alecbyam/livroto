import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Gift, Copy, Check, MessageCircle, Users, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { useI18n, type Lang } from "@/lib/i18n";
import { getMyReferral } from "@/lib/referrals.functions";

export const Route = createFileRoute("/_authenticated/parrainage")({
  component: ReferralPage,
});

const INVITE: Record<Lang, (link: string) => string> = {
  fr: (link) =>
    `🎁 Rejoins-moi sur *Livroto* (livraison à Bunia, paiement cash) !\nInscris-toi avec mon lien et on gagne chacun 1$ de crédit 👇\n${link}`,
  sw: (link) =>
    `🎁 Jiunge nami kwenye *Livroto* (usafirishaji Bunia, lipa cash)!\nJisajili na kiungo changu na kila mmoja apate $1 ya krediti 👇\n${link}`,
  ln: (link) =>
    `🎁 Yaka epai na ngai na *Livroto* (livraison na Bunia, futa cash)!\nKomisala na lien na ngai mpe moko na moko azwa $1 ya crédit 👇\n${link}`,
};

function ReferralPage() {
  const { lang } = useI18n();
  const fetchReferral = useServerFn(getMyReferral);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => fetchReferral(),
    staleTime: 60_000,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "https://livroto.vercel.app";
  const link = data?.code ? `${origin}/auth?ref=${data.code}` : "";

  const invite = () => {
    if (!link) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(INVITE[lang](link))}`, "_blank", "noopener,noreferrer");
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      toast.success("Copié !");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible");
    }
  };

  return (
    <SiteLayout>
      <div className="container mx-auto max-w-xl px-4 py-8">
        <Link to="/dashboard" search={{ tab: "home" } as any} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tableau de bord
        </Link>

        <div className="mt-3 flex items-center gap-2">
          <Gift className="h-7 w-7 text-[color:var(--brand-dark)]" />
          <h1 className="font-display text-3xl font-bold">Invite & gagne</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite tes amis sur Livroto. À leur 1ʳᵉ commande livrée, <b className="text-foreground">vous gagnez chacun 1&nbsp;$</b> de crédit utilisable sur tes achats.
        </p>

        {isLoading ? (
          <div className="mt-8 grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !data ? (
          <p className="mt-8 text-muted-foreground">Impossible de charger ton parrainage. Réessaie.</p>
        ) : (
          <>
            {/* Solde + stats */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border bg-card p-4 text-center">
                <Wallet className="mx-auto h-5 w-5 text-emerald-600" />
                <p className="mt-1 font-display text-2xl font-bold text-emerald-600">${data.credit_usd.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">Crédit</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 text-center">
                <Users className="mx-auto h-5 w-5 text-[color:var(--brand-dark)]" />
                <p className="mt-1 font-display text-2xl font-bold">{data.invited}</p>
                <p className="text-[11px] text-muted-foreground">Invités</p>
              </div>
              <div className="rounded-2xl border bg-card p-4 text-center">
                <Check className="mx-auto h-5 w-5 text-[color:var(--brand-dark)]" />
                <p className="mt-1 font-display text-2xl font-bold">{data.qualified}</p>
                <p className="text-[11px] text-muted-foreground">Validés</p>
              </div>
            </div>

            {/* Code */}
            <div className="mt-4 rounded-2xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ton code de parrainage</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 rounded-xl bg-[color:var(--brand-light)] px-3 py-2.5 font-display text-xl font-bold tracking-widest text-[color:var(--brand-dark)]">
                  {data.code}
                </code>
                <Button type="button" variant="outline" size="lg" onClick={() => copy(data.code)} aria-label="Copier le code">
                  {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
                </Button>
              </div>
            </div>

            {/* Invitation WhatsApp */}
            <Button
              onClick={invite}
              size="lg"
              className="mt-4 w-full min-h-[52px] bg-[color:var(--whatsapp)] hover:brightness-105 text-base font-bold"
            >
              <MessageCircle className="h-5 w-5" /> Inviter sur WhatsApp
            </Button>
            <button
              type="button"
              onClick={() => copy(link)}
              className="mt-2 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            >
              ou copier mon lien d'invitation
            </button>

            {/* Comment ça marche */}
            <div className="mt-8 rounded-2xl border bg-card p-5">
              <h2 className="font-display text-lg font-bold">Comment ça marche</h2>
              <ol className="mt-3 space-y-3">
                {[
                  "Partage ton lien sur WhatsApp.",
                  "Ton ami s'inscrit avec ton lien et reçoit 1$ de crédit.",
                  "Dès que sa 1ʳᵉ commande est livrée, tu gagnes 1$ à ton tour.",
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-display font-bold text-sm">{i + 1}</span>
                    <span className="text-sm">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Le crédit est déduit automatiquement de tes prochaines commandes. Récompense versée uniquement pour de vraies commandes livrées.
              </p>
            </div>
          </>
        )}
      </div>
    </SiteLayout>
  );
}
