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

    async function syncStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('drivers')
          .select('status')
          .eq('auth_id', user.id)
          .single();

        if (!error && data) {
          const isOnline = data.status !== 'hors_service';
          setOnline(isOnline);
          localStorage.setItem(KEY, String(isOnline));
        }

        channel = supabase
          .channel(`driver_status_sw_${user.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'drivers',
            filter: `auth_id=eq.${user.id}`
          }, (payload) => {
            const newStatus = payload.new.status !== 'hors_service';
            setOnline(newStatus);
            localStorage.setItem(KEY, String(newStatus));
          })
          .subscribe();
      }
      setLoading(false);
    }
    syncStatus();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const toggleStatus = async (newVal) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (newVal === false) {
      const { count, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', user.id)
        .not('status', 'in', '("delivered","cancelled","livree","annulee")');

      if (!countError && count > 0) {
        alert(`Vous avez ${count} mission(s) en cours. Terminez vos missions avant de vous mettre hors ligne.`);
        return;
      }
    }

    setOnline(newVal);
    localStorage.setItem(KEY, String(newVal));

    const { error: updateError } = await supabase
      .from('drivers')
      .update({ status: newVal ? 'disponible' : 'hors_service' })
      .eq('auth_id', user.id);

    if (updateError) {
      console.error("Failed to update status:", updateError);
      alert("Erreur lors de la mise à jour du statut: " + updateError.message);
    }
  };

  if (loading) return null;

  return (
    <div className="flex items-center gap-3">
      <label className="oc-switch-wrap" title={online ? "En ligne" : "Hors ligne"}>
        <span className={`oc-switch-label ${online ? "text-emerald-600" : "text-gray-400"}`}>
          {online ? "EN LIGNE" : "HORS LIGNE"}
        </span>
        <span className="oc-switch transition-all duration-300">
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
    </div>
  );
}
