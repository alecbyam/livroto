import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Star, Heart, Zap } from "lucide-react";
import { useCurrency } from "@/lib/currency";
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

function ProductBadge({ product }: { product: DisplayProduct }) {
  const stock = product.stock;
  const count = Number(product.rating_count ?? 0);
  const avg = Number(product.rating_avg ?? 0);

  if (stock > 0 && stock <= 3)
    return (
      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        🔴 Plus que {stock} !
      </span>
    );
  if (stock > 0 && stock <= 7)
    return (
      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        ⚡ Presque épuisé
      </span>
    );
  if (count >= 10 && avg >= 4.5)
    return (
      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        ⭐ Bestseller
      </span>
    );
  if (count >= 5 && avg >= 4.0)
    return (
      <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        🔥 Populaire
      </span>
    );
  return null;
}

export function ProductCard({ product }: { product: DisplayProduct }) {
  const { t } = useI18n();
  const { add } = useCart();
  const { isFav, toggle } = useFavorite(product.id);
  const { fmt, currency } = useCurrency();
  const out = product.stock === 0;
  const rating = Number(product.rating_avg ?? 0);
  const reviews = Number(product.rating_count ?? 0);

  const handleAddToCart = () => {
    add({
      id: product.id,
      name: product.name,
      price_usd: Number(product.price_usd),
      emoji: product.emoji,
      image_url: product.image_url ?? null,
      vendor_id: product.vendor_id ?? null,
      stock: product.stock,
    });
    toast.success(`✅ ${product.name} ajouté au panier !`, {
      description: "Commande livrée cash à ta porte.",
      duration: 2500,
    });
  };

  return (
    <div className={`group relative flex flex-col rounded-2xl border bg-card shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5 ${out ? "opacity-70" : ""}`}>
      {/* Favourite button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        className={`absolute top-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full shadow-sm backdrop-blur transition-all ${
          isFav ? "bg-rose-500 text-white scale-110" : "bg-background/80 text-muted-foreground hover:bg-rose-50 hover:text-rose-500"
        }`}
      >
        <Heart className={`h-4 w-4 transition-transform ${isFav ? "fill-current scale-110" : "group-hover:scale-110"}`} />
      </button>

      {/* Psychology badge */}
      <ProductBadge product={product} />

      {/* Image */}
      <div className="relative overflow-hidden rounded-t-2xl aspect-square bg-[color:var(--brand-light)]">
        <Link to="/product/$productId" params={{ productId: product.id }} className="grid h-full w-full place-items-center text-6xl">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
          ) : (
            <span className="select-none">{product.emoji ?? "📦"}</span>
          )}
        </Link>
        {out && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <Badge variant="destructive" className="text-sm font-bold px-4 py-1.5">Épuisé</Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 pt-2.5">
        <Link to="/product/$productId" params={{ productId: product.id }}>
          <h3 className="font-display font-semibold leading-tight line-clamp-2 text-sm hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>

        {reviews > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="font-semibold">{rating.toFixed(1)}</span>
            <span className="text-muted-foreground">({reviews} avis)</span>
          </div>
        )}

        <div className="mt-auto pt-2.5 space-y-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-xl font-bold text-[color:var(--brand-dark)]">
              {fmt(Number(product.price_usd))}
            </span>
            {currency === "USD" && (
              <span className="text-[10px] text-muted-foreground">
                ≈ {Math.round(Number(product.price_usd) * 2800).toLocaleString("fr-CD")} FC
              </span>
            )}
          </div>

          {/* CTAs */}
          {!out ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={handleAddToCart}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-xs font-semibold transition-colors hover:bg-[color:var(--brand-light)] hover:border-[color:var(--brand-dark)] active:scale-95 min-h-[40px]"
              >
                <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                Panier
              </button>
              <Link
                to="/order/$productId"
                params={{ productId: product.id }}
                className="flex items-center justify-center gap-1 rounded-xl bg-[color:var(--brand-dark)] py-2.5 text-xs font-bold text-white transition-all hover:brightness-110 active:scale-95 min-h-[40px]"
              >
                <Zap className="h-3.5 w-3.5 shrink-0" />
                Commander
              </Link>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground py-1">Rupture de stock</p>
          )}
        </div>
      </div>
    </div>
  );
}
