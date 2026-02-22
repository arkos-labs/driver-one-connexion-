import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function MapPage() {
  const [doneMissions, setDoneMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('driver_id', user.id)
      .eq('status', 'delivered')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setDoneMissions(data);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* menu removed */}
          <h1 className="text-lg font-bold tracking-tight uppercase">Historique</h1>
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
            <span className="text-xs font-bold tracking-wider uppercase">{doneMissions.length} mission(s)</span>
          </div>
        </div>

        <section className="px-4 space-y-3">
          {doneMissions.map((m) => (
            <div key={m.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-400">{m.id.slice(0, 8)}...</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">Livrée</span>
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col items-center gap-1 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <div className="w-0.5 flex-1 bg-gray-100 min-h-[30px]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>

                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-[#1d283a] line-clamp-1">{m.pickup_name || "Enlèvement"}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{m.pickup_address}</p>
                    <p className="text-xs text-gray-400">{m.pickup_postal_code} {m.pickup_city}</p>
                    <p className="mt-1 text-[10px] font-bold text-blue-500">
                      Enlevé le {formatDateTime(m.picked_up_at)}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-bold text-[#1d283a] line-clamp-1">{m.delivery_name || "Livraison"}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{m.delivery_address}</p>
                    <p className="text-xs text-gray-400">{m.delivery_postal_code} {m.delivery_city}</p>
                    <p className="mt-1 text-[10px] font-bold text-emerald-500">
                      Livré le {formatDateTime(m.updated_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Chargement de l'historique...</div>
          ) : doneMissions.length === 0 && (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-sm text-gray-500">Aucune mission terminée.</div>
          )}
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 app-nav">
        <div className="flex items-center justify-around h-16">
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/missions">
            <span>📋</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Mission</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-[#1d283a]" to="/map">
            <span>🕓</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Historique</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/chat">
            <span>💬</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Tchat</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/profile">
            <span>👤</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Profil</span>
          </Link>
        </div>
        <div className="h-5 bg-white" />
      </nav>
    </div>
  );
}
