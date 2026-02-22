import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RegisterPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [form, setForm] = useState({
        firstName: "", lastName: "",
        phone: "", email: "", password: "", company: "",
        siret: "", address: "", model: "", plate: "",
        type: "", iban: "", bic: ""
    });

    const searchCompany = async (query) => {
        if (!query || query.length < 3) {
            setSuggestions([]);
            return;
        }

        setSearchLoading(true);
        try {
            const resp = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${query}&per_page=5`);
            const data = await resp.json();
            if (data.results) {
                setSuggestions(data.results.map(r => ({
                    name: r.nom_complet || r.nom_raison_sociale,
                    siret: r.siege?.siret || r.matching_etablissements?.[0]?.siret || "",
                    address: r.siege?.adresse || r.matching_etablissements?.[0]?.adresse || ""
                })));
                setShowSuggestions(true);
            }
        } catch (err) {
            console.error("Search error:", err);
        } finally {
            setSearchLoading(false);
        }
    };

    const onSelectCompany = (s) => {
        setForm({
            ...form,
            company: s.name,
            siret: s.siret,
            address: s.address
        });
        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!form.email || !form.password) return alert("Email et mot de passe requis.");
        if (form.password.length < 6) return alert("Le mot de passe doit faire 6 caractères.");

        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: {
                    data: {
                        role: 'courier',
                        full_name: `${form.firstName} ${form.lastName}`.trim(),
                        phone: form.phone,
                        company: form.company,
                        siret: form.siret,
                    }
                }
            });

            if (error) throw error;

            if (data?.user) {
                await supabase.from('profiles').upsert({
                    id: data.user.id,
                    role: 'courier',
                    details: {
                        full_name: `${form.firstName} ${form.lastName}`.trim(),
                        phone_number: form.phone,
                        company: form.company,
                        siret: form.siret,
                        email: form.email,
                        address: form.address,
                        vehicle_model: form.model,
                        vehicle_plate: form.plate,
                        vehicle_type: form.type,
                        iban: form.iban,
                        bic: form.bic
                    }
                });
                alert("✅ Inscription réussie ! Connectez-vous.");
                navigate("/login");
            }
        } catch (err) {
            alert("Erreur : " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a] py-8">
            <main className="max-w-xl mx-auto px-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                    <div className="text-center mb-6">
                        <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-gray-400">One Connexion</div>
                        <h1 className="mt-2 text-2xl font-bold">Inscription Chauffeur</h1>
                        <p className="text-sm text-gray-500 mt-1">Rejoignez notre équipe de coursiers</p>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-6">
                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-[#1d283a] mb-3">Informations Personnelles</h2>
                            <div className="grid gap-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
                                </div>
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" type="password" placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-[#1d283a] mb-3">Société</h2>
                            <div className="grid gap-3">
                                <div className="relative">
                                    <input
                                        className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                                        placeholder="Nom de l'entreprise (Autocomplete)"
                                        value={form.company}
                                        onChange={(e) => {
                                            setForm({ ...form, company: e.target.value });
                                            searchCompany(e.target.value);
                                        }}
                                        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        required
                                    />
                                    {searchLoading && (
                                        <div className="absolute right-3 top-3.5">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                                        </div>
                                    )}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                                            {suggestions.map((s, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                                                    onClick={() => onSelectCompany(s)}
                                                >
                                                    <div className="text-sm font-bold text-slate-900">{s.name}</div>
                                                    <div className="text-[10px] text-slate-500 truncate">{s.address}</div>
                                                    <div className="text-[10px] text-blue-600 font-mono mt-0.5">SIRET: {s.siret}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm focus:ring-2 focus:ring-blue-100 outline-none font-mono"
                                        placeholder="SIRET (Autocomplete)"
                                        value={form.siret}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\s/g, '');
                                            setForm({ ...form, siret: val });
                                            if (val.length >= 9) searchCompany(val);
                                        }}
                                        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        required
                                    />
                                </div>
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm bg-slate-50" placeholder="Adresse du siège" value={form.address} readOnly />
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-[#1d283a] mb-3">Véhicule</h2>
                            <div className="grid gap-3">
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Modèle du véhicule" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
                                <div className="grid grid-cols-2 gap-2">
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Immatriculation" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} required />
                                    <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm" placeholder="Type (ex: Camion)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xs font-bold uppercase tracking-widest text-[#1d283a] mb-3">Paiement (IBAN)</h2>
                            <div className="grid gap-3">
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-mono" placeholder="FR76..." value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} required />
                                <input className="rounded-xl border border-gray-200 px-3 py-3 text-sm font-mono" placeholder="BIC" value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value })} required />
                            </div>
                        </section>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full rounded-xl bg-[#1d283a] px-4 py-4 text-sm font-bold text-white shadow-lg shadow-gray-200 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
                        >
                            {loading ? "Création du compte..." : "S'inscrire et commencer"}
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
