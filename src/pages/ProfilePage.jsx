import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";
import { unregisterNativePush } from "../lib/nativePush";
import { setAppBadge } from "../lib/appBadge";
import { formatIban, isValidBic, isValidIban, maskIban, normalizeBic, normalizeIban } from "../lib/driverProfile";
import { GPS_APPS, getGpsApp, setGpsApp } from "../lib/gps";
import { THEME_MODES, getThemeMode, setThemeMode, sunTimes, formatClock } from "../lib/theme";

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
const CameraIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
);

function Card({ icon, title, hint, children }) {
  return (
    <section className="rounded-xl border border-line bg-paper-card p-5 shadow-sm">
      <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-label">
        {icon}
        {title}
      </div>
      {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0 last:pb-0">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

const INPUT_CLS = "w-44 max-w-full rounded-lg border border-line bg-paper px-3 py-1.5 text-right text-sm font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
const VALUE_CLS = "break-words text-sm font-semibold text-ink";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [gpsApp, setGpsAppState] = useState(() => getGpsApp());
  const [themeMode, setThemeModeState] = useState(() => getThemeMode());
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [personal, setPersonal] = useState({
    full_name: "",
    phone: "",
    email: "",
    company: "",
    siret: "",
    address: "",
    avatar_url: "",
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

      const [{ data: profile, error }, { data: driver }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("drivers").select("*").eq("auth_id", user.id).single(),
      ]);

      if (!error && profile) {
        const meta = user.user_metadata || {};
        const vehicleStr = driver?.vehicle || "";
        const vehicleParts = vehicleStr.split(" — ");

        setPersonal({
          full_name: profile.full_name || meta.full_name || meta.name || "",
          phone: profile.phone || driver?.phone || meta.phone || "",
          email: user.email || "",
          company: profile.company || "",
          siret: profile.siret || "",
          address: profile.billing_address || "",
          avatar_url: meta.avatar_url || "",
        });
        setVehicle({
          model: vehicleParts[0] || "",
          plate: vehicleParts[1] || "",
          type: "",
        });
        setBank({
          iban: formatIban(driver?.iban),
          bic: driver?.bic || "",
        });
        setIsOnline(driver?.status !== 'hors_service');
      }
      setLoading(false);
    }
    getProfile();

    let channel;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        channel = supabase
          .channel(`driver-status-${user.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'drivers',
            filter: `auth_id=eq.${user.id}`
          }, (payload) => {
            if (payload.new) {
              setIsOnline(payload.new.status !== 'hors_service');
            }
          })
          .subscribe();
      }
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaveLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `avatars/${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('delivery-photos')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(fileName);

      // Update local state
      setPersonal(prev => ({ ...prev, avatar_url: publicUrl }));

      // Avatar is stored in user metadata (no avatar column in profiles)
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });

      alert("Photo de profil mise à jour !");
    } catch (err) {
      console.error("Avatar upload error:", err);
      alert("Erreur lors de l'upload de l'avatar : " + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!isValidIban(bank.iban)) throw new Error("IBAN invalide : vérifiez les caractères.");
      if (!isValidBic(bank.bic)) throw new Error("BIC invalide (8 ou 11 caractères).");

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: personal.full_name,
          phone: personal.phone,
        })
        .eq("id", user.id);

      if (profileError) throw profileError;

      const { error: driverError } = await supabase
        .from("drivers")
        .update({
          name: personal.full_name,
          phone: personal.phone,
          vehicle: [vehicle.model, vehicle.plate].filter(Boolean).join(' — '),
          iban: normalizeIban(bank.iban),
          bic: normalizeBic(bank.bic),
        })
        .eq("auth_id", user.id);

      if (driverError) throw driverError;

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

      // Flag that this logout is self-initiated, not admin action
      localStorage.setItem("oc_self_initiated_logout", "true");
      localStorage.setItem("oc_last_status_change_time", String(Date.now()));

      // Marquer le chauffeur comme hors_service avant de déconnecter
      await supabase.from('drivers')
        .update({ status: 'hors_service' })
        .eq('auth_id', user.id);
    }

    await unregisterNativePush();
    await setAppBadge(0);
    await supabase.auth.signOut();
    navigate("/login");
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Supprimer définitivement votre compte et vos données personnelles ? Cette action est irréversible.")) return;
    if (!window.confirm("Dernière confirmation : supprimer mon compte ?")) return;
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error || data?.error) {
        let msg = data?.error;
        if (!msg && error?.context?.json) msg = (await error.context.json().catch(() => null))?.error;
        throw new Error(msg || error?.message || "Erreur inconnue");
      }
      await unregisterNativePush();
      await setAppBadge(0);
      await supabase.auth.signOut();
      navigate("/login");
    } catch (err) {
      alert("Suppression impossible : " + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const initials = personal.full_name
    ? personal.full_name.trim().split(/\s+/).map((n) => n[0]).join("").slice(0, 2)
    : "1C";

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="relative sticky top-0 z-30 bg-paper-card/95 border-b border-line px-4 py-3.5 flex items-center justify-between backdrop-blur-md">
        <h1 className="text-base font-bold tracking-tight text-ink">Profil</h1>
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "calc(50% + env(safe-area-inset-top, 0px) / 2)" }}>
          <OnlineSwitch />
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-6">
        {/* Identité */}
        <div className="rounded-xl bg-ink p-5 text-white shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative shrink-0">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-accent text-xl font-bold text-white">
                  {personal.avatar_url ? (
                    <img src={personal.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="uppercase">{initials}</span>
                  )}
                </div>
                <label className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-paper-card text-ink shadow-sm active:scale-95 transition-transform">
                  <CameraIcon />
                  <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                </label>
              </div>
              <div className="min-w-0">
                <div className="break-words text-lg font-bold leading-tight">{personal.full_name || "Chauffeur"}</div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                  <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-white/40"}`} />
                  <span className={isOnline ? "text-emerald-300" : "text-white/60"}>{isOnline ? "En ligne" : "Hors ligne"}</span>
                </div>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white active:bg-white/20 transition-colors"
              >
                <EditIcon />
                Modifier
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          <Card icon={<UserIcon />} title="Informations personnelles">
            <Row label="Nom complet">
              {isEditing ? (
                <input className={INPUT_CLS} value={personal.full_name} onChange={(e) => setPersonal({ ...personal, full_name: e.target.value })} />
              ) : (
                <span className={VALUE_CLS}>{personal.full_name || "—"}</span>
              )}
            </Row>
            <Row label="Téléphone">
              {isEditing ? (
                <input className={INPUT_CLS} inputMode="tel" value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} />
              ) : (
                <span className={VALUE_CLS}>{personal.phone || "—"}</span>
              )}
            </Row>
            <Row label="Email">
              <span className="break-all text-sm font-semibold text-label">{personal.email || "—"}</span>
            </Row>
          </Card>

          <Card icon={<TruckIcon />} title="Véhicule">
            <Row label="Modèle">
              {isEditing ? (
                <input className={INPUT_CLS} value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} placeholder="Ex: Renault Master" />
              ) : (
                <span className={VALUE_CLS}>{vehicle.model || "—"}</span>
              )}
            </Row>
            <Row label="Immatriculation">
              {isEditing ? (
                <input className={INPUT_CLS} value={vehicle.plate} onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })} placeholder="Ex: AA-123-BB" />
              ) : (
                <span className={VALUE_CLS}>{vehicle.plate || "—"}</span>
              )}
            </Row>
            <Row label="Type">
              {isEditing ? (
                <select className={`${INPUT_CLS} bg-paper`} value={vehicle.type} onChange={(e) => setVehicle({ ...vehicle, type: e.target.value })}>
                  <option value="">Sélectionner</option>
                  <option value="Moto">Moto</option>
                  <option value="Voiture">Voiture</option>
                  <option value="Petit Van">Petit Van</option>
                  <option value="Grand Van">Grand Van</option>
                  <option value="Camion">Camion</option>
                </select>
              ) : (
                <span className={VALUE_CLS}>{vehicle.type || "—"}</span>
              )}
            </Row>
          </Card>

          <Card
            title="Apparence"
            hint={(() => {
              const t = sunTimes();
              return `Automatique : l'app passe en sombre au coucher du soleil (aujourd'hui ${formatClock(t.sunset)}) et revient en clair au lever (${formatClock(t.sunrise)}).`;
            })()}
          >
            <div className="grid grid-cols-3 gap-2">
              {THEME_MODES.map((m) => {
                const active = themeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setThemeMode(m.id); setThemeModeState(m.id); }}
                    className={`rounded-lg border px-2 py-3 text-sm font-semibold transition-colors ${
                      active ? "border-accent bg-accent/10 text-ink" : "border-line bg-paper text-muted active:bg-line"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Application GPS" hint="Touchez une adresse dans une mission : l'itinéraire s'ouvre directement dans cette application.">
            <div className="grid gap-2">
              {GPS_APPS.map((a) => {
                const active = gpsApp === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { setGpsApp(a.id); setGpsAppState(a.id); }}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                      active ? "border-accent bg-accent/10 text-ink" : "border-line bg-paper text-muted active:bg-line"
                    }`}
                  >
                    <span>{a.label}</span>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${active ? "border-accent" : "border-line"}`}>
                      {active && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card icon={<CreditCardIcon />} title="Informations bancaires">
            <Row label="IBAN">
              {isEditing ? (
                <input
                  className={`${INPUT_CLS} font-mono text-xs`}
                  value={bank.iban}
                  onChange={(e) => setBank({ ...bank, iban: formatIban(e.target.value) })}
                  placeholder="FR76..."
                />
              ) : (
                <span className={`${VALUE_CLS} font-mono text-xs`}>{bank.iban ? maskIban(bank.iban) : "—"}</span>
              )}
            </Row>
            <Row label="BIC">
              {isEditing ? (
                <input
                  className={`${INPUT_CLS} font-mono`}
                  value={bank.bic}
                  onChange={(e) => setBank({ ...bank, bic: e.target.value.toUpperCase() })}
                  placeholder="XXXX..."
                />
              ) : (
                <span className={`${VALUE_CLS} font-mono`}>{bank.bic || "—"}</span>
              )}
            </Row>
          </Card>

          {isEditing && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-xl border border-line bg-paper-card px-4 py-3.5 text-sm font-bold text-ink active:bg-line transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="rounded-xl bg-accent px-4 py-3.5 text-sm font-bold text-white shadow-md disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {saveLoading ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-bold text-red-700 active:bg-red-100 transition-colors"
          >
            Se déconnecter
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={deleteLoading}
            className="w-full rounded-xl px-4 py-3 text-xs font-semibold text-muted underline disabled:opacity-50"
          >
            {deleteLoading ? "Suppression…" : "Supprimer mon compte"}
          </button>

          <p className="pb-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-label">One Connexion · Espace chauffeur</p>
        </div>
      </main>
    </div>
  );
}
