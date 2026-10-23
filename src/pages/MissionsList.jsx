import { countPoints } from "../lib/missionPoints";
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

  const isToAccept = (m) => m.type !== 'navette' && (m.status === 'assigned' || m.status === 'confirmee');
  const toAccept = missions.filter(isToAccept);
  const ongoing = missions.filter((m) => !isToAccept(m));

  const renderCard = (m) => {
    const isNavette = m.type === 'navette';
    const needsAccept = isToAccept(m);
    const pickupName = isNavette ? m.name : (m.pickup_name || m.pickup?.title || "—");
    const pickupAddr = isNavette ? m.pickup_address : (m.pickup_address || m.pickup?.address1 || "—");
    const deliveryName = isNavette ? "Navette" : (m.delivery_name || m.delivery?.title || "—");
    const deliveryAddr = isNavette ? m.dropoff_address : (m.dropoff_address || m.delivery_address || m.delivery?.address1 || "—");
    const pickupTime = isNavette ? m.start_time : m.scheduled_at;
    const deliveryTime = isNavette ? m.end_time : m.delivery_deadline;
    const label = isNavette ? "Navette" : statusTitle(m.status);
    const stops = Array.isArray(m.stops) ? m.stops : [];

    return (
      <Link
        key={m.id}
        to={`/missions/${m.id}`}
        className={`block overflow-hidden rounded-xl border bg-paper-card shadow-sm active:scale-[0.99] transition-transform ${
          needsAccept ? "border-accent ring-1 ring-accent/30" : "border-line"
        }`}
      >
        {/* Bandeau statut */}
        <div className={`flex items-center justify-between px-4 py-2.5 ${needsAccept ? "bg-accent text-white" : "bg-ink text-white"}`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${needsAccept ? "bg-[#ffffff] animate-pulse" : "bg-accent"}`} />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">{label}</span>
          </div>
          <span className="font-mono text-[11px] opacity-70">#{m.id.slice(0, 6)}</span>
        </div>

        {/* Trajet */}
        <div className="flex gap-3 px-4 pt-4 pb-3">
          <div className="flex flex-col items-center pt-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-paper-card" />
            <span className="my-1 w-px flex-1 bg-line" />
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
          </div>

          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-label">Enlèvement</span>
                <span className="font-mono text-sm font-semibold text-ink">{formatTime(pickupTime)}</span>
              </div>
              <p className="mt-0.5 text-[15px] font-bold leading-tight text-ink line-clamp-1">{pickupName}</p>
              <p className="mt-0.5 text-xs text-muted line-clamp-2">{pickupAddr}</p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-label">Livraison</span>
                <span className="font-mono text-sm font-semibold text-accent-dark">{formatTime(deliveryTime)}</span>
              </div>
              <p className="mt-0.5 text-[15px] font-bold leading-tight text-ink line-clamp-1">{deliveryName}</p>
              <p className="mt-0.5 text-xs text-muted line-clamp-2">{deliveryAddr}</p>
            </div>

            {stops.length > 0 && (
              <div className="rounded-lg bg-accent/10 px-3 py-2">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-dark">
                  + {stops.length} étape{stops.length > 1 ? "s" : ""} en plus · {countPoints(m)} points
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className={`text-sm font-bold ${needsAccept ? "text-accent-dark" : "text-ink"}`}>
            {needsAccept ? "Voir et accepter" : "Ouvrir la mission"}
          </span>
          <svg className="h-4 w-4 text-label" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="relative sticky top-0 z-30 bg-paper-card/95 border-b border-line px-4 py-3.5 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold tracking-tight text-ink">Missions</h1>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "calc(50% + env(safe-area-inset-top, 0px) / 2)" }}>
          <OnlineSwitch />
        </div>
      </header>

      <main className="flex-1 px-4 pt-5 pb-6">
        {loading && missions.length === 0 ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl border border-line bg-paper-card" />
            ))}
          </div>
        ) : missions.length === 0 ? (
          <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-line bg-paper-card px-6 py-12 text-center">
            <div className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent/10" />
              <svg className="relative h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <p className="text-base font-bold text-ink">En attente de missions</p>
            <p className="mt-1.5 max-w-[16rem] text-sm text-muted">
              Restez en ligne : vos courses apparaîtront ici dès qu'elles vous sont assignées.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {toAccept.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-dark">À accepter</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{toAccept.length}</span>
                </div>
                {toAccept.map(renderCard)}
              </section>
            )}

            {ongoing.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-label">En cours</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-white">{ongoing.length}</span>
                </div>
                {ongoing.map(renderCard)}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
