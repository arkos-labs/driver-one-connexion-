import { useState } from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "../lib/supabase";
import { RESET_REDIRECT_URL } from "../lib/deepLinks";
import ThemedLogo from "../components/ThemedLogo.jsx";

// Dans l'app : le lien de l'e-mail rouvre l'app. Hors app (navigateur) : page du site One Connexion.
const RESET_PAGE = "https://www.oneconnexion.com/reinitialiser-mot-de-passe";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      setError("Saisissez une adresse e-mail valide.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(clean, { redirectTo: Capacitor.isNativePlatform() ? RESET_REDIRECT_URL : RESET_PAGE });
      if (err) {
        // Trop de demandes : message clair ; les autres erreurs ne révèlent pas si le compte existe
        if (err.status === 429 || /rate|too many|seconds/i.test(err.message)) {
          setError("Trop de demandes. Patientez une minute avant de réessayer.");
          setLoading(false);
          return;
        }
        console.error("Reset password error:", err);
      }
      setSent(true);
    } catch (err) {
      console.error("Reset password error:", err);
      setError("Envoi impossible pour le moment. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-paper-card p-6 shadow-sm">
          <div className="mb-6 text-center">
            <ThemedLogo alt="One Connexion" className="mx-auto mb-2 h-24 w-24" />
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">One Connexion</div>
            <h1 className="mt-2 text-2xl font-bold">Mot de passe oublié</h1>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
                Si un compte existe avec <span className="font-bold">{email.trim()}</span>, un e-mail vient d'être envoyé.
              </div>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
                <li>Ouvrez l'e-mail de One Connexion (pensez à regarder les courriers indésirables).</li>
                <li>Touchez le lien : l'application s'ouvre.</li>
                <li>Choisissez votre nouveau mot de passe, c'est terminé.</li>
              </ol>
              <Link to="/login" className="block w-full rounded-xl bg-accent px-4 py-3 text-center text-sm font-bold text-white active:scale-[0.98] transition-transform">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted">Saisissez l'adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
              {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>}
              <label className="grid gap-1.5">
                <span className="ml-1 text-xs font-semibold text-muted">Email</span>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  placeholder="chauffeur@one-connexion.com"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink outline-none placeholder:text-label focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Envoi…" : "Envoyer le lien"}
              </button>
              <div className="text-center">
                <Link to="/login" className="text-sm font-semibold text-muted active:text-ink">Retour à la connexion</Link>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
