import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAgentDrafts, updateAgentDraftStatus } from "@/lib/agents.functions";
import { AGENT_LABELS, type AgentType } from "@/lib/agents/prompts";
import { ResultView } from "./AiAssistantPanel";
import { statusColor } from "./shared";

// Historique persistant des brouillons générés par AiAssistantPanel (backbone du futur
// écran de validation) — voir agent_drafts (migration 60). Chaque ligne = un appel déjà
// réussi ; ce panneau ne fait aucun appel Claude, il gère uniquement le suivi humain.

type DraftStatus = "en_attente" | "valide" | "rejete" | "envoye";
const STATUS_LABELS: Record<DraftStatus, string> = {
  en_attente: "En attente",
  valide: "Validé",
  rejete: "Rejeté",
  envoye: "Envoyé",
};
// Réutilise la palette déjà définie dans shared.tsx via un statut équivalent connu.
const draftStatusColor = (s: DraftStatus) =>
  statusColor(s === "en_attente" ? "pending" : s === "valide" ? "approved" : s === "rejete" ? "rejected" : "delivered");

const FILTERS: { id: DraftStatus | "all"; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "en_attente", label: "En attente" },
  { id: "valide", label: "Validé" },
  { id: "rejete", label: "Rejeté" },
  { id: "envoye", label: "Envoyé" },
];

function DraftCard({ draft, onChanged }: { draft: any; onChanged: () => void }) {
  const update = useServerFn(updateAgentDraftStatus);
  const [notes, setNotes] = useState(draft.notes ?? "");
  const [busy, setBusy] = useState(false);

  const changeStatus = async (status: DraftStatus) => {
    setBusy(true);
    try {
      await update({ data: { draftId: draft.id, status } });
      toast.success(`Marqué « ${STATUS_LABELS[status]} »`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (notes === (draft.notes ?? "")) return;
    try {
      await update({ data: { draftId: draft.id, status: draft.status, notes } });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    }
  };

  const label = AGENT_LABELS[draft.agent as AgentType];

  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{label?.emoji} {label?.label ?? draft.agent}</Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(draft.created_at).toLocaleString("fr-FR")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={draftStatusColor(draft.status)} variant="outline">
            {STATUS_LABELS[draft.status as DraftStatus] ?? draft.status}
          </Badge>
          <Select value={draft.status} onValueChange={(v: DraftStatus) => changeStatus(v)} disabled={busy}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABELS) as DraftStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {draft.input_message && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium">Demande :</span> {draft.input_message}
        </p>
      )}

      <div className="mt-3">
        <ResultView result={{ agent: draft.agent, output: draft.output }} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Note du validateur (optionnel — motif de rejet, ajustement fait avant envoi…)"
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

export function AgentDraftsPanel() {
  const qc = useQueryClient();
  const fetchDrafts = useServerFn(listAgentDrafts);
  const [filter, setFilter] = useState<DraftStatus | "all">("en_attente");

  const queryKey = ["agent-drafts", filter];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchDrafts({ data: { offset: pageParam, status: filter === "all" ? undefined : filter } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const rows = query.data ? query.data.pages.flatMap((p) => p.rows) : [];
  const total = query.data?.pages[0]?.total ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["agent-drafts"] });

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-display text-lg font-bold">Historique & validation</h3>
            <p className="text-xs text-muted-foreground">Tous les brouillons générés par l'Assistant IA ci-dessus.</p>
          </div>
        </div>
        <Badge variant="outline">{total}</Badge>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b p-3">
        {FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3 p-4">
        {query.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {query.error && (
          <p className="text-sm text-destructive">
            {(query.error as Error).message}
            {" — la migration 60_agent_drafts.sql a-t-elle été appliquée ?"}
          </p>
        )}
        {!query.isLoading && !query.error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun brouillon pour ce filtre.</p>
        )}
        {rows.map((d: any) => (
          <DraftCard key={d.id} draft={d} onChanged={refresh} />
        ))}
      </div>

      {query.hasNextPage && (
        <div className="border-t p-3 text-center">
          <Button size="sm" variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Charger plus"}
          </Button>
        </div>
      )}
    </div>
  );
}
