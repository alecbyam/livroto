import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ShoppingBag, ShoppingCart, Heart, User, LayoutDashboard } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useUserRoles } from "@/hooks/useUserRoles";

export function MobileTabBar() {
  const { t } = useI18n();
  const { count } = useCart();
  const { isSignedIn } = useUserRoles();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const isActive = (path: string) =>
    path === "/" ? pathname === "/" : pathname.startsWith(path);

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/98 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.07)" }}
    >
      <ul className="grid grid-cols-5 h-[60px]">
        <TabItem
          to="/"
          active={isActive("/")}
          icon={<Home className="h-5 w-5" />}
          label="Accueil"
        />
        <TabItem
          to="/catalog"
          active={isActive("/catalog") || isActive("/product") || isActive("/vendor")}
          icon={<ShoppingBag className="h-5 w-5" />}
          label={t("nav.catalog")}
        />
        <TabItem
          to="/cart"
          active={isActive("/cart")}
          icon={
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-2 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[color:var(--brand-dark)] px-1 text-[9px] font-bold text-white ring-2 ring-background animate-in zoom-in-50">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </span>
          }
          label="Panier"
          highlight={count > 0}
        />
        <TabItem
          to="/favorites"
          active={isActive("/favorites")}
          icon={<Heart className="h-5 w-5" />}
          label="Favoris"
        />
        <TabItem
          to={isSignedIn ? "/dashboard" : "/auth"}
          active={isActive("/dashboard") || isActive("/profile") || isActive("/orders") || (!isSignedIn && isActive("/auth"))}
          icon={isSignedIn ? <LayoutDashboard className="h-5 w-5" /> : <User className="h-5 w-5" />}
          label={isSignedIn ? "Mon espace" : "Connexion"}
        />
      </ul>
    </nav>
  );
}

function TabItem({
  to,
  icon,
  label,
  active,
  highlight,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  highlight?: boolean;
}) {
  return (
    <li className="relative flex">
      {/* Active top bar indicator */}
      {active && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-[color:var(--brand-dark)]" />
      )}
      <Link
        to={to as any}
        className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-all select-none ${
          active
            ? "text-[color:var(--brand-dark)]"
            : highlight
            ? "text-[color:var(--brand-dark)]/70"
            : "text-muted-foreground"
        }`}
      >
        <span className={`transition-transform ${active ? "scale-110" : ""}`}>{icon}</span>
        <span className={`transition-all ${active ? "font-bold" : ""}`}>{label}</span>
      </Link>
    </li>
  );
}
