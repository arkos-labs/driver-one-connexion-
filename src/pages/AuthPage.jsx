import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("Email ou mot de passe incorrect.");
      setLoading(false);
    } else {
      navigate("/missions");
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a] overflow-hidden">
      <main className="flex min-h-screen items-center justify-center px-4 overflow-hidden">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-center">
            <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-gray-400">One Connexion</div>
            <h1 className="mt-2 text-2xl font-bold">Connexion Chauffeur</h1>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleLogin}>
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 text-center">
                {error}
              </div>
            )}

            <label className="grid gap-1">
              <span className="text-xs font-semibold text-gray-500">Email</span>
              <input
                type="email"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-[#1d283a] focus:outline-none focus:ring-4 focus:ring-gray-100"
                placeholder="chauffeur@one-connexion.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold text-gray-500">Mot de passe</span>
              <input
                type="password"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-[#1d283a] focus:outline-none focus:ring-4 focus:ring-gray-100"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-[#1d283a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-70 transition-all active:scale-[0.98]"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <div className="text-center pt-2">
              <p className="text-sm text-gray-500">
                Pas encore de compte ?{" "}
                <Link to="/register" className="font-bold text-[#1d283a] hover:underline">
                  S'inscrire ici
                </Link>
              </p>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}


