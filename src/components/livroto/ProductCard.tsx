import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Star, Heart } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { useFavorite } from "@/lib/favorites";
import { toast } from "sonner";

export type DisplayProduct = {
  id: string;
  name: string;
  description: string | null;
  price_usd: number;
  stock: number;
  emoji: string | null;
  image_url?: string | null;
  vendor_id?: string | null;
  rating_avg?: number | null;
  rating_count?: number | null;
};

export function ProductCard({ product }: { product: DisplayProduct }) {
  const { t } = useI18n();
  const { add } = useCart();
  const { isFav, toggle } = useFavorite(product.id);
  const out = product.stock === 0;
  const rating = Number(product.rating_avg ?? 0);
  const reviews = Number(product.rating_count ?? 0);
  return (
    <div className="group relative flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        className={`absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full backdrop-blur transition-colors ${isFav ? "bg-rose-500/90 text-white" : "bg-background/80 text-muted-foreground hover:text-rose-500"}`}
      >
        <Heart className={`h-4 w-4 ${isFav ? "fill-current" : ""}`} />
      </button>
      <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-[color:var(--brand-light)] text-6xl">
        <Link to="/product/$productId" params={{ productId: product.id }} className="grid h-full w-full place-items-center">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span>{product.emoji ?? "📦"}</span>
          )}
        </Link>
        {out && (
          <Badge variant="destructive" className="absolute top-2 right-2">{t("catalog.outOfStock")}</Badge>
        )}
      </div>
      <div className="mt-3 flex-1">
        <Link to="/product/$productId" params={{ productId: product.id }} className="block hover:underline">
          <h3 className="font-display font-semibold leading-tight">{product.name}</h3>
        </Link>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{product.description ?? ""}</p>
        {reviews > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
            <span>({reviews})</span>
          </div>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <span className="block font-display text-lg font-bold text-[color:var(--brand-dark)]">${Number(product.price_usd).toFixed(2)}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={out}
            className="flex-1 min-h-[40px]"
            onClick={() => {
              add({
                id: product.id,
                name: product.name,
                price_usd: Number(product.price_usd),
                emoji: product.emoji,
                image_url: product.image_url ?? null,
                vendor_id: product.vendor_id ?? null,
                stock: product.stock,
              });
              toast.success(`${product.name} ajouté au panier`);
            }}
          >
            <ShoppingCart className="h-4 w-4" />
            Panier
          </Button>
          <Button asChild size="sm" disabled={out} className="flex-1 min-h-[40px]">
            <Link to="/order/$productId" params={{ productId: product.id }}>
              {t("catalog.order")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}