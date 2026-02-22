import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(true);

  const [personal, setPersonal] = useState({
    full_name: "",
    phone: "",
    email: "",
    company: "",
    siret: "",
    address: "",
  });

  const [vehicle, setVehicle] = useState({
    model: "",
    plate: "",
    type: "",
  });

  const [bank, setBank] = useState({
    iban: "",
    bic: "",
  });

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setUser(user);

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!error && profile) {
        const d = profile.details || {};
        const meta = user.user_metadata || {};

        setPersonal({
          full_name: d.full_name || meta.full_name || meta.name || "",
          phone: d.phone_number || d.phone || meta.phone || "",
          email: d.email || user.email || "",
          company: d.company || meta.company || "",
          siret: d.siret || meta.siret || "",
          address: d.address || "",
        });
        setVehicle({
          model: d.vehicle_model || d.model || "",
          plate: d.vehicle_plate || d.plate || "",
          type: d.vehicle_type || d.type || "",
        });
        setBank({
          iban: d.iban || "",
          bic: d.bic || "",
        });
        setIsOnline(!!profile.is_online);
      }
      setLoading(false);
    }
    getProfile();

    // Realtime listener for status changes (if toggled in header)
    let channel;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        channel = supabase
          .channel(`profile-status-${user.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`
          }, (payload) => {
            if (payload.new && typeof payload.new.is_online !== 'undefined') {
              setIsOnline(payload.new.is_online);
            }
          })
          .subscribe();
      }
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate]);

  const handleSignOut = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('driver_id', user.id)
        .neq('status', 'delivered')
        .neq('status', 'cancelled');

      if (!error && count > 0) {
        alert(`Déconnexion impossible : vous avez encore ${count} mission(s) en cours.`);
        return;
      }
    }

    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          {/* menu removed */}
          <h1 className="text-lg font-bold tracking-tight uppercase">Profil</h1>
        </div>
        <div className="absolute left-1/2 top-2 -translate-x-1/2">
          <OnlineSwitch />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="mx-4 mt-4 rounded-[26px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-xl font-semibold text-white uppercase">
              {personal.full_name ? personal.full_name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase() : "OC"}
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">{personal.full_name || "Chauffeur"}</div>
              <div className="text-sm text-slate-500">Chauffeur • {personal.address || "France"}</div>
              <div className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                ● {isOnline ? "En ligne" : "Hors ligne"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 mx-4">
          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Informations personnelles</div>
              <Link to="/chat" className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">Contact Support</Link>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">Nom complet</span><span className="font-semibold text-slate-900">{personal.full_name}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Téléphone</span><span className="font-semibold text-slate-900">{personal.phone}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Email</span><span className="font-semibold text-slate-900">{personal.email}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Société</span><span className="font-semibold text-slate-900">{personal.company}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">SIRET</span><span className="font-semibold text-slate-900">{personal.siret}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Adresse</span><span className="font-semibold text-slate-900">{personal.address}</span></div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Véhicule</div>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">Modèle</span><span className="font-semibold text-slate-900">{vehicle.model}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Immatriculation</span><span className="font-semibold text-slate-900">{vehicle.plate}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Type</span><span className="font-semibold text-slate-900">{vehicle.type}</span></div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Informations bancaires</div>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-slate-500">IBAN</span><span className="font-semibold text-slate-900 font-mono tracking-tighter">{bank.iban}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">BIC</span><span className="font-semibold text-slate-900">{bank.bic}</span></div>
            </div>
          </div>
          <div className="rounded-[24px] border border-rose-100 bg-rose-50 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <button
              onClick={handleSignOut}
              className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white text-center uppercase tracking-wide"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 app-nav">
        <div className="flex items-center justify-around h-16">
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/missions">
            <span>📋</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Mission</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/map">
            <span>🕓</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Historique</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/chat">
            <span>💬</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Tchat</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-[#1d283a]" to="/profile">
            <span>👤</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Profil</span>
          </Link>
        </div>
        <div className="h-5 bg-white" />
      </nav>
    </div>
  );
}
