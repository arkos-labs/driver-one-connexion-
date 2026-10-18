import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { setAppBadge } from "./appBadge";

const FINAL_STATUSES = '("delivered","cancelled","livree","annulee")';

// Compteurs du chauffeur : messages non lus et courses en cours (à accepter, à enlever ou à livrer).
// Mis à jour en direct, et reportés sur l'icône de l'app (messages + courses).
export function useDriverCounts() {
  const [counts, setCounts] = useState({ unread: 0, active: 0 });

  useEffect(() => {
    let alive = true;
    let channel = null;
    let userId = null;

    const refresh = async () => {
      if (!userId) return;
      const [msgs, orders] = await Promise.all([
        supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("recipient_id", userId).eq("is_admin_message", true).is("read_at", null),
        supabase.from("orders").select("id", { count: "exact", head: true })
          .eq("driver_id", userId).not("status", "in", FINAL_STATUSES),
      ]);
      if (!alive) return;
      const next = { unread: msgs.error ? 0 : msgs.count || 0, active: orders.error ? 0 : orders.count || 0 };
      setCounts(next);
      setAppBadge(next.unread + next.active);
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;
      userId = user.id;
      await refresh();
      channel = supabase
        .channel(`counts-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `recipient_id=eq.${userId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `driver_id=eq.${userId}` }, refresh)
        .subscribe();
    })();

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("oc-unread-refresh", refresh);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("oc-unread-refresh", refresh);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return counts;
}
