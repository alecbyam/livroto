// Panneau "Intégrations & API" PAR BOUTIQUE — miroir de AdminIntegrationsPanel.tsx
// (config globale plateforme), branché sur les server functions shop-scoped.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CreditCard, MessageSquare, CheckCircle2, XCircle, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ownerGetShopIntegrations, ownerSaveShopIntegrations, ownerTestShopFlexpay, ownerTestShopWhatsapp,
} from "@/lib/shops/integrations.functions";

export function ShopIntegrationsPanel({ shopId }: { shopId: string }) {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(ownerGetShopIntegrations);
  const { data, isLoading } = useQuery({
    queryKey: ["shop-integrations", shopId],
    queryFn: () => fetchCfg({ data: { shop_id: shopId } }),
  });

  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-muted" />;
  if (!data) return null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["shop-integrations", shopId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-bold">Intégrations de la boutique</h3>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Identifiants propres à cette boutique — jamais partagés avec les autres boutiques Livroto. Stockés côté serveur, jamais réaffichés en clair.
      </p>
      <FlexpaySection shopId={shopId} data={data.flexpay} onSaved={refresh} />
      <WhatsappSection shopId={shopId} data={data.whatsapp} onSaved={refresh} />
    </div>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  if (configured) return <Badge className="border-primary/30 bg-primary/15 text-primary" variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" /> Configuré</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Non configuré</Badge>;
}

function FlexpaySection({ shopId, data, onSaved }: { shopId: string; data: any; onSaved: () => void }) {
  const save = useServerFn(ownerSaveShopIntegrations);
  const test = useServerFn(ownerTestShopFlexpay);
  const [form, setForm] = useState({
    base_url: data.base_url || "https://backend.flexpay.cd/api/rest/v1",
    merchant: data.merchant || "", currency: data.currency || "USD", callback_url: data.callback_url || "", token: "",
  });
  useEffect(() => {
    setForm((f) => ({ ...f, base_url: data.base_url || f.base_url, merchant: data.merchant || "", currency: data.currency || "USD", callback_url: data.callback_url || "" }));
  }, [data]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const onSave = async () => {
    setBusy(true);
    try {
      const values: Record<string, string> = {
        flexpay_base_url: form.base_url.trim(), flexpay_merchant: form.merchant.trim(),
        flexpay_currency: form.currency, flexpay_callback_url: form.callback_url.trim(),
      };
      if (form.token.trim()) values.flexpay_token = form.token.trim();
      await save({ data: { shop_id: shopId, section: "flexpay", values } });
      setForm((f) => ({ ...f, token: "" }));
      toast.success("FlexPay enregistré"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const onTest = async () => {
    setTesting(true);
    try {
      const r = await test({ data: { shop_id: shopId } });
      r.ok ? toast.success(`FlexPay : ${r.detail}`) : toast.error(`FlexPay : ${r.detail}`);
    } catch (e: any) { toast.error(e.message); } finally { setTesting(false); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[color:var(--brand-dark)]" />
          <div><h4 className="font-display font-bold">FlexPay — Paiement Mobile Money</h4><p className="text-xs text-muted-foreground">M-Pesa · Orange Money · Airtel Money (RDC)</p></div>
        </div>
        <StatusBadge configured={data.configured} />
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div><Label className="text-xs">Code marchand (merchant)</Label><Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Token API {data.token_set && <span className="text-primary">· configuré {data.token_masked}</span>}</Label><Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={data.token_set ? "•••••• (laisser vide = inchangé)" : "Colle le token FlexPay"} className="mt-1" autoComplete="off" /></div>
        <div><Label className="text-xs">Devise de débit</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="USD ou CDF" className="mt-1" /></div>
        <div><Label className="text-xs">URL de callback</Label><Input value={form.callback_url} onChange={(e) => setForm({ ...form, callback_url: e.target.value })} className="mt-1" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t p-4">
        <Button onClick={onSave} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
        <Button variant="outline" onClick={onTest} disabled={testing || !data.configured}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tester la connexion"}</Button>
      </div>
    </div>
  );
}

function WhatsappSection({ shopId, data, onSaved }: { shopId: string; data: any; onSaved: () => void }) {
  const save = useServerFn(ownerSaveShopIntegrations);
  const test = useServerFn(ownerTestShopWhatsapp);
  const [form, setForm] = useState({
    base_url: data.base_url || "https://graph.facebook.com/v21.0",
    phone_number_id: data.phone_number_id || "", business_id: data.business_id || "",
    verify_token: data.verify_token || "", lang: data.lang || "fr", token: "", app_secret: "",
  });
  useEffect(() => {
    setForm((f) => ({ ...f, base_url: data.base_url || f.base_url, phone_number_id: data.phone_number_id || "", business_id: data.business_id || "", verify_token: data.verify_token || "", lang: data.lang || "fr" }));
  }, [data]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const onSave = async () => {
    setBusy(true);
    try {
      const values: Record<string, string> = {
        whatsapp_base_url: form.base_url.trim(), whatsapp_phone_number_id: form.phone_number_id.trim(),
        whatsapp_business_id: form.business_id.trim(), whatsapp_verify_token: form.verify_token.trim(), whatsapp_lang: form.lang.trim() || "fr",
      };
      if (form.token.trim()) values.whatsapp_token = form.token.trim();
      if (form.app_secret.trim()) values.whatsapp_app_secret = form.app_secret.trim();
      await save({ data: { shop_id: shopId, section: "whatsapp", values } });
      setForm((f) => ({ ...f, token: "", app_secret: "" }));
      toast.success("WhatsApp enregistré"); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const onTest = async () => {
    setTesting(true);
    try {
      const r = await test({ data: { shop_id: shopId } });
      r.ok ? toast.success(`WhatsApp : ${r.detail}`) : toast.error(`WhatsApp : ${r.detail}`);
    } catch (e: any) { toast.error(e.message); } finally { setTesting(false); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[color:var(--whatsapp,#25D366)]" />
          <div><h4 className="font-display font-bold">WhatsApp Business Cloud API</h4><p className="text-xs text-muted-foreground">Notifications automatiques aux clients de CETTE boutique (Meta)</p></div>
        </div>
        <StatusBadge configured={data.configured} />
      </div>
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        Nécessite un compte Meta Business vérifié pour la boutique. Tant que ces champs sont vides, les clients reçoivent leur confirmation par email/en-app uniquement — aucune erreur, l'intégration reste simplement inactive.
      </p>
      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div><Label className="text-xs">Phone Number ID</Label><Input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} placeholder="Ex : 123456789012345" className="mt-1" /></div>
        <div><Label className="text-xs">Access Token {data.token_set && <span className="text-primary">· configuré {data.token_masked}</span>}</Label><Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={data.token_set ? "•••••• (laisser vide = inchangé)" : "Token permanent Meta"} className="mt-1" autoComplete="off" /></div>
        <div><Label className="text-xs">WhatsApp Business Account ID</Label><Input value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })} placeholder="(optionnel)" className="mt-1" /></div>
        <div><Label className="text-xs">App Secret {data.app_secret_set && <span className="text-primary">· configuré {data.app_secret_masked}</span>}</Label><Input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} placeholder={data.app_secret_set ? "•••••• (laisser vide = inchangé)" : "(optionnel)"} className="mt-1" autoComplete="off" /></div>
        <div><Label className="text-xs">Verify Token (webhook)</Label><Input value={form.verify_token} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} className="mt-1" /></div>
        <div><Label className="text-xs">Langue des templates</Label><Input value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} placeholder="fr" className="mt-1" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t p-4">
        <Button onClick={onSave} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
        <Button variant="outline" onClick={onTest} disabled={testing || !data.configured}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tester la connexion"}</Button>
      </div>
    </div>
  );
}
