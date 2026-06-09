import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CreditCard, MessageSquare, Copy, CheckCircle2, XCircle, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  adminGetIntegrations, adminSaveIntegrations, adminTestFlexpay, adminTestWhatsapp,
} from "@/lib/integrations.functions";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border bg-muted/40 px-2.5 py-2 text-xs">{value}</code>
        <Button
          type="button" size="sm" variant="outline"
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
          }}
        >
          {copied ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function AdminIntegrationsPanel() {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(adminGetIntegrations);
  const { data, isLoading } = useQuery({ queryKey: ["admin-integrations"], queryFn: () => fetchCfg() });

  if (isLoading) return <div className="h-48 animate-pulse rounded-2xl bg-muted" />;
  if (!data) return null;

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-integrations"] });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-primary" />
        <h3 className="font-display text-lg font-bold">Intégrations & API</h3>
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        Colle ici les identifiants de tes prestataires. Les secrets sont stockés côté serveur et
        ne sont jamais réaffichés en clair. Active l'intégration une fois les champs requis remplis.
      </p>
      <FlexpaySection data={data.flexpay} onSaved={refresh} />
      <WhatsappSection data={data.whatsapp} onSaved={refresh} />
    </div>
  );
}

/* ----------------------------- FlexPay ----------------------------- */
function FlexpaySection({ data, onSaved }: { data: any; onSaved: () => void }) {
  const save = useServerFn(adminSaveIntegrations);
  const test = useServerFn(adminTestFlexpay);
  const [form, setForm] = useState({
    base_url: data.base_url || "https://backend.flexpay.cd/api/rest/v1",
    merchant: data.merchant || "",
    currency: data.currency || "CDF",
    callback_url: data.callback_url || "",
    token: "",
  });
  useEffect(() => {
    setForm((f) => ({ ...f, base_url: data.base_url || f.base_url, merchant: data.merchant || "", currency: data.currency || "CDF", callback_url: data.callback_url || "" }));
  }, [data]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(!!data.enabled);

  const onSave = async (nextEnabled?: boolean) => {
    setBusy(true);
    try {
      const values: Record<string, string> = {
        flexpay_base_url: form.base_url.trim(),
        flexpay_merchant: form.merchant.trim(),
        flexpay_currency: form.currency,
        flexpay_callback_url: form.callback_url.trim(),
      };
      if (form.token.trim()) values.flexpay_token = form.token.trim();
      await save({ data: { section: "flexpay", enabled: nextEnabled ?? enabled, values } });
      if (typeof nextEnabled === "boolean") setEnabled(nextEnabled);
      setForm((f) => ({ ...f, token: "" }));
      toast.success("FlexPay enregistré");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
      // resync le switch si l'activation a été refusée
      onSaved();
    } finally { setBusy(false); }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const r = await test();
      r.ok ? toast.success(`FlexPay : ${r.detail}`) : toast.error(`FlexPay : ${r.detail}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setTesting(false); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[color:var(--brand-dark)]" />
          <div>
            <h4 className="font-display font-bold">FlexPay — Paiement Mobile Money</h4>
            <p className="text-xs text-muted-foreground">M-Pesa · Orange Money · Airtel Money (RDC)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge configured={data.configured} enabled={enabled} />
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-1.5">
            <span className="text-xs font-medium">Actif</span>
            <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => onSave(v)} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div>
          <Label className="text-xs">Code marchand (merchant)</Label>
          <Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="Ex : LIVROTO123" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Token API {data.token_set && <span className="text-primary">· configuré {data.token_masked}</span>}</Label>
          <Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={data.token_set ? "•••••• (laisser vide = inchangé)" : "Colle le token FlexPay"} className="mt-1" autoComplete="off" />
        </div>
        <div>
          <Label className="text-xs">Devise de débit</Label>
          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CDF">CDF (Franc congolais)</SelectItem>
              <SelectItem value="USD">USD (Dollar)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">URL de base de l'API</Label>
          <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">URL de callback (à coller dans ton dashboard FlexPay)</Label>
          <Input value={form.callback_url} onChange={(e) => setForm({ ...form, callback_url: e.target.value })} placeholder={data.suggested_callback_url} className="mt-1" />
          {data.suggested_callback_url && (
            <button type="button" onClick={() => setForm({ ...form, callback_url: data.suggested_callback_url })} className="mt-1 text-[11px] text-primary hover:underline">
              Utiliser l'URL recommandée : {data.suggested_callback_url}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t p-4">
        <Button onClick={() => onSave()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing || !data.configured}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tester la connexion"}
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- WhatsApp ----------------------------- */
function WhatsappSection({ data, onSaved }: { data: any; onSaved: () => void }) {
  const save = useServerFn(adminSaveIntegrations);
  const test = useServerFn(adminTestWhatsapp);
  const [form, setForm] = useState({
    base_url: data.base_url || "https://graph.facebook.com/v21.0",
    phone_number_id: data.phone_number_id || "",
    business_id: data.business_id || "",
    verify_token: data.verify_token || "",
    lang: data.lang || "fr",
    token: "",
    app_secret: "",
  });
  useEffect(() => {
    setForm((f) => ({
      ...f,
      base_url: data.base_url || f.base_url,
      phone_number_id: data.phone_number_id || "",
      business_id: data.business_id || "",
      verify_token: data.verify_token || "",
      lang: data.lang || "fr",
    }));
  }, [data]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(!!data.enabled);

  const onSave = async (nextEnabled?: boolean) => {
    setBusy(true);
    try {
      const values: Record<string, string> = {
        whatsapp_base_url: form.base_url.trim(),
        whatsapp_phone_number_id: form.phone_number_id.trim(),
        whatsapp_business_id: form.business_id.trim(),
        whatsapp_verify_token: form.verify_token.trim(),
        whatsapp_lang: form.lang.trim() || "fr",
      };
      if (form.token.trim()) values.whatsapp_token = form.token.trim();
      if (form.app_secret.trim()) values.whatsapp_app_secret = form.app_secret.trim();
      await save({ data: { section: "whatsapp", enabled: nextEnabled ?? enabled, values } });
      if (typeof nextEnabled === "boolean") setEnabled(nextEnabled);
      setForm((f) => ({ ...f, token: "", app_secret: "" }));
      toast.success("WhatsApp enregistré");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
      onSaved();
    } finally { setBusy(false); }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const r = await test();
      r.ok ? toast.success(`WhatsApp : ${r.detail}`) : toast.error(`WhatsApp : ${r.detail}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setTesting(false); }
  };

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[color:var(--whatsapp,#25D366)]" />
          <div>
            <h4 className="font-display font-bold">WhatsApp Cloud API</h4>
            <p className="text-xs text-muted-foreground">Notifications automatiques aux clients (Meta)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge configured={data.configured} enabled={enabled} />
          <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-1.5">
            <span className="text-xs font-medium">Actif</span>
            <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => onSave(v)} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        <div>
          <Label className="text-xs">Phone Number ID</Label>
          <Input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} placeholder="Ex : 123456789012345" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Access Token {data.token_set && <span className="text-primary">· configuré {data.token_masked}</span>}</Label>
          <Input type="password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder={data.token_set ? "•••••• (laisser vide = inchangé)" : "Token permanent Meta"} className="mt-1" autoComplete="off" />
        </div>
        <div>
          <Label className="text-xs">WhatsApp Business Account ID</Label>
          <Input value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })} placeholder="(optionnel)" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">App Secret {data.app_secret_set && <span className="text-primary">· configuré {data.app_secret_masked}</span>}</Label>
          <Input type="password" value={form.app_secret} onChange={(e) => setForm({ ...form, app_secret: e.target.value })} placeholder={data.app_secret_set ? "•••••• (laisser vide = inchangé)" : "(optionnel — vérif. signature)"} className="mt-1" autoComplete="off" />
        </div>
        <div>
          <Label className="text-xs">Verify Token (webhook)</Label>
          <Input value={form.verify_token} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} placeholder="Choisis une chaîne secrète" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Langue des templates</Label>
          <Input value={form.lang} onChange={(e) => setForm({ ...form, lang: e.target.value })} placeholder="fr" className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <CopyField label="URL du webhook (à coller dans Meta › Configuration › Webhook)" value={data.suggested_webhook_url} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t p-4">
        <Button onClick={() => onSave()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={testing || !data.configured}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tester la connexion"}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ configured, enabled }: { configured: boolean; enabled: boolean }) {
  if (enabled) return <Badge className="border-primary/30 bg-primary/15 text-primary" variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" /> Actif</Badge>;
  if (configured) return <Badge variant="outline"><XCircle className="mr-1 h-3 w-3" /> Configuré, inactif</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Non configuré</Badge>;
}
