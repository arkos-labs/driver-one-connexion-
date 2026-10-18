import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import ThemedLogo from "../components/ThemedLogo.jsx";
import DriverInfoFields from "../components/DriverInfoFields.jsx";
import { formatIban, markDriverComplete, normalizePlate, saveDriverInfo, splitName, splitVehicle, validateDriverInfo } from "../lib/driverProfile";

// Écran obligatoire : le chauffeur doit compléter sa fiche avant d'accéder au reste de l'app.
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [value, setValue] = useState({ firstName: "", lastName: "", phone: "", model: "", plate: "", iban: "", bic: "" });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return navigate("/login", { replace: true });
      setUserId(user.id);

      // Préremplit avec ce qui existe déjà (nom Apple/Google, téléphone, etc.)
      const [{ data: profile }, { data: driver }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
        supabase.from("drivers").select("name, phone, vehicle, iban, bic").eq("auth_id", user.id).maybeSingle(),
      ]);
      const meta = user.user_metadata || {};
      const real = (v) => (v && v.trim() && v.trim() !== "Chauffeur" ? v.trim() : "");
      const known = real(driver?.name) || real(profile?.full_name) || real(meta.full_name) || real(meta.name);
      const { firstName, lastName } = splitName(known);
      const { model, plate } = splitVehicle(driver?.vehicle);
      setValue({ firstName, lastName, phone: driver?.phone || profile?.phone || "", model, plate, iban: formatIban(driver?.iban), bic: driver?.bic || "" });
      setReady(true);
    })();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validateDriverInfo(value);
    if (problem) return setError(problem);

    setSaving(true);
    setError("");
    try {
      await saveDriverInfo(userId, { ...value, plate: normalizePlate(value.plate) });
      markDriverComplete(userId);
      navigate("/missions", { replace: true });
    } catch (err) {
      console.error("Onboarding save error:", err);
      setError("Enregistrement impossible : " + (err?.message || "erreur inattendue"));
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-8 text-ink">
      <main className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-line bg-paper-card p-6 shadow-sm">
          <div className="mb-6 text-center">
            <ThemedLogo alt="One Connexion" className="mx-auto mb-2 h-20 w-20" />
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Dernière étape</div>
            <h1 className="mt-2 text-2xl font-bold">Complétez votre profil</h1>
            <p className="mt-1 text-sm text-muted">Ces informations sont obligatoires pour recevoir des courses.</p>
          </div>

          {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <DriverInfoFields value={value} onChange={setValue} />
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-accent px-4 py-4 text-base font-bold text-white shadow-md transition-all active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Valider et continuer"}
            </button>
          </form>

          <button type="button" onClick={handleSignOut} className="mt-4 w-full text-center text-sm font-semibold text-label active:text-ink">
            Se déconnecter
          </button>
        </div>
      </main>
    </div>
  );
}
