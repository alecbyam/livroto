// ============================================================================
// Fiche plat (modal) — module boutique générique. Photo agrandie, description,
// options (taille, suppléments...), sélecteur de quantité, ajout au panier.
// ============================================================================
import { useMemo, useState } from "react";
import { Minus, Plus, Store } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { makeCartLineId } from "@/lib/shops/cart";

export type OptionChoice = { id: string; name: string; price_delta_usd: number };
export type ProductOption = { id: string; name: string; type: "single" | "multi"; required: boolean; choices: OptionChoice[] };
export type ProductDetail = {
  id: string; name: string; description: string | null; price_usd: number; image_url: string | null;
  is_popular: boolean; is_new: boolean; options: ProductOption[];
};

export function ProductDetailDialog({
  product, open, onOpenChange, onAdd,
}: {
  product: ProductDetail | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (payload: { cartLineId: string; name: string; price_usd: number; selectedChoiceIds: string[]; qty: number }) => void;
}) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({}); // option_id -> choice_id[]

  // Remise à zéro à chaque nouveau produit ouvert.
  const key = product?.id ?? "none";

  const allChoiceIds = useMemo(() => Object.values(selected).flat(), [selected]);
  const priceUnit = useMemo(() => {
    if (!product) return 0;
    const delta = product.options
      .flatMap((o) => o.choices)
      .filter((c) => allChoiceIds.includes(c.id))
      .reduce((s, c) => s + Number(c.price_delta_usd), 0);
    return Number(product.price_usd) + delta;
  }, [product, allChoiceIds]);

  const missingRequired = product?.options.some((o) => o.required && !(selected[o.id]?.length > 0)) ?? false;

  const toggleSingle = (optionId: string, choiceId: string) => setSelected((s) => ({ ...s, [optionId]: [choiceId] }));
  const toggleMulti = (optionId: string, choiceId: string, checked: boolean) =>
    setSelected((s) => {
      const cur = s[optionId] ?? [];
      return { ...s, [optionId]: checked ? [...cur, choiceId] : cur.filter((id) => id !== choiceId) };
    });

  if (!product) return null;

  const submit = () => {
    if (missingRequired) return;
    const choiceIds = Object.values(selected).flat();
    const names = product.options
      .flatMap((o) => o.choices)
      .filter((c) => choiceIds.includes(c.id))
      .map((c) => c.name);
    const displayName = names.length ? `${product.name} (${names.join(", ")})` : product.name;
    onAdd({ cartLineId: makeCartLineId(product.id, choiceIds), name: displayName, price_usd: priceUnit, selectedChoiceIds: choiceIds, qty });
    onOpenChange(false);
    setQty(1);
    setSelected({});
  };

  return (
    <Dialog key={key} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0">
        <div className="aspect-[4/3] w-full bg-muted overflow-hidden">
          {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Store className="h-10 w-10 text-muted-foreground" /></div>}
        </div>
        <div className="p-5">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-xl">{product.name}</DialogTitle>
              {product.is_popular && <Badge className="border-[color:var(--primary)]/40 bg-[color:var(--primary)]/15 text-[color:var(--primary)]" variant="outline">Populaire</Badge>}
              {product.is_new && <Badge variant="outline">Nouveau</Badge>}
            </div>
          </DialogHeader>
          {product.description && <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>}
          <p className="mt-2 font-display text-lg font-bold">${Number(product.price_usd).toFixed(2)}</p>

          {product.options.map((opt) => (
            <div key={opt.id} className="mt-5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{opt.name}</Label>
                {opt.required && <Badge variant="outline" className="text-[10px]">Obligatoire</Badge>}
              </div>
              {opt.type === "single" ? (
                <RadioGroup value={selected[opt.id]?.[0] ?? ""} onValueChange={(v) => toggleSingle(opt.id, v)} className="mt-2 space-y-2">
                  {opt.choices.map((c) => (
                    <label key={c.id} className="flex items-center justify-between rounded-xl border p-2.5 cursor-pointer">
                      <span className="flex items-center gap-2"><RadioGroupItem value={c.id} />{c.name}</span>
                      {Number(c.price_delta_usd) !== 0 && <span className="text-xs text-muted-foreground">{c.price_delta_usd > 0 ? "+" : ""}{c.price_delta_usd.toFixed(2)}$</span>}
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                <div className="mt-2 space-y-2">
                  {opt.choices.map((c) => (
                    <label key={c.id} className="flex items-center justify-between rounded-xl border p-2.5 cursor-pointer">
                      <span className="flex items-center gap-2">
                        <Checkbox checked={selected[opt.id]?.includes(c.id) ?? false} onCheckedChange={(v) => toggleMulti(opt.id, c.id, !!v)} />
                        {c.name}
                      </span>
                      {Number(c.price_delta_usd) !== 0 && <span className="text-xs text-muted-foreground">{c.price_delta_usd > 0 ? "+" : ""}{c.price_delta_usd.toFixed(2)}$</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="mt-5 flex items-center justify-center gap-4">
            <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
            <span className="w-6 text-center font-semibold">{qty}</span>
            <Button size="icon" variant="outline" className="h-9 w-9 rounded-full" onClick={() => setQty((q) => q + 1)}><Plus className="h-4 w-4" /></Button>
          </div>

          <Button className="mt-4 w-full" size="lg" onClick={submit} disabled={missingRequired}>
            Ajouter au panier — ${(priceUnit * qty).toFixed(2)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
