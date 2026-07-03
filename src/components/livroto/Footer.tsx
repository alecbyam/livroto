import { Logo } from "./Logo";
import { useI18n } from "@/lib/i18n";
import { Mail, MapPin, Phone } from "lucide-react";
import { LIVROTO_WHATSAPP } from "@/lib/whatsapp";
import { Link } from "@tanstack/react-router";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-24 border-t border-border bg-[color:var(--brand-dark)] text-white">
      <div className="container mx-auto px-4 py-12 grid gap-10 md:grid-cols-4">
        <div>
          <Logo light />
          <p className="mt-3 text-sm text-white/70 max-w-xs">{t("footer.tagline")}</p>
        </div>
        <div className="text-sm">
          <h4 className="font-display font-semibold mb-3 text-white">{t("footer.contact")}</h4>
          <ul className="space-y-2 text-white/80">
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span>+{LIVROTO_WHATSAPP}</span>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span>hello@livroto.cd</span>
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>Bunia, Ituri — RDC</span>
            </li>
          </ul>
        </div>
        <div className="text-sm">
          <h4 className="font-display font-semibold mb-3 text-white">Livroto</h4>
          <ul className="space-y-2 text-white/80">
            <li>
              <Link to="/catalog" className="hover:text-white">
                Catalogue
              </Link>
            </li>
            <li>
              <Link to="/boutiques" className="hover:text-white">
                Boutiques
              </Link>
            </li>
            <li>
              <Link to="/aide" className="hover:text-white">
                Aide & Contact
              </Link>
            </li>
            <li>
              <Link to="/about" className="hover:text-white">
                À propos
              </Link>
            </li>
            <li>
              <Link to="/terms" className="hover:text-white">
                Conditions générales
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm text-white/70">
          <h4 className="font-display font-semibold mb-3 text-white">À Bunia</h4>
          <p>Bunia livre à ta porte. Commande. Livroto arrive.</p>
          <p className="mt-6 text-xs text-white/50" suppressHydrationWarning>
            © {new Date().getFullYear()} Livroto. {t("footer.rights")}
          </p>
          <p className="mt-1 text-xs text-white/60">
            Un produit{" "}
            <Link to="/about" className="font-semibold text-white hover:underline">
              JuntoX
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
