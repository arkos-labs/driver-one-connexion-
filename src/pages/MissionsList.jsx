import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";
import { ensurePushSubscription } from "../lib/push";

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
  const [pushStatus, setPushStatus] = useState('');
  const prevMissionIdsRef = useRef(new Set());

  const testPush = async () => {
    setPushStatus('Test en cours...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPushStatus('Pas connecté'); return; }
    
    const sub = await ensurePushSubscription(user.id);
    if (sub) {
      setPushStatus('✅ Subscription OK - endpoint: ' + sub.endpoint.slice(0, 40) + '...');
    } else {
      setPushStatus('❌ Subscription FAILED - voir console');
    }
  };

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

    console.log("Setting up realtime for missions of user:", user.id);
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
          console.log("Realtime mission event detected:", payload);
          fetchMissions(user);
        }
      )
      .subscribe((status) => {
        console.log("Missions Realtime Status:", status, "for channel", channelName);
        if (status === 'SUBSCRIBED') {
          console.log("Successfully subscribed to realtime updates for missions.");
        }
      });

    return () => {
      console.log("Cleaning up realtime channel:", channelName);
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const handleFocus = () => {
      console.log("App focused, re-fetching missions...");
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
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', u.id)
      .neq('status', 'delivered')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Fetch Missions Error:", error);
    } else if (data) {
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
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-100/50 px-4 py-3 flex items-center justify-between backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="OC" className="h-7 w-7" />
          <h1 className="text-sm font-black tracking-[0.1em] uppercase text-slate-800">Missions</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchMissions()}
            className="p-2 -mr-2 rounded-xl active:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors"
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

      <button 
        onClick={testPush}
        className="mx-4 mt-2 w-[calc(100%-2rem)] bg-orange-500 text-white py-2 rounded-xl text-sm font-bold shadow-sm"
      >
        🔔 Tester Push Subscription
      </button>
      {pushStatus && (
        <p className="mx-4 mt-1 text-xs text-gray-600 break-all">{pushStatus}</p>
      )}

      <main className="flex-1">
        <div className="px-4 py-4 pt-6">
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

    </div>
  );
}
