import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const KEY = "oc_online_status";

export default function OnlineSwitch() {
  const [online, setOnline] = useState(() => {
    const saved = localStorage.getItem(KEY);
    return saved ? saved === "true" : true;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel;

    const handleGlobalStatusChange = () => {
      const saved = localStorage.getItem(KEY);
      setOnline(saved === "true");
    };

    // Listen to global monitor events (e.g. forced disconnect)
    window.addEventListener("oc_status_change", handleGlobalStatusChange);

    async function syncStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch current status from DB
        const { data, error } = await supabase
          .from('profiles')
          .select('is_online')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setOnline(data.is_online);
          localStorage.setItem(KEY, String(data.is_online));
        }

        // Subscribe to realtime changes (Component Level - for immediate feedback)
        // Note: MissionMonitor also does this globally, but duplicate subscription on same channel key is handled by Supabase or we can rely on one.
        // For safety, we keep this one too or rely on event. 
        // Actually, let's keep it to be sure the switch itself is responsive even if MissionMonitor lags or is different.
        channel = supabase
          .channel(`profile_status_sw_${user.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          }, (payload) => {
            const newStatus = payload.new.is_online;
            setOnline(newStatus);
            localStorage.setItem(KEY, String(newStatus));

            // If forced offline, maybe show a toast or alert?
            // For now, just switching the toggle is what was asked.
          })
          .subscribe();
      }
      setLoading(false);
    }
    syncStatus();

    return () => {
      window.removeEventListener("oc_status_change", handleGlobalStatusChange);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const toggleStatus = async (newVal) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // If trying to go offline, check for active missions
    if (newVal === false) {
      const { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', user.id)
        .neq('status', 'delivered')
        .neq('status', 'cancelled');

      if (!countError && count > 0) {
        alert(`Vous avez ${count} mission(s) en cours. Terminez vos missions avant de vous mettre hors ligne.`);
        return; // Block toggling offline
      }
    }

    // Optimistic update
    setOnline(newVal);
    localStorage.setItem(KEY, String(newVal));

    await supabase
      .from('profiles')
      .update({
        is_online: newVal,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', user.id);
  };

  const [pushStatus, setPushStatus] = useState("checking"); // "checking", "denied", "subscribed", "unsubscribed"

  useEffect(() => {
    async function checkPush() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setPushStatus("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setPushStatus(sub ? "subscribed" : "unsubscribed");
      } catch (err) {
        setPushStatus("error");
      }
    }
    checkPush();
  }, []);

  if (loading) return null;

  return (
    <div className="flex items-center gap-3">
      <label className="oc-switch-wrap" title={online ? "En ligne" : "Hors ligne"}>
        <span className={`oc-switch-label ${online ? "text-emerald-600" : "text-gray-400"}`}>
          {online ? "EN LIGNE" : "HORS LIGNE"}
        </span>
        <span className={`oc-switch transition-all duration-300 ${
          pushStatus === 'subscribed' ? 'ring-2 ring-emerald-400 ring-offset-2' : 
          pushStatus === 'denied' ? 'ring-2 ring-red-400 ring-offset-2' : ''
        }`}>
          <input
            type="checkbox"
            checked={online}
            onChange={(e) => toggleStatus(e.target.checked)}
            aria-label="Statut en ligne"
          />
          <span className="oc-switch__track" />
          <span className="oc-switch__thumb" />
        </span>
      </label>
      
      {/* Small indicator for push status */}
      <div 
        className={`w-2 h-2 rounded-full ${
          pushStatus === 'subscribed' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
          pushStatus === 'denied' ? 'bg-red-500' :
          'bg-gray-500'
        }`}
        title={`Push: ${pushStatus === 'subscribed' ? 'Activé' : pushStatus === 'denied' ? 'Bloqué' : 'Désactivé'}`}
      />
    </div>
  );
}
