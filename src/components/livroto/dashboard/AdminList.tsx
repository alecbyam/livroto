import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Extrait de AdminPanel.tsx pour être réutilisable par d'autres panneaux admin paginés
// (ex: AuditLogPanel) sans import circulaire vers AdminPanel.tsx lui-même.

// Pagination "charger plus" partagée par les listes admin (vendeurs, livreurs, produits,
// commandes, signalements, journal d'audit...) — chacune appelle sa propre fonction serveur
// paginée (offset/limit) au lieu de recevoir une liste plafonnée depuis getAdminDashboard.
export function useAdminPagedList<T>(
  key: string,
  fetchPage: (args: { data: Record<string, any> }) => Promise<{ rows: T[]; total: number }>,
  extraParams: Record<string, any> = {},
) {
  const qc = useQueryClient();
  const queryKey = [key, extraParams];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ data: { offset: pageParam, ...extraParams } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.rows.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const rows = query.data ? query.data.pages.flatMap((p) => p.rows) : [];
  const total = query.data?.pages[0]?.total ?? 0;
  return {
    rows,
    total,
    isLoading: query.isLoading,
    hasMore: !!query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => query.fetchNextPage(),
    refresh: () => qc.invalidateQueries({ queryKey: [key] }),
  };
}

export function AdminList({
  title, rows, total, render, hasMore, loadingMore, onLoadMore,
}: {
  title: string;
  rows: any[];
  total?: number;
  render: (r: any) => React.ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <Badge variant="outline">{total ?? rows.length}</Badge>
      </div>
      <div className="divide-y">
        {rows.length === 0 && <p className="p-6 text-sm text-muted-foreground">Vide.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">{render(r)}</div>
        ))}
      </div>
      {hasMore && (
        <div className="border-t p-3 text-center">
          <Button size="sm" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Charger plus"}
          </Button>
        </div>
      )}
    </div>
  );
}
