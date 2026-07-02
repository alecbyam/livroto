import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n, type Lang } from "@/lib/i18n";

/**
 * Partage d'un produit sur WhatsApp — canal n°1 à Bunia, viralité bouche-à-oreille.
 * Message localisé (fr/sw/ln), faible data (texte + lien). Cohérent avec le reste de
 * l'app qui passe par wa.me. L'utilisateur choisit le contact (ou un statut WhatsApp).
 */
const LABEL: Record<Lang, string> = { fr: "Partager", sw: "Shiriki", ln: "Kabola", en: "Share" };

const MSG: Record<Lang, (p: { name: string; price: string; url: string }) => string> = {
  fr: ({ name, price, url }) =>
    `👀 Regarde ça sur Livroto !\n*${name}* — ${price}\n🛵 Livré cash à ta porte à Bunia\n${url}`,
  sw: ({ name, price, url }) =>
    `👀 Angalia hii kwenye Livroto!\n*${name}* — ${price}\n🛵 Inaletwa kwako Bunia, lipa cash\n${url}`,
  ln: ({ name, price, url }) =>
    `👀 Tala oyo na Livroto!\n*${name}* — ${price}\n🛵 Ekomi epai na yo na Bunia, futa cash\n${url}`,
  en: ({ name, price, url }) =>
    `👀 Check this out on Livroto!\n*${name}* — ${price}\n🛵 Cash on delivery in Bunia\n${url}`,
};

export function ShareButton({
  productId,
  name,
  price,
  size = "lg",
}: {
  productId: string;
  name: string;
  price: string;
  size?: "sm" | "lg" | "default";
}) {
  const { lang } = useI18n();

  const onShare = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://livroto.vercel.app";
    const url = `${origin}/product/${productId}`;
    const text = MSG[lang]({ name, price, url });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={onShare}
      aria-label={LABEL[lang]}
      className="border-[color:var(--whatsapp)]/50 text-[color:var(--whatsapp)] hover:bg-[color:var(--whatsapp)]/10 hover:text-[color:var(--whatsapp)]"
    >
      <MessageCircle className="h-5 w-5" /> {LABEL[lang]}
    </Button>
  );
}
