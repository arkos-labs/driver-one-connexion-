import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";
import { ensurePushSubscription } from "../lib/push";

function statusTitle(status) {
  switch (status) {
    case "pending":
    case "en_attente":
      return "En attente";
    case "assigned":
    case "confirmee":
      return "À accepter";
    case "driver_accepted":
      return "En route";
    case "in_progress":
    case "picked_up":
    case "en_cours":
      return "En cours";
    case "delivered":
    case "livree":
      return "Terminée";
    default:
      return status;
  }
}

function statusColor(status) {
  if (status === "pending" || status === "en_attente") return "text-label border-line bg-paper-card";
  if (status === "assigned" || status === "confirmee") return "text-muted border-line bg-paper-card";
  if (status === "driver_accepted" || status === "accepted") return "text-accent border-accent bg-paper";
  if (status === "picked_up" || status === "in_progress" || status === "en_cours") return "text-accent border-accent bg-paper";
  if (status === "delivered" || status === "livree") return "text-muted border-line bg-paper-card";
  return "text-label border-line bg-paper-card";
}

function statusCard(status) {
  if (status === "assigned" || status === "confirmee") return "bg-paper-card border-l-4 border-l-muted";
  if (status === "driver_accepted" || status === "accepted") return "bg-paper border-l-4 border-l-accent";
  if (status === "picked_up" || status === "in_progress" || status === "en_cours") return "bg-paper border-l-4 border-l-accent";
  return "bg-paper-card";
}

function formatTime(value) {
  if (!value) return "Immédiat";
  try {
    return new Date(value).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function MissionsList() {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const prevMissionIdsRef = useRef(new Set());

  useEffect(() => {
    async function init() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser(authUser);
        await fetchMissions(authUser);
      } else {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (!user) return;

    const channelName = `driver-missions-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
          // Removed filter: `driver_id=eq.${user.id}` to be more robust.
          // RLS already restricts what the user can see.
        },
        (payload) => {
          fetchMissions(user);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'navettes'
        },
        (payload) => {
          fetchMissions(user);
        }
      )
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const handleFocus = () => {
      fetchMissions();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [user]);

  const fetchMissions = async (currentUser = user) => {
    let u = currentUser;
    if (!u) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      u = authUser;
    }
    if (!u) return;

    setLoading(true);
    // Fetch both orders and navettes
    const [ordersResult, navettesResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*')
        .eq('driver_id', u.id)
        .not('status', 'in', '("delivered","cancelled","livree","annulee")')
        .order('created_at', { ascending: false }),
      supabase
        .from('navettes')
        .select('*')
        .eq('driver_id', u.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
    ]);

    if (ordersResult.error) {
      console.error("Fetch Orders Error:", ordersResult.error);
    }

    if (navettesResult.error) {
      console.error("Fetch Navettes Error:", navettesResult.error);
    }

    const orders = ordersResult.data || [];
    const navettes = navettesResult.data || [];

    const todayStr = new Date().toDateString();
    const todayIso = new Date().toISOString().slice(0, 10);
    
    const activeNavettes = navettes.filter(n => {
      // Must be explicitly dispatched today by admin
      if (n.last_dispatch_date !== todayIso) return false;
      
      // Must not be already completed today
      const lastCompleted = n.point_progress?.last_completed_at;
      if (lastCompleted && new Date(lastCompleted).toDateString() === todayStr) {
        return false;
      }
      return true;
    });

    // Combine orders and navettes, add type field
    const combined = [
      ...orders.map(o => ({ ...o, type: 'order' })),
      ...activeNavettes.map(n => ({ ...n, type: 'navette' }))
    ];

    const nextIds = new Set(combined.map(m => m.id));
    const prevIds = prevMissionIdsRef.current;

    // If a mission disappears, it was cancelled or reassigned
    if (prevIds.size > 0) {
      const removed = [...prevIds].filter(id => !nextIds.has(id));
      if (removed.length > 0) {
        alert("Une mission a été annulée ou réassignée.");
      }
    }

    prevMissionIdsRef.current = nextIds;
    setMissions(combined);
    setLoading(false);
  };

  const active = missions;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="relative sticky top-0 z-30 bg-paper-card border-b border-line px-4 py-3 flex items-center justify-between backdrop-blur-md bg-paper-card/90">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-black tracking-[0.1em] uppercase text-ink">Missions</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchMissions()}
            className="p-2 -mr-2 rounded-[2px] active:bg-line text-label hover:text-ink transition-colors"
            title="Rafraîchir"
            disabled={loading}
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24"/>
              <path d="M21 3v9h-9"/>
            </svg>
          </button>
        </div>
      </header>

      <main className="flex-1">
        <div className="px-4 py-4 pt-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[2px] bg-ink/10 text-ink border border-line">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-ink opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-ink" />
            </span>
            <span className="text-sm font-bold tracking-wider uppercase">{active.length} mission(s)</span>
          </div>
        </div>

        <section className="px-4 space-y-3">
          {active.map((m) => {
            const isNavette = m.type === 'navette';
            const pickupName = isNavette ? m.name : (m.pickup_name || m.pickup?.title || "—");
            const pickupAddr = isNavette ? m.pickup_address : (m.pickup_address || m.pickup?.address1 || "—");
            const deliveryName = isNavette ? "Navette" : (m.delivery_name || m.delivery?.title || "—");
            const deliveryAddr = isNavette ? m.dropoff_address : (m.dropoff_address || m.delivery_address || m.delivery?.address1 || "—");
            const pickupTime = isNavette ? m.start_time : m.scheduled_at;
            const deliveryTime = isNavette ? m.end_time : m.delivery_deadline;

            return (
              <Link
                key={m.id}
                to={`/missions/${m.id}`}
                className={`block rounded-xl p-5 shadow-md hover:shadow-lg transition-all border-l-4 ${
                  isNavette
                    ? 'bg-paper-card border-l-accent hover:bg-paper'
                    : m.status === 'assigned'
                      ? 'bg-paper-card border-l-muted hover:bg-paper'
                      : 'bg-paper border-l-accent hover:shadow-xl'
                }`}
              >
                {/* Header avec ID et Status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-label">{m.id.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-xs font-mono text-label">{m.id.slice(0, 8)}</span>
                      {isNavette && <span className="ml-2 text-[9px] font-bold bg-accent/10 text-accent px-2 py-0.5 rounded-full">NAVETTE</span>}
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                    isNavette ? 'bg-accent/5 text-accent border-accent/20' :
                    m.status === 'assigned' ? 'bg-ink/5 text-muted border-line' : 'bg-accent/10 text-accent border-accent/20'
                  }`}>
                    {isNavette ? "Navette" : statusTitle(m.status)}
                  </div>
                </div>

                {/* Trajet avec icônes */}
                <div className="flex gap-4">
                  {/* Timeline */}
                  <div className="flex flex-col items-center gap-0.5 pt-1">
                    <div className="w-2 h-2 rounded-full bg-ink" />
                    <div className="w-0.5 h-12 bg-line" />
                    <div className={`w-2 h-2 rounded-full ${isNavette ? 'bg-accent' : 'bg-ink'}`} />
                  </div>

                  {/* Infos */}
                  <div className="flex-1 space-y-4">
                    {/* ENLÈVEMENT */}
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-label">Enlèvement</p>
                        <span className="text-[10px] font-mono text-label whitespace-nowrap bg-ink/5 px-2 py-0.5 rounded">
                          {formatTime(pickupTime)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-ink line-clamp-1">{pickupName}</p>
                      <p className="text-xs text-muted line-clamp-2">{pickupAddr}</p>
                    </div>

                    {/* LIVRAISON */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-label">Livraison</p>
                        <span className="text-[10px] font-mono text-label whitespace-nowrap bg-accent/10 px-2 py-0.5 rounded text-accent">
                          {formatTime(deliveryTime)}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-ink line-clamp-1">{deliveryName}</p>
                      <p className="text-xs text-muted line-clamp-2">{deliveryAddr}</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}

          {active.length === 0 && (
            <div className="bg-paper-card rounded-[2px] p-4 shadow-sm border border-line text-sm text-muted">Aucune mission.</div>
          )}
        </section>
      </main>

    </div>
  );
}
