import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import ThemedLogo from "../components/ThemedLogo.jsx";
import AppleButton from "../components/AppleButton.jsx";
import { appleAvailable } from "../lib/appleAuth";
import RememberMeCheckbox from "../components/RememberMeCheckbox.jsx";

export default function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState(null);

    useEffect(() => {
      let isMounted = true;
      
      const checkUser = async (currentSession) => {
        if (!currentSession || !isMounted) return;
        
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', currentSession.user.id)
            .single();

          if (!isMounted) return;

          if (profileError || !profile) {
            navigate("/register");
            return;
          }

          if (profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'dispatcher') {
            navigate("/admin");
          } else if ((profile?.role === 'driver' || profile?.role === 'courier')) {
            navigate("/missions");
          } else {
            setPageLoading(false);
          }
        } catch (e) {
          console.error("Session check error:", e);
          if (isMounted) setPageLoading(false);
        }
      };

      // Listener pour les changements d'état (plus robuste pour OAuth mobile)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && isMounted) {
          await checkUser(session);
        } else if (!session && isMounted) {
          setPageLoading(false);
        }
      });

      // Vérification initiale du lien magique ou du hash OAuth
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          checkUser(session);
        } else {
          if (isMounted) setPageLoading(false);
        }
      }).catch((err) => {
        console.error("Erreur getSession:", err);
        if (isMounted) setPageLoading(false);
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        setError("Erreur de connexion : " + error.message);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      if (!profileError && profile?.role === 'admin') {
        navigate("/admin");
        return;
      }

      if (profileError || (profile?.role !== 'driver' && profile?.role !== 'courier')) {
        supabase.auth.signOut();
        setError("Accès refusé. Cette application est réservée aux coursiers.");
        setLoading(false);
        return;
      }

      navigate("/missions");
    } catch (err) {
      console.error("Unexpected error in handleLogin:", err);
      setError("Erreur inattendue : " + err.message);
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen bg-[#F4F2EE] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <ThemedLogo alt="Logo" className="h-20 w-20 animate-pulse" />
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0E0F10] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F2EE] text-[#0E0F10] overflow-hidden">
      <main className="flex min-h-screen items-center justify-center px-4 overflow-hidden">
        <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm relative">
          
          <div className="text-center mb-6">
            <ThemedLogo alt="One Connexion Logo" className="mx-auto h-24 w-24 mb-2" />
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">One Connexion</div>
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
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-[#0E0F10] focus:outline-none focus:ring-4 focus:ring-gray-100"
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
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium text-[#0E0F10] focus:outline-none focus:ring-4 focus:ring-gray-100"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>

            <div className="flex items-center justify-between gap-3">
              <RememberMeCheckbox />
              <Link to="/forgot-password" className="shrink-0 text-sm font-semibold text-accent-dark active:opacity-70">
                Mot de passe oublié ?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-accent hover:bg-accent-dark px-4 py-3 text-sm font-semibold text-white disabled:opacity-70 transition-all active:scale-[0.98]"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            {appleAvailable() && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200"></span>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-400">Ou</span>
                  </div>
                </div>

                
                <AppleButton label="Se connecter avec Apple" onError={setError} disabled={loading} />
              </>
            )}

            <div className="text-center pt-2">
              <p className="text-sm text-gray-500">
                Pas encore de compte ?{" "}
                <Link to="/register" className="font-bold text-[#0E0F10] hover:underline">
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
