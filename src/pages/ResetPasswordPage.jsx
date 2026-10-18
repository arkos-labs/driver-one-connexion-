import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import ThemedLogo from "../components/ThemedLogo.jsx";

const INPUT =
  "w-full rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink outline-none placeholder:text-label focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all";

function friendlyError(message) {
  const m = String(message || "");
  if (/same|different from the old/i.test(m)) return "Choisissez un mot de passe différent de l'ancien.";
  if (/weak|at least|characters/i.test(m)) return "Mot de passe trop faible : 8 caractères minimum.";
  return "Modification impossible : " + m;
}

// Écran « Nouveau mot de passe » : s'ouvre depuis le lien reçu par e-mail (la session de réinitialisation est déjà active).
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState("checking"); // checking | form | expired | done
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const onEvent = (e) => alive && setState(e.detail?.ok ? "form" : "expired");
    window.addEventListener("oc-recovery", onEvent);

    // Session déjà prête (le lien a été traité avant l'ouverture de cet écran) ?
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (alive && session) setState((s) => (s === "checking" ? "form" : s));
    });
    // Sinon, on laisse quelques secondes au lien pour arriver
    const timer = setTimeout(() => alive && setState((s) => (s === "checking" ? "expired" : s)), 8000);

    return () => {
      alive = false;
      window.removeEventListener("oc-recovery", onEvent);
      clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError("Le mot de passe doit faire au moins 8 caractères.");
    if (password !== confirm) return setError("Les deux mots de passe ne sont pas identiques.");
    setSaving(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) return setError(friendlyError(err.message));
    setState("done");
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-paper-card p-6 shadow-sm">
          <div className="mb-6 text-center">
            <ThemedLogo alt="One Connexion" className="mx-auto mb-2 h-24 w-24" />
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">One Connexion</div>
            <h1 className="mt-2 text-2xl font-bold">Nouveau mot de passe</h1>
          </div>

          {state === "checking" && (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
              Vérification du lien…
            </div>
          )}

          {state === "expired" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
                Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.
              </div>
              <Link to="/forgot-password" className="block w-full rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform">
                Demander un nouveau lien
              </Link>
              <Link to="/login" className="block text-center text-sm font-semibold text-muted active:text-ink">Retour à la connexion</Link>
            </div>
          )}

          {state === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted">Choisissez un nouveau mot de passe (8 caractères minimum).</p>
              {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>}
              <label className="grid gap-1.5">
                <span className="ml-1 text-xs font-semibold text-muted">Nouveau mot de passe</span>
                <input type="password" autoComplete="new-password" className={INPUT} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              <label className="grid gap-1.5">
                <span className="ml-1 text-xs font-semibold text-muted">Confirmer le mot de passe</span>
                <input type="password" autoComplete="new-password" className={INPUT} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </label>
              <button type="submit" disabled={saving} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60">
                {saving ? "Enregistrement…" : "Enregistrer le mot de passe"}
              </button>
            </form>
          )}

          {state === "done" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                Mot de passe modifié. Vous êtes connecté.
              </div>
              <button type="button" onClick={() => navigate("/login", { replace: true })} className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white active:scale-[0.98] transition-transform">
                Continuer
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
