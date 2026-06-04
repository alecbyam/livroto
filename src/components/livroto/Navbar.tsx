import { Link } from "@tanstack/react-router";
import { Menu, User, Package, ShoppingCart, Heart, Store, Bike, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";
import { LangSwitcher } from "./LangSwitcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navbar() {
  const { t } = useI18n();
  const { count } = useCart();
  const { isSignedIn: signedIn, isVendor, isRider, isAdmin } = useUserRoles();

  const links = (
    <>
      <Link to="/catalog" className="text-sm font-medium hover:text-primary">{t("nav.catalog")}</Link>
      <a href="/#how" className="text-sm font-medium hover:text-primary">{t("nav.howItWorks")}</a>
      <a href="/#zones" className="text-sm font-medium hover:text-primary">{t("nav.zones")}</a>
      <a href="/#seller" className="text-sm font-medium hover:text-primary">{t("nav.becomeSeller")}</a>
    </>
  );

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Logo />
        <nav className="hidden md:flex items-center gap-7">{links}</nav>
        <div className="flex items-center gap-1.5">
          <LangSwitcher />
          <Button asChild variant="ghost" size="sm" className="relative">
            <Link to="/cart" aria-label="Panier">
              <ShoppingCart className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-[color:var(--brand-dark)] px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          </Button>
          {signedIn && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex" aria-label="Mes favoris">
              <Link to="/favorites"><Heart className="h-5 w-5" /></Link>
            </Button>
          )}
          {signedIn && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/orders">
                <Package className="h-4 w-4" />
                Commandes
              </Link>
            </Button>
          )}
          {signedIn && isVendor && (
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex" aria-label="Ma boutique">
              <Link to="/dashboard" search={{ tab: "vendor" } as any}>
                <Store className="h-4 w-4" /> Boutique
              </Link>
            </Button>
          )}
          {signedIn && isRider && (
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex" aria-label="Mes livraisons">
              <Link to="/dashboard" search={{ tab: "rider" } as any}>
                <Bike className="h-4 w-4" /> Livraisons
              </Link>
            </Button>
          )}
          {signedIn && isAdmin && (
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex text-primary" aria-label="Admin">
              <Link to="/dashboard" search={{ tab: "admin" } as any}>
                <ShieldCheck className="h-4 w-4" /> Admin
              </Link>
            </Button>
          )}
          <Button asChild variant={signedIn ? "ghost" : "outline"} size="sm" className="hidden sm:inline-flex">
            <Link to={signedIn ? "/dashboard" : "/auth"}>
              <User className="h-4 w-4" />
              {signedIn ? t("nav.account") : t("nav.signIn")}
            </Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-5">{links}
                <Link to={signedIn ? "/dashboard" : "/auth"} className="text-sm font-medium hover:text-primary">
                  {signedIn ? t("nav.account") : t("nav.signIn")}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}