import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setLoading(true);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'dispatcher') {
          navigate("/admin");
          return;
        }

        if (profileError || profile?.role !== 'courier') {
          // Si on n'est pas courier, on reste sur la page login pour laisser le choix
          setPageLoading(false);
          return;
        }
        navigate("/missions");
      } else {
        setPageLoading(false);
      }
    };
    checkSession();
  }, [navigate]);

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
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError || profile?.role !== 'courier') {
      await supabase.auth.signOut();
      setError("Accès refusé. Cette application est réservée aux coursiers.");
      setLoading(false);
      return;
    }

    navigate("/missions");
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + "/login",
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#f6f7f7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="Logo" className="h-20 w-20 animate-pulse" />
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1d283a] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a] overflow-hidden">
      <main className="flex min-h-screen items-center justify-center px-4 overflow-hidden">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-center mb-6">
            <img src="/logo.svg" alt="One Connexion Logo" className="mx-auto h-24 w-24 mb-2" />
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">One Connexion</div>
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

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">Ou</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#1d283a] transition-all hover:bg-gray-50 active:scale-[0.98] disabled:opacity-70"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.67-.35-1.39-.35-2.09s.13-1.42.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
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


