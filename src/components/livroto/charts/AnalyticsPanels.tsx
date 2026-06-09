// Panneaux de graphiques (recharts) — chargés à la demande (lazy) pour garder
// le bundle dashboard léger : recharts (~500 kB) n'est téléchargé que lorsque
// ces panneaux sont réellement affichés (vendeur / admin).
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getVendorAnalytics, getAdminAnalytics } from "@/lib/dashboard.functions";

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold">{value}</p>
    </div>
  );
}

export function VendorAnalyticsPanel() {
  const fetchA = useServerFn(getVendorAnalytics);
  const { data } = useQuery({ queryKey: ["vendor-analytics"], queryFn: () => fetchA() });
  const totals = data?.totals;
  const top = data?.topProducts ?? [];

  return (
    <div className="rounded-2xl border bg-card">
      <div className="border-b p-4">
        <h3 className="font-display text-lg font-bold">📊 Mes statistiques (30 jours)</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Stat label="Commandes" value={totals?.orders ?? 0} />
        <Stat label="Livrées" value={totals?.delivered ?? 0} />
        <Stat label="En attente" value={totals?.pending ?? 0} />
        <Stat label="Revenu $" value={(totals?.revenue30 ?? 0).toFixed(2)} />
      </div>
      <div className="px-4 pb-4">
        <p className="mb-1 text-xs text-muted-foreground">Commandes par jour (14 derniers jours)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data?.daily ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="commandes" fill="var(--brand-dark)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {top.length > 0 && (
        <div className="border-t p-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">🏆 Top produits (par quantité vendue)</p>
          <ul className="space-y-1.5">
            {top.map((p: any, i: number) => (
              <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{i + 1}. {p.name}</span>
                <span className="shrink-0 text-muted-foreground">{p.qty} vendus · ${Number(p.revenue).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AdminAnalyticsPanel() {
  const fetchAnalytics = useServerFn(getAdminAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => fetchAnalytics(),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="h-52 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <h3 className="font-display text-lg font-bold mb-5">📊 Activité — 30 derniers jours</h3>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Commandes / jour</p>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={data?.daily ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="commandes"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary) / 0.15)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Revenus livrés ($)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data?.daily ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenus"]} />
              <Bar dataKey="revenus" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
