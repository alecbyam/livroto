// ============================================================================
// Back-office boutique — module générique (/shop-admin/$slug). Onglets :
// Commandes (owner+manager+staff), Menu (owner+manager), Intégrations &
// Équipe (owner uniquement). Indépendant du dashboard vendeur natif
// (dashboard.tsx, onglet "vendor") — schéma shop_* dédié.
// ============================================================================
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, KeyRound, UserPlus, Settings2 } from "lucide-react";
import { ShopSiteLayout } from "@/components/shops/ShopSiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ShopIntegrationsPanel } from "@/components/shops/ShopIntegrationsPanel";
import { getMyShop, ownerUpdateShop } from "@/lib/shops/shops.functions";
import {
  getShopMenuForOwner, ownerCreateMenuSection, ownerDeleteMenuSection,
  ownerCreateProduct, ownerUpdateProduct, ownerDeleteProduct,
  ownerCreateProductOption, ownerUpdateProductOption, ownerDeleteProductOption,
  ownerCreateOptionChoice, ownerDeleteOptionChoice,
} from "@/lib/shops/menu.functions";
import { DAY_LABELS, ORDERED_DAY_KEYS } from "@/lib/shops/hours";
import { getOwnerShopOrders, ownerUpdateShopOrderStatus } from "@/lib/shops/orders.functions";
import {
  ownerListStaff, ownerCreateStaffUser, ownerUpdateStaffRole, ownerRemoveStaff, ownerResetStaffPassword,
} from "@/lib/shops/staff.functions";
import { ShopInstallPWA } from "@/components/shops/ShopInstallPWA";
import { ImageUploadField } from "@/components/shops/ImageUploadField";
import { useShopPwaBranding } from "@/lib/shops/usePwaBranding";

export const Route = createFileRoute("/_authenticated/shop-admin/$slug")({
  component: ShopAdminPage,
});

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "picked_up", "delivered", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = {
  pending: "Reçue", confirmed: "Confirmée", preparing: "En préparation",
  ready: "Prête", picked_up: "En livraison", delivered: "Livrée", cancelled: "Annulée",
};

function ShopAdminPage() {
  const { slug } = Route.useParams();
  const fetchShop = useServerFn(getMyShop);
  const { data, isLoading } = useQuery({ queryKey: ["my-shop"], queryFn: () => fetchShop() });
  useShopPwaBranding(data?.shop); // installable avec le nom/logo de SA boutique, même dans le back-office

  if (isLoading) {
    return <ShopSiteLayout shop={null}><div className="container mx-auto px-4 py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></ShopSiteLayout>;
  }
  const shop = data?.shop;
  const role = data?.role; // 'owner' | 'manager' | 'staff' | null
  if (!shop || shop.slug !== slug) {
    return (
      <ShopSiteLayout shop={null}>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Accès refusé</h1>
          <p className="mt-2 text-muted-foreground">Tu ne fais pas partie de l'équipe de cette boutique.</p>
        </div>
      </ShopSiteLayout>
    );
  }
  const isOwner = role === "owner";
  const canEditMenu = role === "owner" || role === "manager";

  return (
    <ShopSiteLayout shop={shop} backHref={`/shop-admin/${shop.slug}`}>
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-bold">Back-office</h1>
          <Badge variant="outline">{role === "owner" ? "Propriétaire" : role === "manager" ? "Manager" : "Équipe"}</Badge>
        </div>

        <Tabs defaultValue="orders" className="mt-6">
          <TabsList>
            <TabsTrigger value="orders">Commandes</TabsTrigger>
            {canEditMenu && <TabsTrigger value="menu">Menu</TabsTrigger>}
            {isOwner && <TabsTrigger value="integrations">Intégrations</TabsTrigger>}
            {isOwner && <TabsTrigger value="team">Équipe</TabsTrigger>}
            {isOwner && <TabsTrigger value="settings">Réglages</TabsTrigger>}
          </TabsList>
          <TabsContent value="orders" className="mt-6"><OrdersTab shopId={shop.id} /></TabsContent>
          {canEditMenu && <TabsContent value="menu" className="mt-6"><MenuTab shopId={shop.id} /></TabsContent>}
          {isOwner && <TabsContent value="integrations" className="mt-6"><ShopIntegrationsPanel shopId={shop.id} /></TabsContent>}
          {isOwner && <TabsContent value="team" className="mt-6"><TeamTab shopId={shop.id} /></TabsContent>}
          {isOwner && <TabsContent value="settings" className="mt-6"><SettingsTab shop={shop} /></TabsContent>}
        </Tabs>
      </div>
      <ShopInstallPWA shopId={shop.id} shopName={shop.name} />
    </ShopSiteLayout>
  );
}

/* ----------------------------- Équipe (owner uniquement) ----------------------------- */
function TeamTab({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const listStaff = useServerFn(ownerListStaff);
  const createStaff = useServerFn(ownerCreateStaffUser);
  const updateRole = useServerFn(ownerUpdateStaffRole);
  const removeStaff = useServerFn(ownerRemoveStaff);
  const resetPassword = useServerFn(ownerResetStaffPassword);

  const { data, isLoading } = useQuery({ queryKey: ["shop-staff", shopId], queryFn: () => listStaff({ data: { shop_id: shopId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["shop-staff", shopId] });

  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<{ id: string; label: string } | null>(null);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const staff = data?.staff ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-md">
          Ajoute les personnes qui gèrent cette boutique avec toi. <b>Manager</b> : menu + commandes.
          <b> Staff</b> (caissier/serveur) : commandes uniquement. Toi seul gères l'équipe et les intégrations de paiement.
        </p>
        <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Ajouter</Button>
      </div>

      {staff.length === 0 ? (
        <p className="text-muted-foreground">Aucun membre d'équipe pour l'instant — tu es seul(e) aux commandes.</p>
      ) : (
        <div className="space-y-2">
          {staff.map((s: any) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <div>
                <p className="font-medium">{s.full_name || s.email}</p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Select value={s.role} onValueChange={async (v) => { await updateRole({ data: { staff_id: s.id, shop_id: shopId, role: v as any } }); refresh(); }}>
                  <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" variant="outline" onClick={() => setResetTarget({ id: s.id, label: s.full_name || s.email })}>
                  <KeyRound className="h-4 w-4" />
                </Button>
                <Button
                  size="icon" variant="ghost"
                  onClick={async () => { if (confirm(`Retirer ${s.full_name || s.email} de l'équipe ?`)) { await removeStaff({ data: { staff_id: s.id, shop_id: shopId } }); refresh(); } }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddStaffDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={async (payload) => {
          try {
            await createStaff({ data: { shop_id: shopId, ...payload } });
            setAddOpen(false); refresh();
            toast.success("Membre ajouté");
          } catch (e: any) { toast.error(e.message); }
        }}
      />

      <ResetPasswordDialog
        target={resetTarget}
        onOpenChange={(o) => { if (!o) setResetTarget(null); }}
        onSubmit={async (newPassword) => {
          if (!resetTarget) return;
          try {
            await resetPassword({ data: { staff_id: resetTarget.id, shop_id: shopId, new_password: newPassword } });
            toast.success("Mot de passe mis à jour");
            setResetTarget(null);
          } catch (e: any) { toast.error(e.message); }
        }}
      />
    </div>
  );
}

function AddStaffDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (payload: { email: string; full_name: string; role: "manager" | "staff"; password: string }) => void }) {
  const [form, setForm] = useState({ email: "", full_name: "", role: "staff" as "manager" | "staff", password: "" });

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setForm({ email: "", full_name: "", role: "staff", password: "" }); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter un membre de l'équipe</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nom complet</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" /></div>
          <div>
            <Label className="text-xs">Rôle</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager (menu + commandes)</SelectItem>
                <SelectItem value="staff">Staff (commandes uniquement)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mot de passe temporaire</Label>
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 caractères — à communiquer à la personne" className="mt-1" />
            <p className="mt-1 text-[11px] text-muted-foreground">Si cet email a déjà un compte Livroto, le mot de passe n'est pas modifié — seul le rôle est attribué.</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!form.email.trim() || !form.full_name.trim() || form.password.length < 8) { toast.error("Nom, email et mot de passe (8+ car.) sont requis."); return; }
              onSubmit({ email: form.email.trim(), full_name: form.full_name.trim(), role: form.role, password: form.password });
            }}
          >
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ target, onOpenChange, onSubmit }: { target: { id: string; label: string } | null; onOpenChange: (o: boolean) => void; onSubmit: (newPassword: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open={!!target} onOpenChange={(o) => { onOpenChange(o); if (!o) setPassword(""); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau mot de passe — {target?.label}</DialogTitle></DialogHeader>
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 caractères" />
        <DialogFooter>
          <Button onClick={() => { if (password.length < 8) { toast.error("8 caractères minimum."); return; } onSubmit(password); setPassword(""); }}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Commandes ----------------------------- */
function OrdersTab({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const fetchOrders = useServerFn(getOwnerShopOrders);
  const updateStatus = useServerFn(ownerUpdateShopOrderStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["shop-owner-orders", shopId],
    queryFn: () => fetchOrders({ data: { shop_id: shopId } }),
    refetchInterval: 15_000,
  });

  const onStatus = async (orderId: string, status: string) => {
    try {
      await updateStatus({ data: { order_id: orderId, status: status as any } });
      toast.success("Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["shop-owner-orders", shopId] });
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const orders = data?.orders ?? [];
  if (orders.length === 0) return <p className="text-muted-foreground">Aucune commande pour le moment.</p>;

  return (
    <div className="space-y-3">
      {orders.map((o: any) => (
        <div key={o.id} className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-display font-bold">#{o.code ?? o.id.slice(0, 6)} — {o.customer_name}</p>
              <p className="text-xs text-muted-foreground">{o.customer_phone} · {new Date(o.created_at).toLocaleString("fr-FR")}</p>
            </div>
            <select
              value={o.status}
              onChange={(e) => onStatus(o.id, e.target.value)}
              className="rounded-lg border bg-background px-2 py-1.5 text-sm"
            >
              {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <ul className="mt-2 divide-y text-sm">
            {(o.items ?? []).map((it: any, i: number) => (
              <li key={i} className="flex justify-between py-1.5">
                <span>{it.product_name} × {it.quantity}{it.notes ? <span className="block text-xs italic text-muted-foreground">"{it.notes}"</span> : null}</span>
                <span>${Number(it.line_total_usd).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between text-sm font-medium">
            <span>{o.customer_address}</span>
            <span>Total ${Number(o.total_usd).toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Menu ----------------------------- */
function MenuTab({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const fetchMenu = useServerFn(getShopMenuForOwner);
  const createSection = useServerFn(ownerCreateMenuSection);
  const deleteSection = useServerFn(ownerDeleteMenuSection);
  const createProduct = useServerFn(ownerCreateProduct);
  const updateProduct = useServerFn(ownerUpdateProduct);
  const deleteProduct = useServerFn(ownerDeleteProduct);

  const { data, isLoading } = useQuery({ queryKey: ["shop-menu-owner", shopId], queryFn: () => fetchMenu({ data: { shop_id: shopId } }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["shop-menu-owner", shopId] });

  const [newSection, setNewSection] = useState("");
  const [editing, setEditing] = useState<any | null>(null); // produit en édition (ou {} pour création)
  const [optionsFor, setOptionsFor] = useState<any | null>(null); // produit dont on gère les options

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const sections = data?.sections ?? [];
  const products = data?.products ?? [];

  const onAddSection = async () => {
    if (!newSection.trim()) return;
    try {
      await createSection({ data: { shop_id: shopId, name: newSection.trim(), sort_order: sections.length } });
      setNewSection(""); refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleAvailable = async (p: any) => {
    try { await updateProduct({ data: { product_id: p.id, is_available: !p.is_available } }); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="Nouvelle section (ex: Entrées)" className="max-w-xs" />
        <Button variant="outline" onClick={onAddSection}><Plus className="h-4 w-4" /> Ajouter une section</Button>
      </div>

      {sections.map((s: any) => (
        <div key={s.id} className="rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold">{s.name}</h3>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({ shop_id: shopId, menu_section_id: s.id })}><Plus className="h-4 w-4" /> Article</Button>
              <Button size="icon" variant="ghost" onClick={async () => { if (confirm("Supprimer cette section ?")) { await deleteSection({ data: { section_id: s.id } }); refresh(); } }}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {products.filter((p: any) => p.menu_section_id === s.id).map((p: any) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-xl border p-2 ${!p.is_available ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {p.name} {p.is_popular && <Badge variant="outline" className="ml-1 text-[10px]">Populaire</Badge>} {p.is_new && <Badge variant="outline" className="ml-1 text-[10px]">Nouveau</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">${Number(p.price_usd).toFixed(2)} {p.options?.length > 0 && `· ${p.options.length} option(s)`}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={p.is_available} onCheckedChange={() => toggleAvailable(p)} />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOptionsFor(p)} title="Options"><Settings2 className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => { if (confirm("Supprimer cet article ?")) { await deleteProduct({ data: { product_id: p.id } }); refresh(); } }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <ProductDialog
        key={editing?.id ?? editing?.menu_section_id ?? "closed"}
        shopId={shopId}
        value={editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSubmit={async (payload) => {
          try {
            if (editing?.id) await updateProduct({ data: { product_id: editing.id, ...payload } as any });
            else await createProduct({ data: { shop_id: editing.shop_id, menu_section_id: editing.menu_section_id, ...payload } as any });
            setEditing(null); refresh();
          } catch (e: any) { toast.error(e.message); }
        }}
      />

      <ProductOptionsDialog product={optionsFor} onOpenChange={(o) => { if (!o) setOptionsFor(null); }} onChanged={refresh} />
    </div>
  );
}

/* ----------------------------- Options d'un article (taille, suppléments...) ----------------------------- */
function ProductOptionsDialog({ product, onOpenChange, onChanged }: { product: any | null; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  const createOption = useServerFn(ownerCreateProductOption);
  const deleteOption = useServerFn(ownerDeleteProductOption);
  const updateOption = useServerFn(ownerUpdateProductOption);
  const createChoice = useServerFn(ownerCreateOptionChoice);
  const deleteChoice = useServerFn(ownerDeleteOptionChoice);
  const [newOptionName, setNewOptionName] = useState("");
  const [newChoice, setNewChoice] = useState<Record<string, { name: string; price: string }>>({});

  if (!product) return null;
  const options = product.options ?? [];

  const addOption = async () => {
    if (!newOptionName.trim()) return;
    await createOption({ data: { product_id: product.id, name: newOptionName.trim(), type: "single", required: false, sort_order: options.length } });
    setNewOptionName(""); onChanged();
  };
  const addChoice = async (optionId: string) => {
    const draft = newChoice[optionId];
    if (!draft?.name.trim()) return;
    await createChoice({ data: { option_id: optionId, name: draft.name.trim(), price_delta_usd: Number(draft.price || 0) } });
    setNewChoice((s) => ({ ...s, [optionId]: { name: "", price: "" } }));
    onChanged();
  };

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Options — {product.name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Ex: "Taille" (Petit/Moyen/Grand) ou "Suppléments" (Fromage +$1, Bacon +$2).</p>
        <div className="space-y-4">
          {options.map((opt: any) => (
            <div key={opt.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{opt.name}</p>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={!!opt.required} onCheckedChange={async (v) => { await updateOption({ data: { option_id: opt.id, required: v } }); onChanged(); }} /> Obligatoire
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Multi-choix
                    <Switch checked={opt.type === "multi"} onCheckedChange={async (v) => { await updateOption({ data: { option_id: opt.id, type: v ? "multi" : "single" } }); onChanged(); }} />
                  </label>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={async () => { await deleteOption({ data: { option_id: opt.id } }); onChanged(); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 space-y-1.5">
                {(opt.choices ?? []).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span>{c.name} {Number(c.price_delta_usd) !== 0 && <span className="text-muted-foreground">({c.price_delta_usd > 0 ? "+" : ""}{Number(c.price_delta_usd).toFixed(2)}$)</span>}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={async () => { await deleteChoice({ data: { choice_id: c.id } }); onChanged(); }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <Input placeholder="Nom (ex: Grand)" value={newChoice[opt.id]?.name ?? ""} onChange={(e) => setNewChoice((s) => ({ ...s, [opt.id]: { name: e.target.value, price: s[opt.id]?.price ?? "" } }))} className="h-8 text-sm" />
                <Input placeholder="+$" type="number" step="0.01" value={newChoice[opt.id]?.price ?? ""} onChange={(e) => setNewChoice((s) => ({ ...s, [opt.id]: { name: s[opt.id]?.name ?? "", price: e.target.value } }))} className="h-8 w-20 text-sm" />
                <Button size="sm" variant="outline" onClick={() => addChoice(opt.id)}>Ajouter</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t pt-3">
          <Input placeholder="Nouvelle option (ex: Taille)" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} />
          <Button variant="outline" onClick={addOption}><Plus className="h-4 w-4" /> Ajouter</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// `key={...}` sur le parent (ci-dessus) force un remount complet du dialogue à
// chaque ouverture — l'état contrôlé ci-dessous repart donc toujours propre,
// pas de valeur d'un article précédent qui traîne.
function ProductDialog({ shopId, value, onOpenChange, onSubmit }: { shopId: string; value: any | null; onOpenChange: (o: boolean) => void; onSubmit: (payload: any) => void }) {
  const [form, setForm] = useState({
    name: value?.name ?? "",
    description: value?.description ?? "",
    price_usd: value?.price_usd != null ? String(value.price_usd) : "",
    image_url: value?.image_url ?? "",
    is_popular: value?.is_popular ?? false,
    is_new: value?.is_new ?? false,
  });
  const open = !!value;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "Modifier l'article" : "Nouvel article"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
          <div><Label className="text-xs">Prix (USD)</Label><Input type="number" step="0.01" value={form.price_usd} onChange={(e) => setForm({ ...form, price_usd: e.target.value })} className="mt-1" /></div>
          <ImageUploadField label="Photo" shopId={shopId} folder="products" value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_popular} onCheckedChange={(v) => setForm({ ...form, is_popular: v })} /> Populaire</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_new} onCheckedChange={(v) => setForm({ ...form, is_new: v })} /> Nouveau</label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!form.name.trim() || !form.price_usd) { toast.error("Nom et prix sont requis."); return; }
              onSubmit({
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                price_usd: Number(form.price_usd),
                image_url: form.image_url.trim() || undefined,
                is_popular: form.is_popular,
                is_new: form.is_new,
              });
            }}
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Réglages ----------------------------- */
function SettingsTab({ shop }: { shop: any }) {
  const save = useServerFn(ownerUpdateShop);
  const cfg = shop.config ?? {};
  const [form, setForm] = useState({
    name: shop.name ?? "", description: shop.description ?? "",
    logo_url: shop.logo_url ?? "", cover_url: shop.cover_url ?? "", whatsapp_display: shop.whatsapp_display ?? "",
  });
  const [address, setAddress] = useState(cfg.address ?? "");
  const [etaMin, setEtaMin] = useState(cfg.delivery_eta_min != null ? String(cfg.delivery_eta_min) : "");
  const [etaMax, setEtaMax] = useState(cfg.delivery_eta_max != null ? String(cfg.delivery_eta_max) : "");
  const [feeLabel, setFeeLabel] = useState(cfg.delivery_fee_label ?? "");
  const [hours, setHours] = useState<Record<string, { open: string; close: string; closed: boolean }>>(() => {
    const h: any = {};
    for (const k of ORDERED_DAY_KEYS) {
      const d = cfg.hours?.[k];
      h[k] = d ? { open: d.open, close: d.close, closed: false } : { open: "09:00", close: "21:00", closed: !cfg.hours };
    }
    return h;
  });
  const [partialEnabled, setPartialEnabled] = useState(!!cfg.partial_payment?.enabled);
  const [partialPercentages, setPartialPercentages] = useState<number[]>(cfg.partial_payment?.percentages ?? [25, 50, 100]);
  const [busy, setBusy] = useState(false);

  const togglePercent = (p: number) => setPartialPercentages((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b));

  const onSave = async () => {
    setBusy(true);
    try {
      const hoursOut: Record<string, { open: string; close: string } | null> = {};
      for (const k of ORDERED_DAY_KEYS) hoursOut[k] = hours[k].closed ? null : { open: hours[k].open, close: hours[k].close };
      await save({
        data: {
          ...form,
          config: {
            ...cfg,
            address: address.trim() || undefined,
            delivery_eta_min: etaMin ? Number(etaMin) : undefined,
            delivery_eta_max: etaMax ? Number(etaMax) : undefined,
            delivery_fee_label: feeLabel.trim() || undefined,
            hours: hoursOut,
            partial_payment: { enabled: partialEnabled, percentages: partialPercentages.length ? partialPercentages : [100] },
          },
        },
      });
      toast.success("Boutique mise à jour");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-3">
        <h3 className="font-display font-bold">Identité</h3>
        <div><Label className="text-xs">Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
        <ImageUploadField label="Logo" shopId={shop.id} folder="logo" value={form.logo_url} onChange={(url) => setForm({ ...form, logo_url: url })} />
        <ImageUploadField label="Photo de couverture" shopId={shop.id} folder="cover" value={form.cover_url} onChange={(url) => setForm({ ...form, cover_url: url })} />
        <div><Label className="text-xs">WhatsApp affiché aux clients</Label><Input value={form.whatsapp_display} onChange={(e) => setForm({ ...form, whatsapp_display: e.target.value })} placeholder="243..." className="mt-1" /></div>
        <div><Label className="text-xs">Adresse</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Quartier, avenue, repère..." className="mt-1" /></div>
      </div>

      <div className="space-y-3">
        <h3 className="font-display font-bold">Livraison</h3>
        <div className="flex gap-3">
          <div className="flex-1"><Label className="text-xs">Temps min (min)</Label><Input type="number" value={etaMin} onChange={(e) => setEtaMin(e.target.value)} className="mt-1" /></div>
          <div className="flex-1"><Label className="text-xs">Temps max (min)</Label><Input type="number" value={etaMax} onChange={(e) => setEtaMax(e.target.value)} className="mt-1" /></div>
        </div>
        <div><Label className="text-xs">Frais de livraison (affiché aux clients)</Label><Input value={feeLabel} onChange={(e) => setFeeLabel(e.target.value)} placeholder="Ex: Gratuite, ou $1.00" className="mt-1" /></div>
      </div>

      <div className="space-y-2">
        <h3 className="font-display font-bold">Horaires</h3>
        {ORDERED_DAY_KEYS.map((k) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-sm">{DAY_LABELS[k]}</span>
            <Switch checked={!hours[k].closed} onCheckedChange={(v) => setHours((s) => ({ ...s, [k]: { ...s[k], closed: !v } }))} />
            {!hours[k].closed ? (
              <>
                <Input type="time" value={hours[k].open} onChange={(e) => setHours((s) => ({ ...s, [k]: { ...s[k], open: e.target.value } }))} className="h-8 w-28" />
                <span className="text-muted-foreground text-xs">à</span>
                <Input type="time" value={hours[k].close} onChange={(e) => setHours((s) => ({ ...s, [k]: { ...s[k], close: e.target.value } }))} className="h-8 w-28" />
              </>
            ) : <span className="text-xs text-muted-foreground">Fermé</span>}
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="font-display font-bold">Paiement partiel (FlexPay)</h3>
        <label className="flex items-center gap-2 text-sm"><Switch checked={partialEnabled} onCheckedChange={setPartialEnabled} /> Autoriser le client à payer un acompte</label>
        {partialEnabled && (
          <div className="flex gap-2">
            {[25, 50, 100].map((p) => (
              <label key={p} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm">
                <input type="checkbox" checked={partialPercentages.includes(p)} onChange={() => togglePercent(p)} /> {p}%
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">Le reste est payé cash à la livraison. 100% doit toujours être proposé.</p>
      </div>

      <Button onClick={onSave} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
    </div>
  );
}
