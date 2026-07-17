import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { runAgentDraft, runSalesInsight } from "@/lib/agents.functions";
import { AGENT_LABELS, type AgentType } from "@/lib/agents/prompts";

type Result = { agent: AgentType; output: any; orderCount?: number; days?: number };

const PLACEHOLDERS: Record<AgentType, string> = {
  orchestrateur: "Ex : Un client se plaint d'un retard ET je veux un post pour lancer le chargeur en promo.",
  commercial: "Ex : Relance pour Jean qui a mis un chargeur Type-C dans son panier hier sans commander.",
  contenu: "Ex : Post WhatsApp Status pour annoncer qu'on livre maintenant à Mudzipela, paiement cash.",
  analytics: "L'analyse lit tes vraies commandes automatiquement — choisis juste la période ci-dessous.",
  support: "Colle le message reçu du client (WhatsApp) : « Bonjour, ma commande n'est pas arrivée… »",
};

function CopyBtn({ text }: { text: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => toast.success("Copié"),
          () => toast.error("Copie impossible"),
        );
      }}
    >
      <Copy className="h-3.5 w-3.5" /> Copier
    </Button>
  );
}

function Draft({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <CopyBtn text={text} />
      </div>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

function Notes({ notes }: { notes?: string | null }) {
  if (!notes) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <b>À vérifier avant envoi :</b> {notes}
      </span>
    </div>
  );
}

function ResultView({ result }: { result: Result }) {
  const o = result.output;
  switch (result.agent) {
    case "commercial":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{o.type_message}</Badge>
            <Badge variant="outline">{o.canal}</Badge>
          </div>
          {(o.variantes ?? []).map((v: any, i: number) => (
            <Draft key={i} label={`Variante ${v.ton}`} text={v.texte} />
          ))}
          <Notes notes={o.notes_validation} />
        </div>
      );
    case "contenu":
      return (
        <div className="space-y-3">
          <Badge variant="outline">{o.canal}</Badge>
          <Draft label="Contenu" text={o.contenu} />
          {(o.hashtags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {o.hashtags.map((h: string, i: number) => (
                <span key={i} className="rounded bg-muted px-2 py-0.5 text-xs">{h}</span>
              ))}
            </div>
          )}
          {o.suggestion_visuel && (
            <p className="text-xs text-muted-foreground">🎬 Visuel : {o.suggestion_visuel}</p>
          )}
          <Notes notes={o.notes_validation} />
        </div>
      );
    case "support":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{o.categorie}</Badge>
            <Badge
              variant="outline"
              className={
                o.niveau_urgence === "humain_urgent"
                  ? "border-destructive/40 text-destructive"
                  : o.niveau_urgence === "urgent"
                    ? "border-amber-500/40 text-amber-600"
                    : ""
              }
            >
              {o.niveau_urgence === "humain_urgent" ? "⚠️ humain urgent" : o.niveau_urgence}
            </Badge>
          </div>
          <Draft label="Brouillon de réponse" text={o.brouillon_reponse} />
          {o.options_geste_commercial && (
            <p className="text-xs text-muted-foreground">
              💡 Geste commercial possible : {o.options_geste_commercial}
            </p>
          )}
          <Notes notes={o.notes_validation} />
        </div>
      );
    case "analytics":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {o.periode_analysee}
            {result.orderCount != null ? ` · ${result.orderCount} commande(s)` : ""}
          </p>
          {(o.indicateurs_cles ?? []).length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {o.indicateurs_cles.map((k: any, i: number) => (
                <div key={i} className="rounded-xl border bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.nom}</p>
                  <p className="font-display text-lg font-bold">{k.valeur}</p>
                  {k.evolution && <p className="text-xs text-muted-foreground">{k.evolution}</p>}
                </div>
              ))}
            </div>
          )}
          {(o.observations ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Observations</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {o.observations.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {(o.interpretations ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Interprétations (hypothèses)</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm italic">
                {o.interpretations.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {(o.recommandations ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Recommandations</p>
              {o.recommandations.map((r: any, i: number) => (
                <div key={i} className="rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.action}</p>
                    <Badge variant="outline" className="shrink-0">effort {r.effort}</Badge>
                  </div>
                  {r.justification && <p className="mt-1 text-xs text-muted-foreground">{r.justification}</p>}
                </div>
              ))}
            </div>
          )}
          {(o.anomalies_donnees ?? []).length > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-500/5 p-3 text-xs">
              <b>Anomalies dans les données :</b>
              <ul className="mt-1 list-disc pl-5">
                {o.anomalies_donnees.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <Notes notes={o.notes_validation} />
        </div>
      );
    case "orchestrateur":
      return (
        <div className="space-y-3">
          {o.raisonnement && <p className="text-sm text-muted-foreground">{o.raisonnement}</p>}
          {(o.taches ?? []).map((t: any, i: number) => (
            <div key={i} className="rounded-xl border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{AGENT_LABELS[t.agent as AgentType]?.emoji ?? "👤"} {t.agent}</Badge>
                <Badge variant="outline">priorité {t.priorite}</Badge>
              </div>
              <p className="mt-1.5 text-sm">{t.instruction}</p>
              {(t.contexte?.client || t.contexte?.produit || t.contexte?.details) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[t.contexte.client, t.contexte.produit, t.contexte.details].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      );
    default:
      return <pre className="overflow-x-auto text-xs">{JSON.stringify(o, null, 2)}</pre>;
  }
}

export function AiAssistantPanel() {
  const draft = useServerFn(runAgentDraft);
  const salesInsight = useServerFn(runSalesInsight);
  const [agent, setAgent] = useState<AgentType>("support");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (agent === "analytics") {
        const res = await salesInsight({ data: { days } });
        setResult(res as Result);
      } else {
        if (!message.trim()) {
          toast.error("Écris d'abord la demande.");
          return;
        }
        const res = await draft({ data: { agent, message: message.trim() } });
        setResult(res as Result);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur de l'assistant IA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b p-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <div>
          <h3 className="font-display text-lg font-bold">Assistant IA</h3>
          <p className="text-xs text-muted-foreground">
            Génère des brouillons (messages, posts, analyses). Tu valides toujours avant d'envoyer.
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* Choix de l'agent */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(AGENT_LABELS) as AgentType[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => { setAgent(a); setResult(null); }}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                agent === a
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "hover:bg-muted/50"
              }`}
            >
              {AGENT_LABELS[a].emoji} {AGENT_LABELS[a].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{AGENT_LABELS[agent].desc}</p>

        {/* Entrée : période pour analytics, texte libre sinon */}
        {agent === "analytics" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Analyser les</span>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 jours</SelectItem>
                <SelectItem value="30">30 jours</SelectItem>
                <SelectItem value="90">90 jours</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">— Claude lit tes vraies commandes.</span>
          </div>
        ) : (
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={PLACEHOLDERS[agent]}
            rows={4}
            maxLength={6000}
          />
        )}

        <Button onClick={run} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Génération…" : "Générer le brouillon"}
        </Button>

        {result && (
          <div className="mt-2 rounded-2xl border bg-muted/20 p-4">
            <ResultView result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
