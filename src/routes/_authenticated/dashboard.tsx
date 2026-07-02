import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Store, Bike, ShieldCheck, Package, LogOut } from "lucide-react";

import { SiteLayout } from "@/components/livroto/SiteLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

import { getMyOverview } from "@/lib/dashboard.functions";
import { HomePanel } from "@/components/livroto/dashboard/HomePanel";
import { VendorPanel } from "@/components/livroto/dashboard/VendorPanel";
import { RiderPanel } from "@/components/livroto/dashboard/RiderPanel";
import { AdminPanel } from "@/components/livroto/dashboard/AdminPanel";
import { CallMeBotCard } from "@/components/livroto/dashboard/shared";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getMyOverview);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: () => fetchOverview(),
    retry: 2,
    retryDelay: 1000,
  });

  const roles = data?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const hasVendor = !!data?.vendor;
  const hasRider = !!data?.rider;

  const tabs = useMemo(() => {
    const t = [{ id: "home", label: "Accueil", icon: Package }];
    if (hasVendor) t.push({ id: "vendor", label: "Ma boutique", icon: Store });
    if (hasRider) t.push({ id: "rider", label: "Mes livraisons", icon: Bike });
    if (isAdmin) t.push({ id: "admin", label: "Admin", icon: ShieldCheck });
    return t;
  }, [hasVendor, hasRider, isAdmin]);

  const search = Route.useSearch();
  const [active, setActive] = useState<string>(search.tab ?? "home");
  useEffect(() => {
    if (!search.tab) return;
    const allowed = new Set(["home", ...(hasVendor ? ["vendor"] : []), ...(hasRider ? ["rider"] : []), ...(isAdmin ? ["admin"] : [])]);
    if (allowed.has(search.tab)) setActive(search.tab);
  }, [search.tab, hasVendor, hasRider, isAdmin]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  if (isLoading) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-12">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-32 animate-pulse rounded-2xl bg-muted" />
          <div className="mt-3 h-24 animate-pulse rounded-2xl bg-muted" />
        </div>
      </SiteLayout>
    );
  }

  if (error) {
    return (
      <SiteLayout>
        <div className="container mx-auto px-4 py-16 max-w-lg text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 font-display text-2xl font-bold">Erreur de chargement</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {(error as Error).message ?? "Impossible de charger ton espace. Vérifie ta connexion."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => refetch()}
              className="rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Réessayer
            </button>
            <button
              onClick={signOut}
              className="rounded-xl border px-6 py-2.5 text-sm font-semibold text-muted-foreground"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Tableau de bord</p>
            <h1 className="font-display text-3xl font-bold sm:text-4xl">
              Karibu, {data?.profile?.name || "ami"} 👋
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roles.map((r) => (
                <Badge key={r} variant="outline" className="capitalize">{r}</Badge>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Déconnexion
          </Button>
        </div>

        <Tabs value={active} onValueChange={setActive} className="mt-8">
          <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1">
            {tabs.map((t) => {
              const I = t.icon;
              return (
                <TabsTrigger key={t.id} value={t.id} className="gap-2">
                  <I className="h-4 w-4" /> {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="home" className="mt-6">
            <HomePanel
              hasVendor={hasVendor}
              hasRider={hasRider}
              onDone={() => qc.invalidateQueries({ queryKey: ["overview"] })}
            />
            <div className="mt-6">
              <CallMeBotCard
                role="customer"
                currentKey={data?.profile?.callmebot_apikey ?? null}
                currentPhone={data?.profile?.phone ?? null}
              />
            </div>
          </TabsContent>

          {hasVendor && (
            <TabsContent value="vendor" className="mt-6">
              <VendorPanel />
            </TabsContent>
          )}

          {hasRider && (
            <TabsContent value="rider" className="mt-6">
              <RiderPanel />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="admin" className="mt-6">
              <AdminPanel />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </SiteLayout>
  );
}
