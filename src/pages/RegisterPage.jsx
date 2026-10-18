import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import ThemedLogo from "../components/ThemedLogo.jsx";
import AppleButton from "../components/AppleButton.jsx";
import { appleAvailable } from "../lib/appleAuth";
import RememberMeCheckbox from "../components/RememberMeCheckbox.jsx";
import DriverInfoFields from "../components/DriverInfoFields.jsx";
import { joinName, joinVehicle, normalizeBic, normalizeIban, normalizePlate, validateDriverInfo } from "../lib/driverProfile";

export default function RegisterPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [form, setForm] = useState({
        firstName: "", lastName: "",
        phone: "", email: "", password: "",
        model: "", plate: "", iban: "", bic: "",
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
                } else if (profile && (profile.role === 'driver' || profile.role === 'courier')) {
                    navigate("/missions");
                } else {
                    setForm(prev => ({
                        ...prev,
                        email: currentSession.user.email || prev.email,
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
        }).catch((err) => {
            console.error("Erreur getSession:", err);
            if (isMounted) setPageLoading(false);
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

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        setErrorMsg("");
        setSuccessMsg("");

        const problem = validateDriverInfo(form);
        if (problem) {
            setErrorMsg(problem);
            setLoading(false);
            return;
        }

        try {
            let userId = session?.user?.id;

            if (!session) {
                if (!form.email || !form.password) {
                    setErrorMsg("Email et mot de passe requis.");
                    setLoading(false);
                    return;
                }
                if (form.password.length < 6) {
                    setErrorMsg("Le mot de passe doit faire au moins 6 caractères.");
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase.auth.signUp({
                    email: form.email,
                    password: form.password,
                    options: {
                        data: {
                            role: 'driver',
                            full_name: joinName(form.firstName, form.lastName),
                            phone: form.phone,
                        }
                    }
                });

                if (error) throw error;

                userId = data.user?.id;
            }

            if (userId || !session) { // Proceed to create driver profile even if session is missing (depends on RLS, but if email confirm is OFF it works)
                const finalUserId = userId || data?.user?.id;
                const fullName = joinName(form.firstName, form.lastName);
                const vehicle = joinVehicle(form.model, normalizePlate(form.plate));

                if (finalUserId) {
                    const { error: profileError } = await supabase.from('profiles').upsert({
                        id: finalUserId,
                        role: 'driver',
                        full_name: fullName,
                        phone: form.phone,
                    });

                if (profileError) throw profileError;

                const { error: driverError } = await supabase.from('drivers').upsert({
                    auth_id: userId,
                    name: fullName,
                    phone: form.phone.trim(),
                    vehicle,
                    iban: normalizeIban(form.iban),
                    bic: normalizeBic(form.bic),
                    // hors_service tant qu'un administrateur n'a pas validé le compte
                    status: 'hors_service',
                }, { onConflict: 'auth_id' });

                if (driverError) throw driverError;

                setSuccessMsg("Inscription enregistrée ! Un administrateur doit valider votre compte.");
                supabase.auth.signOut();
                setTimeout(() => navigate("/login"), 3000);
                }
            }
        } catch (err) {
            console.error("Erreur Inscription:", err);
            setErrorMsg("Erreur : " + (err.message || "Une erreur inattendue s'est produite."));
        } finally {
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
        <div className="min-h-screen bg-[#F4F2EE] text-[#0E0F10] py-8">
            <main className="max-w-xl mx-auto px-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="text-center mb-6">
                        <ThemedLogo alt="One Connexion Logo" className="mx-auto h-24 w-24 mb-2" />
                        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">One Connexion</div>
                        <h1 className="mt-2 text-2xl font-bold">Inscription Chauffeur</h1>
                        <p className="text-sm text-gray-500 mt-1">Rejoignez notre équipe de coursiers</p>
                    </div>

                    <div className="mb-8">
                        <div className="mb-4"><RememberMeCheckbox /></div>

                        <AppleButton label="S'inscrire avec Apple" onError={setErrorMsg} disabled={loading} />


                        {appleAvailable() && (
                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-gray-200"></span>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-gray-400">Ou remplir le formulaire</span>
                            </div>
                        </div>
                        )}

                        {errorMsg && (
                            <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-600 border border-red-100">
                                {errorMsg}
                            </div>
                        )}
                        
                        {successMsg && (
                            <div className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-600 border border-emerald-100">
                                {successMsg}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleRegister} className="space-y-5">
                        <div className="grid gap-4">
                            <DriverInfoFields value={form} onChange={setForm} />
                            <div className="grid gap-1.5">
                                <span className="text-xs font-semibold text-muted ml-1">Email</span>
                                <input className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink outline-none placeholder:text-label focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all" type="email" placeholder="email@exemple.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                            </div>
                            {!session && (
                                <div className="grid gap-1.5">
                                    <span className="text-xs font-semibold text-gray-500 ml-1">Mot de passe</span>
                                    <input className="rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-[#0E0F10] focus:border-transparent px-4 py-3 text-sm outline-none transition-all" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-accent hover:bg-accent-dark px-4 py-4 text-sm font-bold text-white shadow-lg shadow-gray-200 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
                        >
                            {loading ? "Chargement..." : session ? "Finaliser mon inscription" : "S'inscrire et commencer"}
                        </button>

                        <div className="text-center">
                            <Link to="/login" className="text-sm font-semibold text-gray-500 hover:text-[#0E0F10]">
                                Déjà inscrit ? Se connecter
                            </Link>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
