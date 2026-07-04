import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Store, Bike, Package, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyAsVendor } from "@/lib/vendor.functions";
import { applyAsRider } from "@/lib/rider.functions";
import { getZones } from "@/lib/dashboard.functions";
import { useI18n } from "@/lib/i18n";

/* ---------------- HOME ---------------- */
export function HomePanel({
  hasVendor,
  hasRider,
  onDone,
}: {
  hasVendor: boolean;
  hasRider: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        to="/catalog"
        className="group rounded-2xl border bg-card p-6 transition hover:border-primary/50 hover:shadow-md"
      >
        <Package className="h-7 w-7 text-primary" />
        <h3 className="mt-3 font-display text-xl font-bold">
          {t("dashboard.home.continueShopping")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("dashboard.home.continueShoppingDesc")}
        </p>
      </Link>

      <Link
        to="/profile"
        className="group rounded-2xl border bg-card p-6 transition hover:border-primary/50 hover:shadow-md"
      >
        <UserCircle2 className="h-7 w-7 text-primary" />
        <h3 className="mt-3 font-display text-xl font-bold">{t("dashboard.home.myProfile")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.home.myProfileDesc")}</p>
      </Link>

      {!hasVendor ? (
        <VendorOnboarding onDone={onDone} />
      ) : (
        <InfoCard
          icon={Store}
          title={t("dashboard.home.isVendor")}
          desc={t("dashboard.home.isVendorDesc")}
        />
      )}

      {!hasRider ? (
        <RiderOnboarding onDone={onDone} />
      ) : (
        <InfoCard
          icon={Bike}
          title={t("dashboard.home.isRider")}
          desc={t("dashboard.home.isRiderDesc")}
        />
      )}
    </div>
  );
}

function InfoCard({ icon: I, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <I className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function VendorOnboarding({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const apply = useServerFn(applyAsVendor);
  const fetchZones = useServerFn(getZones);
  const { data: zonesData } = useQuery({ queryKey: ["zones"], queryFn: () => fetchZones() });
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    shop_name: "",
    whatsapp: "",
    description: "",
    base_zone_id: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({ data: { ...form, base_zone_id: form.base_zone_id || null } });
      toast.success(t("dashboard.home.toast.vendorApplied"));
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
      <Store className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">{t("dashboard.home.becomeVendor")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.home.becomeVendorDesc")}</p>
      <div className="mt-4 space-y-3">
        <div>
          <Label>{t("dashboard.home.shopName")}</Label>
          <Input
            required
            value={form.shop_name}
            onChange={(e) => setForm({ ...form, shop_name: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("dashboard.home.whatsapp")}</Label>
          <Input
            required
            placeholder="+243…"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("dashboard.home.baseZone")}</Label>
          <Select
            value={form.base_zone_id}
            onValueChange={(v) => setForm({ ...form, base_zone_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("dashboard.home.chooseZone")} />
            </SelectTrigger>
            <SelectContent>
              {(zonesData?.zones ?? []).map((z: any) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t("dashboard.home.descriptionOptional")}</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t("dashboard.home.sending") : t("dashboard.home.sendApplication")}
        </Button>
      </div>
    </form>
  );
}

function RiderOnboarding({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const apply = useServerFn(applyAsRider);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    whatsapp: "",
    vehicle: "moto" as "moto" | "velo" | "pied" | "voiture",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apply({ data: form });
      toast.success(t("dashboard.home.toast.riderApplied"));
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-6">
      <Bike className="h-7 w-7 text-primary" />
      <h3 className="mt-3 font-display text-xl font-bold">{t("dashboard.home.becomeRider")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.home.becomeRiderDesc")}</p>
      <div className="mt-4 space-y-3">
        <div>
          <Label>{t("dashboard.home.fullName")}</Label>
          <Input
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("dashboard.home.whatsapp")}</Label>
          <Input
            required
            placeholder="+243…"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
          />
        </div>
        <div>
          <Label>{t("dashboard.home.vehicleLabel")}</Label>
          <Select value={form.vehicle} onValueChange={(v: any) => setForm({ ...form, vehicle: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="moto">{t("dashboard.home.vehicleMoto")}</SelectItem>
              <SelectItem value="velo">{t("dashboard.home.vehicleVelo")}</SelectItem>
              <SelectItem value="pied">{t("dashboard.home.vehiclePied")}</SelectItem>
              <SelectItem value="voiture">{t("dashboard.home.vehicleVoiture")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t("dashboard.home.sending") : t("dashboard.home.applyRider")}
        </Button>
      </div>
    </form>
  );
}
