import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

const UserIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
);
const TruckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-5h-7v7Z"/><path d="M16 8h4.5l2.5 3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
);
const CreditCardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
);

export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

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

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newDetails = {
        full_name: personal.full_name,
        phone_number: personal.phone,
        email: personal.email,
        company: personal.company,
        siret: personal.siret,
        address: personal.address,
        vehicle_model: vehicle.model,
        vehicle_plate: vehicle.plate,
        vehicle_type: vehicle.type,
        iban: bank.iban,
        bic: bank.bic,
      };

      const { error } = await supabase
        .from("profiles")
        .update({ details: newDetails })
        .eq("id", user.id);

      if (error) throw error;
      
      setIsEditing(false);
      alert("Profil mis à jour avec succès !");
    } catch (err) {
      console.error("Error updating profile:", err);
      alert("Erreur lors de la mise à jour du profil : " + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

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
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-100/50 px-4 py-3 flex items-center justify-between backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-black tracking-[0.1em] uppercase text-slate-800">Profil</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-4 mt-4 rounded-[26px] border border-slate-200/70 bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-xl font-semibold text-white uppercase shadow-lg shadow-slate-900/20">
                {personal.full_name ? personal.full_name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase() : "1C"}
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-900">{personal.full_name || "Chauffeur"}</div>
                <div className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {isOnline ? "En ligne" : "Hors ligne"}
                </div>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors border border-slate-100"
              >
                <EditIcon />
                Modifier
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 mx-4">
          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <UserIcon />
                Informations personnelles
              </div>
              {!isEditing && (
                <Link to="/chat" className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">Support</Link>
              )}
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nom complet</span>
                {isEditing ? (
                  <input
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right"
                    value={personal.full_name}
                    onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })}
                  />
                ) : (
                  <span className="font-semibold text-slate-900">{personal.full_name}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Téléphone</span>
                {isEditing ? (
                  <input
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right"
                    value={personal.phone}
                    onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                  />
                ) : (
                  <span className="font-semibold text-slate-900">{personal.phone}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-semibold text-slate-400">{personal.email}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <TruckIcon />
                Véhicule
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Modèle</span>
                {isEditing ? (
                  <input
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right"
                    value={vehicle.model}
                    onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
                    placeholder="Ex: Renault Master"
                  />
                ) : (
                  <span className="font-semibold text-slate-900">{vehicle.model || "—"}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Immatriculation</span>
                {isEditing ? (
                  <input
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right"
                    value={vehicle.plate}
                    onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })}
                    placeholder="Ex: AA-123-BB"
                  />
                ) : (
                  <span className="font-semibold text-slate-900">{vehicle.plate || "—"}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Type</span>
                {isEditing ? (
                  <select
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right bg-transparent"
                    value={vehicle.type}
                    onChange={(e) => setVehicle({ ...vehicle, type: e.target.value })}
                  >
                    <option value="">Sélectionner</option>
                    <option value="Moto">Moto</option>
                    <option value="Voiture">Voiture</option>
                    <option value="Petit Van">Petit Van</option>
                    <option value="Grand Van">Grand Van</option>
                    <option value="Camion">Camion</option>
                  </select>
                ) : (
                  <span className="font-semibold text-slate-900">{vehicle.type || "—"}</span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <CreditCardIcon />
                Informations bancaires
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">IBAN</span>
                {isEditing ? (
                  <input
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right font-mono text-xs"
                    value={bank.iban}
                    onChange={(e) => setBank({ ...bank, iban: e.target.value.toUpperCase().replace(/\s/g, '') })}
                    placeholder="FR76..."
                  />
                ) : (
                  <span className="font-semibold text-slate-900 font-mono tracking-tighter">{bank.iban || "—"}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">BIC</span>
                {isEditing ? (
                  <input
                    className="font-semibold text-slate-900 border-b border-slate-200 focus:border-blue-500 outline-none text-right font-mono"
                    value={bank.bic}
                    onChange={(e) => setBank({ ...bank, bic: e.target.value.toUpperCase() })}
                    placeholder="XXXX..."
                  />
                ) : (
                  <span className="font-semibold text-slate-900">{bank.bic || "—"}</span>
                )}
              </div>
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 text-center uppercase tracking-wide"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="flex-2 rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white text-center uppercase tracking-wide disabled:opacity-50"
              >
                {saveLoading ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          )}
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

    </div>
  );
}
