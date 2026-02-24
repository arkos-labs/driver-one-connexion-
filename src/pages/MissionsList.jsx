import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

function statusTitle(status) {
  switch (status) {
    case "pending":
      return "En attente";
    case "assigned":
      return "Étape 1 : À Accepter";
    case "driver_accepted":
      return "Étape 1 : En route vers Enlèvement";
    case "in_progress":
    case "picked_up":
      return "Étape 2 : En cours de livraison";
    case "delivered":
      return "Terminée";
    default:
      return status;
  }
}

function statusColor(status) {
  if (status === "pending") return "text-slate-600 border-slate-200 bg-slate-50";
  if (status === "assigned") return "text-blue-600 border-blue-200 bg-blue-50";
  if (status === "driver_accepted" || status === "accepted") return "text-indigo-600 border-indigo-200 bg-indigo-50";
  if (status === "picked_up" || status === "in_progress") return "text-amber-700 border-amber-200 bg-amber-50";
  if (status === "delivered") return "text-emerald-700 border-emerald-200 bg-emerald-50";
  return "text-slate-600 border-slate-200 bg-slate-50";
}

function statusCard(status) {
  if (status === "assigned") return "bg-blue-50 ring-1 ring-blue-100";
  if (status === "driver_accepted" || status === "accepted") return "bg-indigo-50 ring-1 ring-indigo-100";
  if (status === "picked_up" || status === "in_progress") return "bg-amber-50 ring-1 ring-amber-100";
  return "bg-white";
}

function formatTime(value) {
  if (!value) return "—";
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

    const channel = supabase
      .channel(`driver-missions-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        console.log("Mission updated:", payload);
        fetchMissions(); // State user will be used or re-fetched
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMissions = async (currentUser = user) => {
    let u = currentUser;
    if (!u) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      u = authUser;
    }
    if (!u) return;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', u.id)
      .neq('status', 'delivered')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const next = data;
      const nextIds = new Set(next.map(m => m.id));
      const prevIds = prevMissionIdsRef.current;

      // If a mission disappears, it was cancelled or reassigned
      if (prevIds.size > 0) {
        const removed = [...prevIds].filter(id => !nextIds.has(id));
        if (removed.length > 0) {
          alert("Une mission a été annulée ou réassignée.");
        }
      }

      prevMissionIdsRef.current = nextIds;
      setMissions(next);
    }
    setLoading(false);
  };

  const active = missions;

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* menu removed */}
          <h1 className="text-xl font-bold tracking-tight uppercase">Mission</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2" />
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="px-4 py-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1d283a]/10 text-[#1d283a] border border-[#1d283a]/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#1d283a] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1d283a]" />
            </span>
            <span className="text-sm font-bold tracking-wider uppercase">{active.length} mission(s)</span>
          </div>
        </div>

        <section className="px-4 space-y-3">
          {active.map((m) => (
            <Link key={m.id} to={`/missions/${m.id}`} className={`block rounded-xl p-3 shadow-sm border border-gray-100 ${statusCard(m.status)}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-400">{m.id.slice(0, 8)}...</span>
                <span className={`text-sm font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${statusColor(m.status)}`}>
                  {statusTitle(m.status)}
                </span>
              </div>

              <div className="mt-4 flex items-start gap-4">
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <div className="w-0.5 flex-1 bg-gray-200 min-h-[20px]" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold text-[#1d283a] line-clamp-1">{m.pickup_name || m.pickup?.title || "—"}</p>
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {formatTime(m.scheduled_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-1">{m.pickup_address || m.pickup?.address1 || "—"}</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-base font-bold text-[#1d283a] line-clamp-1">{m.delivery_name || m.delivery?.title || "—"}</p>
                      <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                        {formatTime(m.delivery_deadline)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-1">{m.delivery_address || m.delivery?.address1 || "—"}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {active.length === 0 && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-base text-gray-500">Aucune mission.</div>
          )}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 app-nav">
        <div className="flex items-center justify-around h-16">
          <Link className="flex flex-col items-center justify-center gap-0.5 text-[#1d283a]" to="/missions">
            <span>📋</span>
            <span className="text-[12px] font-bold uppercase tracking-tighter">Mission</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/map">
            <span>🕓</span>
            <span className="text-[12px] font-bold uppercase tracking-tighter">Historique</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/chat">
            <span>💬</span>
            <span className="text-[12px] font-bold uppercase tracking-tighter">Tchat</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/profile">
            <span>👤</span>
            <span className="text-[12px] font-bold uppercase tracking-tighter">Profil</span>
          </Link>
        </div>
        <div className="h-5 bg-white" />
      </nav>
    </div>
  );
}
