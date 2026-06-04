import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "customer" | "vendor" | "rider" | "admin";

export function useUserRoles() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async (uid: string | null) => {
      if (!uid) { if (active) { setRoles([]); setUserId(null); setLoading(false); } return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!active) return;
      setUserId(uid);
      setRoles((data ?? []).map((r: any) => r.role as AppRole));
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => load(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => load(s?.user.id ?? null));
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return {
    roles,
    userId,
    loading,
    isSignedIn: !!userId,
    isAdmin: roles.includes("admin"),
    isVendor: roles.includes("vendor"),
    isRider: roles.includes("rider"),
    isCustomer: roles.includes("customer"),
  };
}