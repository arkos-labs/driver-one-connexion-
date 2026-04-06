import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RegisterPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);

    const [form, setForm] = useState({
        firstName: "", lastName: "",
        phone: "", email: "", password: "",
        model: "", plate: "",
        type: "", iban: "", bic: ""
    });

    const [session, setSession] = useState(null);

    useEffect(() => {
        let isMounted = true;

        const checkUser = async (currentSession) => {
            if (!currentSession || !isMounted) return;
            setSession(currentSession);
            
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', currentSession.user.id)
                    .single();

                if (!isMounted) return;

                if (profile?.role === 'admin' || profile?.role === 'super_admin' || profile?.role === 'dispatcher') {
                    navigate("/admin");
                } else if (profile && profile.role === 'courier') {
                    navigate("/missions");
                } else {
                    // Nouvel utilisateur sans profil : remplir le formulaire avec les infos Google
                    const fullName = currentSession.user.user_metadata?.full_name || currentSession.user.user_metadata?.name || "";
                    const nameParts = fullName.trim().split(/\s+/);
                    const firstName = nameParts[0] || "";
                    const lastName = nameParts.slice(1).join(" ") || "";
                    setForm(prev => ({
                        ...prev,
                        email: currentSession.user.email || prev.email,
                        firstName: firstName || prev.firstName,
                        lastName: lastName || prev.lastName,
                    }));
                    setPageLoading(false);
                }
            } catch (e) {
                console.error("Session check error:", e);
                if (isMounted) setPageLoading(false);
            }
        };

        // Vérification initiale immédiate
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                checkUser(session);
            } else {
                if (isMounted) setPageLoading(false);
            }
        });

        // Listener pour les changements d'état
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session && isMounted) {
                await checkUser(session);
            } else if (!session && isMounted) {
                setPageLoading(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, [navigate]);

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin + "/register",
                    skipBrowserRedirect: true,
                },
            });
            if (error) throw error;
            if (data?.url) {
              window.location.assign(data.url);
            } else {
              throw new Error("URL de redirection non trouvée");
            }
        } catch (err) {
            console.error("Google login error:", err);
            alert("Erreur Google : " + err.message);
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            let userId = session?.user?.id;

            if (!session) {
                if (!form.email || !form.password) {
                    alert("Email et mot de passe requis.");
                    setLoading(false);
                    return;
                }
                if (form.password.length < 6) {
                    alert("Le mot de passe doit faire au moins 6 caractères.");
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase.auth.signUp({
                    email: form.email,
                    password: form.password,
                    options: {
                        data: {
                            role: 'courier',
                            full_name: `${form.firstName} ${form.lastName}`.trim(),
                            phone: form.phone,
                        }
                    }
                });

                if (error) throw error;
                userId = data.user?.id;
            }

            if (userId) {
                const { error: upsertError } = await supabase.from('profiles').upsert({
                    id: userId,
                    role: 'courier',
                    details: {
                        full_name: `${form.firstName} ${form.lastName}`.trim(),
                        phone_number: form.phone,
                        email: form.email,
                        vehicle_model: form.model,
                        vehicle_plate: form.plate,
                        vehicle_type: form.type,
                        iban: form.iban,
                        bic: form.bic
                    }
                });
                
                if (upsertError) throw upsertError;
                
                alert("✅ Inscription réussie ! Votre compte est prêt.");
                navigate("/missions");
            }
        } catch (err) {
            alert("Erreur : " + err.message);
        } finally {
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
        <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a] py-8">
            <main className="max-w-xl mx-auto px-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="text-center mb-6">
                        <img src="/logo.svg" alt="One Connexion Logo" className="mx-auto h-24 w-24 mb-2" />
                        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">One Connexion</div>
                        <h1 className="mt-2 text-2xl font-bold">Inscription Chauffeur</h1>
                        <p className="text-sm text-gray-500 mt-1">Rejoignez notre équipe de coursiers</p>
                    </div>

                    <div className="mb-8">
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
                            S'inscrire avec Google
                        </button>

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-gray-200"></span>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-gray-400">Ou remplir le formulaire</span>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-6">
                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Informations Personnelles</h2>
                            <div className="grid gap-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="grid gap-1">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Prénom</span>
                                        <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                                    </div>
                                    <div className="grid gap-1">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Nom</span>
                                        <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="grid gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Numéro de téléphone</span>
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" type="tel" placeholder="06 12 34 56 78" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                                </div>
                                <div className="grid gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Email</span>
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" type="email" placeholder="email@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                                </div>
                                {!session && (
                                    <div className="grid gap-1">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Mot de passe</span>
                                        <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                                    </div>
                                )}
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Véhicule</h2>
                            <div className="grid gap-3">
                                <div className="grid gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Modèle du véhicule</span>
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="ex: Peugeot Partner" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="grid gap-1">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Immatriculation</span>
                                        <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="AA-123-BB" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required />
                                    </div>
                                    <div className="grid gap-1">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">Type de véhicule</span>
                                        <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="ex: Camion 12m³" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Paiement (RIB)</h2>
                            <div className="grid gap-3">
                                <div className="grid gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">IBAN</span>
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-mono uppercase" placeholder="FR76..." value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })} required />
                                </div>
                                <div className="grid gap-1">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase ml-1">BIC</span>
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-mono uppercase" placeholder="BIC" value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value.toUpperCase() })} required />
                                </div>
                            </div>
                        </section>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-[#1d283a] px-4 py-4 text-sm font-bold text-white shadow-lg shadow-gray-200 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
                        >
                            {loading ? "Chargement..." : session ? "Finaliser mon inscription" : "S'inscrire et commencer"}
                        </button>

                        <div className="text-center">
                            <Link to="/login" className="text-sm font-semibold text-gray-500 hover:text-[#1d283a]">
                                Déjà inscrit ? Se connecter
                            </Link>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
