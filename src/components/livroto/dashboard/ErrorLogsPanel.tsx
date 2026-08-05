import { useServerFn } from "@tanstack/react-start";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listErrorLogs, resolveErrorLog } from "@/lib/error-reporting.functions";

// Surveillance d'erreurs en production (gap identifié à l'audit du 5/08/2026) — jusqu'ici
// aucune erreur front/SSR n'était persistée nulle part. Voir error_logs (migration 61) +
// error-reporting.{ts,functions.ts} pour la capture ; ce panneau est la seule consultation.

const SOURCE_LABELS: Record<string, string> = {
  client_boundary: "🖥️ Rendu (React)",
  client_global: "🌐 Global (navigateur)",
  ssr: "🛠️ Serveur (SSR)",
};

function ErrorRow({ log, onChanged }: { log: any; onChanged: () => void }) {
  const resolve = useServerFn(resolveErrorLog);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await resolve({ data: { id: log.id, resolved: !log.resolved } });
      toast.success(log.resolved ? "Ré-ouvert" : "Marqué résolu");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{SOURCE_LABELS[log.source] ?? log.source}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("fr-FR")}</span>
          </div>
          <p className="mt-1.5 break-words text-sm font-medium">{log.message}</p>
          {log.url && <p className="mt-0.5 truncate text-xs text-muted-foreground">{log.url}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {log.stack && (
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
              {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Détail
            </Button>
          )}
          <Button size="sm" variant={log.resolved ? "outline" : "default"} onClick={toggle} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {log.resolved ? "Ré-ouvrir" : "Résoudre"}
          </Button>
        </div>
      </div>
      {open && log.stack && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-muted p-3 text-[11px] leading-relaxed">{log.stack}</pre>
      )}
    </div>
  );
}

export function ErrorLogsPanel() {
  const qc = useQueryClient();
  const fetchLogs = useServerFn(listErrorLogs);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const queryKey = ["error-logs", filter];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchLogs({ data: { offset: pageParam, resolved: filter === "open" ? false : undefined } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const rows = query.data ? query.data.pages.flatMap((p) => p.rows) : [];
  const total = query.data?.pages[0]?.total ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["error-logs"] });

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-display text-lg font-bold">Erreurs de production</h3>
            <p className="text-xs text-muted-foreground">Capturées automatiquement (front + serveur), rien à configurer.</p>
          </div>
        </div>
        <Badge variant="outline" className={total > 0 && filter === "open" ? "border-destructive/40 text-destructive" : ""}>
          {total}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b p-3">
        <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>À traiter</Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Toutes</Button>
      </div>

      <div className="space-y-3 p-4">
        {query.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {query.error && (
          <p className="text-sm text-destructive">
            {(query.error as Error).message}
            {" — la migration 61_error_logs.sql a-t-elle été appliquée ?"}
          </p>
        )}
        {!query.isLoading && !query.error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {filter === "open" ? "Aucune erreur en attente. 🎉" : "Aucune erreur enregistrée."}
          </p>
        )}
        {rows.map((r: any) => (
          <ErrorRow key={r.id} log={r} onChanged={refresh} />
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
