import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyNotifications, markNotificationsRead } from "@/lib/notifications.functions";

export function NotificationBell() {
  const fetchNotifs = useServerFn(getMyNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["my-notifs"],
    queryFn: () => fetchNotifs(),
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
  });
  const list: any[] = data?.list ?? [];
  const unread = data?.unread ?? 0;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const onToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await markRead({ data: {} });
        qc.invalidateQueries({ queryKey: ["my-notifs"] });
      } catch {}
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-md text-foreground hover:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border bg-card shadow-lg">
          <div className="border-b px-3 py-2 text-sm font-semibold">Notifications</div>
          {list.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Aucune notification pour l'instant.
            </p>
          ) : (
            <ul className="max-h-80 divide-y overflow-y-auto">
              {list.map((n) => (
                <li key={n.id} className={!n.read_at ? "bg-[color:var(--brand-light)]/40" : ""}>
                  {n.order_id ? (
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: n.order_id }}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 hover:bg-muted/50"
                    >
                      <p className="text-sm">{n.payload?.message ?? "Mise à jour de ta commande"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {n.payload?.code ? `#${n.payload.code} · ` : ""}
                        {new Date(n.created_at).toLocaleString("fr-FR")}
                      </p>
                    </Link>
                  ) : (
                    <div className="px-3 py-2.5">
                      <p className="text-sm">{n.payload?.message ?? "Notification"}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
