import { Link } from "@tanstack/react-router";
import { Home, ShoppingBag, ShoppingCart, Heart, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";

export function MobileTabBar() {
  const { t } = useI18n();
  const { count } = useCart();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-5">
        <Tab to="/" icon={<Home className="h-5 w-5" />} label="Accueil" />
        <Tab to="/catalog" icon={<ShoppingBag className="h-5 w-5" />} label={t("nav.catalog")} />
        <Tab
          to="/cart"
          label="Panier"
          icon={
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-2 -right-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-[color:var(--brand-dark)] px-1 text-[9px] font-bold text-white">
                  {count}
                </span>
              )}
            </span>
          }
        />
        <Tab to="/favorites" icon={<Heart className="h-5 w-5" />} label="Favoris" />
        <Tab to="/auth" icon={<User className="h-5 w-5" />} label={t("nav.account")} />
      </ul>
    </nav>
  );
}

function Tab({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <Link to={to as any} className="flex flex-col items-center justify-center py-2 text-[11px] text-muted-foreground min-h-[56px]"
            activeProps={{ className: "text-primary font-medium" }}>
        {icon}
        {label}
      </Link>
    </li>
  );
}