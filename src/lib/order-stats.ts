// Petits calculs répétés dans les tableaux de bord vendeur/admin (revenu livré,
// agrégation par jour) — centralisés ici pour éviter la duplication entre domaines.

export function isDelivered(o: any): boolean {
  return o.status === "delivered";
}

export function sumRevenueUsd(orders: any[]): number {
  return orders.reduce((s: number, o: any) => s + Number(o.total_usd ?? 0), 0);
}

// Construit `days` jours consécutifs (le plus ancien en premier) avec le total
// commandes/revenus livrés du jour.
export function bucketOrdersByDay(
  orders: { created_at: string; total_usd: unknown; status: string }[],
  days: number,
): { date: string; commandes: number; revenus: number }[] {
  const byDay = new Map<string, { commandes: number; revenus: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    byDay.set(d.toISOString().slice(0, 10), { commandes: 0, revenus: 0 });
  }
  for (const o of orders) {
    const entry = byDay.get(o.created_at.slice(0, 10));
    if (entry) {
      entry.commandes++;
      if (o.status === "delivered") entry.revenus += Number(o.total_usd ?? 0);
    }
  }
  return Array.from(byDay.entries()).map(([date, v]) => ({ date: date.slice(5), ...v }));
}
