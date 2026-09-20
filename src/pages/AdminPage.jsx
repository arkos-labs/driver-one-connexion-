import { useState, useEffect, useRef } from "react";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { supabase } from "../lib/supabase";

const DRIVERS_KEY = "oc_admin_drivers";
const ADMIN_ROLES = ['admin', 'super_admin', 'dispatcher'];

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showDrivers, setShowDrivers] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newChatMsg, setNewChatMsg] = useState("");
  const chatScrollRef = useRef(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    password: "",
    company: "",
    siret: "",
    address: "",
    model: "",
    plate: "",
    type: "",
    iban: "",
    bic: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setAuthLoading(false); return; }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      if (!cancelled) {
        setAuthed(ADMIN_ROLES.includes(profile?.role));
        setAuthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [toast, setToast] = useState(null);

  const triggerToast = (content, senderName) => {
    setToast({ content, senderName });
    if (window._toastTimeout2) clearTimeout(window._toastTimeout2);
    window._toastTimeout2 = setTimeout(() => setToast(null), 5000);
  };

  const sendPushToDriver = async (driverId, orderId, pickupName, deliveryName) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-mission-push', {
        body: {
          user_id: driverId,
          title: '📦 Nouvelle mission assignée !',
          body: `${pickupName || 'Enlèvement'} → ${deliveryName || 'Livraison'}`,
          url: `/missions/${orderId}`,
        },
      });
      if (error) console.error('Push error:', error);
    } catch (err) {
      console.error('sendPushToDriver error:', err);
    }
  };

  const assignOrder = async (orderId, driverId) => {
    if (!orderId || !driverId) return;
    
    // Find order data for the push notification
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const { error } = await supabase
      .from('orders')
      .update({ 
        driver_id: driverId,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        viewed_at: null,
        notification_count: 0
      })
      .eq('id', orderId);

    if (error) {
      alert("Erreur lors de l'assignation : " + error.message);
    } else {
      // Trigger push notification (now handled by database trigger for consistency)
      // await sendPushToDriver(driverId, orderId, order.pickup_name, order.delivery_name);
      // fetchOrders will be called by the realtime subscription
    }
  };

  const [typingStatus, setTypingStatus] = useState("");
  const typingTimeoutRef = useRef(null);
  const driversRef = useRef([]);

  useEffect(() => {
    driversRef.current = drivers;
  }, [drivers]);

  useEffect(() => {
    if (authed) {
      fetchDrivers();
      fetchOrders();
      fetchChat();

      const channel = supabase
        .channel('admin_global_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchDrivers())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        }, (payload) => {
          fetchChat(); // Always fetch to get everything (profiles, content, etc.) perfectly

          // Handle Toast
          const msg = payload.new;
          if (!msg.is_admin_message) {
            // Fetch sender name briefly just for the toast
            supabase.from('profiles').select('full_name').eq('id', msg.sender_id).single()
              .then(({ data }) => {
                const name = data?.full_name || "Chauffeur";
                triggerToast(msg.content, name);
              });
          }
        })
        .on('broadcast', { event: 'typing' }, (payload) => {
          const { userId, typing } = payload.payload;
          if (typing) {
            const driver = driversRef.current.find(d => d.id === userId);
            const name = driver?.full_name || driver?.name || "Un interlocuteur";
            setTypingStatus(`${name} est en train d'écrire...`);
          } else {
            setTypingStatus("");
          }
        })
        .subscribe((status) => {
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            // Note: supabase-js handles reconnection usually, but we log it
          }
        });

      const broadcastTyping = (isTyping) => {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user && channel) {
            channel.send({
              type: 'broadcast',
              event: 'typing',
              payload: { userId: user.id, typing: isTyping },
            });
          }
        });
      };

      window._broadcastAdminPageTyping = broadcastTyping;

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [authed]);

  const handleTyping = () => {
    window._broadcastAdminPageTyping?.(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      window._broadcastAdminPageTyping?.(false);
    }, 3000);
  };

  useEffect(() => {
    if (chatScrollRef.current && showChat) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, showChat]);

  const fetchChat = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles:sender_id(full_name)')
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setChatMessages(data);
  };

  const sendAdminChat = async (e) => {
    e.preventDefault();
    if (!newChatMsg.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const content = newChatMsg.trim();
    const tempId = Math.random().toString();

    // Find last sender to guess recipient if none selected
    const lastUserMsg = [...chatMessages].reverse().find(m => !m.is_admin_message);
    const recipientId = lastUserMsg?.sender_id;

    const tempMsg = {
      id: tempId,
      sender_id: user.id,
      recipient_id: recipientId,
      content,
      is_admin_message: true,
      created_at: new Date().toISOString(),
      is_optimistic: true
    };

    setChatMessages(prev => [...prev, tempMsg]);
    setNewChatMsg("");

    const { data, error } = await supabase.from('messages').insert([{
      sender_id: user.id,
      recipient_id: recipientId,
      content,
      is_admin_message: true
    }]).select().single();

    if (error) {
      setChatMessages(prev => prev.filter(m => m.id !== tempId));
      alert("Erreur d'envoi");
    } else if (data) {
      // Broadcast for zero-latency
      // Try to send on the specific conversation channel if recipient is known
      if (recipientId) {
        const channelId = `chat-${[user.id, recipientId].sort().join('-')}`;
        const privateChannel = supabase.channel(channelId);
        privateChannel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: data
        });
      }

      setChatMessages(prev => prev.map(m => m.id === tempId ? data : m));
    }
  };

  const fetchDrivers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('drivers')
      .select('id, name, phone, vehicle, status, auth_id')
      .order('status')
      .order('name');

    if (!error && data) {
      setDrivers(data.map(d => ({ ...d, is_online: d.status !== 'hors_service', full_name: d.name })));
    }
  };

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, profiles:driver_id(full_name)')
      .neq('status', 'delivered')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
  };

  const fetchArchive = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, profiles:driver_id(full_name)')
      .eq('status', 'delivered')
      .order('delivered_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setArchivedOrders(data);
    }
  };

  useEffect(() => {
    if (authed && showArchive) {
      fetchArchive();
    }
  }, [authed, showArchive]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAuthed(false);
  };

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

  const handleCreateDriver = async () => {
    if (!form.email || !form.password) {
      alert("Email et mot de passe requis.");
      return;
    }

    if (form.password.length < 6) {
      alert("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);

    try {

      // 1. Create user in Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: 'driver',
            full_name: `${form.firstName} ${form.lastName}`.trim(),
            phone: form.phone,
            company: form.company,
            siret: form.siret,
          }
        }
      });

      if (data?.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          role: 'driver',
          full_name: `${form.firstName} ${form.lastName}`.trim(),
          phone: form.phone,
        });

        if (profileError) {
          console.error("Profile Upsert Error:", profileError);
        }

        await supabase.from('drivers').upsert({
          auth_id: data.user.id,
          name: `${form.firstName} ${form.lastName}`.trim(),
          phone: form.phone,
          vehicle: `${form.type} — ${form.model} — ${form.plate}`,
          status: 'disponible',
        }, { onConflict: 'auth_id' });
      }

      if (error) {
        console.error("Supabase Error:", error);
        if (error.message.includes("User already registered")) {
          alert("Cette adresse email est déjà utilisée.");
        } else {
          alert("Erreur création Supabase : " + error.message);
        }
        return;
      }

      alert("✅ Compte créé !");
      fetchDrivers(); // Refresh list

      setForm({
        firstName: "", lastName: "",
        phone: "", email: "", password: "", company: "",
        siret: "", address: "", model: "", plate: "",
        type: "", iban: "", bic: ""
      });

      await supabase.auth.signOut();

    } catch (err) {
      console.error(err);
      alert("Une erreur est survenue: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#f6f7f7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="Logo" className="h-20 w-20 animate-pulse" />
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#1d283a] border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
        <main className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-center">
            <img src="/logo.svg" alt="One Connexion Logo" className="mx-auto h-24 w-24 mb-2" />
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">One Connexion</div>
            <h1 className="mt-2 text-2xl font-bold">Accès refusé</h1>
            <p className="mt-4 text-sm text-gray-500">Vous devez être connecté avec un compte administrateur.</p>
            <a href="/login" className="mt-6 inline-block w-full rounded-xl bg-[#1d283a] px-4 py-3 text-sm font-semibold text-white">
              Se connecter
            </a>
          </div>
        </main>
      </div>
    );
  }

  const toggleDriverStatus = async (driverId, currentStatus) => {
    const newStatus = currentStatus ? 'hors_service' : 'disponible';
    const { error } = await supabase
      .from('drivers')
      .update({ status: newStatus })
      .eq('id', driverId);

    if (error) {
      alert("Erreur lors de la mise à jour du statut.");
    } else {
      fetchDrivers();
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight uppercase text-slate-800">Admin</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-gray-500"
            onClick={handleSignOut}
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-72">
        <div className="px-4 py-3">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-sm font-bold uppercase tracking-widest text-gray-400">Créer un chauffeur</div>
            <div className="mt-1 text-xs font-medium text-gray-500">Ici, crée un compte pour le chauffeur afin qu’il puisse se connecter.</div>

            <div className="mt-4 grid gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Informations & Connexion</div>
                <div className="mt-2 grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Prénom" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                    <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Nom" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </div>
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" type="email" placeholder="Email (Identifiant)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" type="password" placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />

                  <div className="relative">
                    <input
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                      placeholder="Société (Autocomplete)"
                      value={form.company}
                      onChange={(e) => {
                        setForm({ ...form, company: e.target.value });
                        searchCompany(e.target.value);
                      }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                    {searchLoading && (
                      <div className="absolute right-3 top-2.5">
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
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none font-mono"
                      placeholder="SIRET (Autocomplete)"
                      value={form.siret}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\s/g, '');
                        setForm({ ...form, siret: val });
                        if (val.length >= 9) searchCompany(val);
                      }}
                      onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    />
                  </div>
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Véhicule</div>
                <div className="mt-2 grid gap-2">
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Modèle" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Immatriculation" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Informations bancaires</div>
                <div className="mt-2 grid gap-2">
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="IBAN" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} />
                  <input className="rounded-xl border border-gray-200 px-3 py-2 text-sm" placeholder="BIC" value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value })} />
                </div>
              </div>

              <button
                type="button"
                className="w-full rounded-xl bg-[#1d283a] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                onClick={handleCreateDriver}
                disabled={loading}
              >
                {loading ? "Création en cours..." : "Créer le profil"}
              </button>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center justify-between">
                <span>Missions en cours ({orders.length})</span>
                <button onClick={fetchOrders} className="text-blue-600 font-bold lowercase">Actualiser</button>
              </div>
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-400 text-xs">{o.id.slice(0, 8)}...</span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${o.status === 'assigned' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                        {o.status}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-800 line-clamp-1">{o.pickup_name || 'Enlèvement'}</div>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {o.scheduled_at ? new Date(o.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-slate-500 text-xs truncate">→ {o.delivery_name || 'Livraison'}</div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          {o.delivery_deadline ? new Date(o.delivery_deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                       {o.driver_id && (
                        <div className="flex items-center gap-2 mb-1">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-800">Assigné à : {o.profiles?.full_name || 'Chargement...'}</span>
                        </div>
                      )}
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{o.driver_id ? "Réassigner à" : "Assigner à"}</div>
                      <select 
                        className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium focus:ring-2 focus:ring-blue-100 outline-none bg-white"
                        value={o.driver_id || ""}
                        onChange={(e) => assignOrder(o.id, e.target.value)}
                      >
                        <option value="">-- Sélectionner un chauffeur --</option>
                        {drivers.filter(d => d.is_online).map(d => (
                          <option key={d.id} value={d.id}>
                            🟢 {d.full_name || d.name || d.email}
                          </option>
                        ))}
                        <optgroup label="Hors ligne">
                          {drivers.filter(d => !d.is_online).map(d => (
                            <option key={d.id} value={d.id}>
                              ⚪ {d.full_name || d.name || d.email}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Statut: <span className="text-slate-600 font-bold uppercase">{o.status}</span></span>
                      <span className="text-slate-400">Créé: {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
                {orders.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs italic">Aucune mission en cours.</div>
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <button 
                  onClick={() => setShowArchive(!showArchive)}
                  className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span>Archives des missions ({showArchive ? archivedOrders.length : 'cliquer pour voir'})</span>
                  <span className={`transform transition-transform ${showArchive ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {showArchive && (
                  <div className="mt-4 space-y-3">
                    {archivedOrders.map((o) => (
                      <div key={o.id} className="bg-white border border-slate-100 rounded-xl p-3 text-sm shadow-sm opacity-80">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-400 text-[10px]">{o.id.slice(0, 8).toUpperCase()}</span>
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                            Livré le {new Date(o.delivered_at).toLocaleDateString([], { day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-slate-800 line-clamp-1">{o.pickup_city} → {o.delivery_city}</div>
                            <span className="text-[10px] font-bold text-slate-400">
                              {new Date(o.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="p-2.5 bg-slate-50/80 rounded-lg border border-slate-100/50 space-y-1.5">
                            <div className="flex items-start gap-4">
                              <div className="flex-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Réceptionnaire</p>
                                <p className="text-xs font-bold text-slate-900">{o.delivery_recipient || "—"}</p>
                              </div>
                              <div className="flex-1 border-l border-slate-200/50 pl-3">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lieu de dépôt</p>
                                <p className="text-xs font-bold text-slate-900">{o.delivery_department || "—"}</p>
                              </div>
                            </div>
                            {o.delivery_comment && (
                              <div className="pt-1.5 border-t border-slate-200/50">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Commentaire</p>
                                <p className="text-xs font-medium text-slate-600 leading-relaxed italic">"{o.delivery_comment}"</p>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                            <span>Chauffeur: <span className="text-slate-600 font-bold">{o.profiles?.full_name || 'Inconnu'}</span></span>
                            {o.delivery_photo_url && (
                              <a href={o.delivery_photo_url} target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline">Photo Preuve</a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {archivedOrders.length === 0 && (
                      <div className="text-center py-6 text-slate-400 text-xs italic">Aucune mission archivée (60 derniers jours).</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="border-t border-gray-200 bg-white shadow-[0_-6px_18px_rgba(15,23,42,0.12)]">
          {showDrivers && (
            <div className="max-h-60 overflow-y-auto px-4 pt-3 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold uppercase tracking-widest text-gray-400">Chauffeurs ({drivers.length})</div>
                <button onClick={fetchDrivers} className="text-[10px] font-bold text-blue-600">Rafraîchir</button>
              </div>
              {drivers.length === 0 && (
                <div className="text-sm text-gray-500">Aucun chauffeur trouvé dans la base.</div>
              )}
              <div className="grid gap-3">
                {drivers.map((d) => (
                  <div key={d.id} className={`rounded-lg border p-3 text-sm ${d.is_online ? 'border-emerald-100 bg-emerald-50/30' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-[#1d283a]">{d.full_name || d.name || d.email}</div>
                      <button
                        onClick={() => toggleDriverStatus(d.id, d.is_online)}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase cursor-pointer hover:opacity-80 transition-opacity ${d.is_online ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${d.is_online ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                        {d.is_online ? 'En ligne' : 'Hors ligne'}
                      </button>
                      
                      <button
                        onClick={async () => {
                          const { data, error } = await supabase.functions.invoke('send-push', {
                            body: {
                              userId: d.id,
                              title: '🔔 Test Notification',
                              body: 'Si vous voyez ceci, les notifications push fonctionnent !'
                            }
                          });
                          if (error) alert("Erreur push: " + error.message);
                          else if (data?.success === false) alert("Avertissement: " + (data.message || "Non abonné"));
                          else alert("Push envoyé ! Vérifiez le téléphone.");
                        }}
                        className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase hover:bg-blue-200"
                      >
                        Tester Push
                      </button>
                    </div>
                    <div className="mt-1 text-gray-600 text-xs">
                      {d.phone || "Pas de numéro"} • {d.vehicle || "Véhicule non renseigné"}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
                      <span>ID: {d.id.slice(0, 8)}...</span>
                      <span>Dernière activité: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString() : 'Jamais'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>


        <div className="bg-white border-t border-gray-200">
          <div className="grid grid-cols-2">
            <button
              type="button"
              className={`flex items-center justify-center h-16 text-xs font-bold uppercase tracking-widest ${showChat ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
              onClick={() => {
                setShowChat(!showChat);
                setShowDrivers(false);
              }}
            >
              💬 Tchat {chatMessages.length > 0 && `(${chatMessages.length})`}
            </button>
            <button
              type="button"
              className={`flex items-center justify-center h-16 text-xs font-bold uppercase tracking-widest ${showDrivers ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
              onClick={() => {
                setShowDrivers(!showDrivers);
                setShowChat(false);
              }}
            >
              👥 Chauffeurs ({drivers.length})
            </button>
          </div>
          <div className="h-5 bg-white" />
        </div>
      </div>

      {showChat && (
        <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col pt-10">
          <header className="px-6 py-5 border-b border-slate-700 bg-slate-800/40 backdrop-blur-md flex justify-between items-center sticky top-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-lg">💬</span>
              </div>
              <div>
                <h2 className="font-bold text-lg text-white">Support</h2>
                <p className="text-[10px] text-blue-300 font-medium">Messagerie chauffeurs</p>
              </div>
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-slate-400 hover:text-white hover:bg-slate-700 font-bold p-2 rounded-lg transition-all active:scale-95"
            >
              ✕
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 scroll-smooth" ref={chatScrollRef}>
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                <div className="text-5xl mb-3">💭</div>
                <p className="font-medium">Aucun message pour le moment</p>
                <p className="text-xs text-slate-500 mt-1">Les chauffeurs apparaîtront ici</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isAdmin = msg.is_admin_message === true;
                const senderName = isAdmin ? 'Admin' : (msg.profiles?.full_name || 'Chauffeur');
                const initials = senderName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                const showAvatar = idx === 0 || chatMessages[idx - 1]?.sender_id !== msg.sender_id;

                return (
                  <div key={msg.id} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                    {showAvatar && (
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md ${
                        isAdmin
                          ? 'bg-gradient-to-br from-blue-600 to-blue-700'
                          : 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                      }`}>
                        {initials}
                      </div>
                    )}
                    {!showAvatar && <div className="w-8" />}

                    <div className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} max-w-xs`}>
                      {showAvatar && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-slate-300">
                            {senderName}
                          </span>
                          <span className="text-[9px] text-slate-500 font-medium">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )}

                      <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium backdrop-blur-sm transition-all transform hover:scale-105 ${
                        isAdmin
                          ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white rounded-br-none shadow-lg'
                          : 'bg-slate-700 text-slate-50 rounded-bl-none shadow-md hover:bg-slate-600'
                      } ${msg.is_optimistic ? 'opacity-75' : ''}`}>
                        {msg.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {typingStatus && (
              <div className="flex items-center gap-3 py-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-xs font-bold text-white shadow-md">
                  🔤
                </div>
                <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-700 rounded-2xl rounded-bl-none">
                  <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{animationDelay: '0s'}}></span>
                  <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{animationDelay: '0.2s'}}></span>
                  <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" style={{animationDelay: '0.4s'}}></span>
                </div>
                <span className="text-[11px] font-semibold text-amber-300">
                  {typingStatus}
                </span>
              </div>
            )}
          </div>

          <form onSubmit={sendAdminChat} className="px-6 py-4 border-t border-slate-700 bg-slate-800/40 backdrop-blur-md mb-10 flex gap-3">
            <input
              className="flex-1 bg-slate-700 text-slate-50 rounded-full px-5 py-3 text-sm font-medium placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all focus:bg-slate-600 focus:shadow-lg focus:shadow-blue-500/20"
              placeholder="Écrire un message..."
              value={newChatMsg}
              onChange={(e) => {
                setNewChatMsg(e.target.value);
                handleTyping();
              }}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !newChatMsg.trim()}
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 rounded-full font-bold text-sm uppercase tracking-wider hover:from-blue-700 hover:to-blue-600 active:scale-95 transition-all shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center min-w-fit"
            >
              {loading ? (
                <span className="animate-spin">⟳</span>
              ) : (
                '⬆'
              )}
            </button>
          </form>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-20 left-4 z-[100] max-w-xs animate-bounce">
          <div className="bg-[#1d283a] text-white rounded-2xl p-4 shadow-2xl border border-gray-700">
            <div className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Message de {toast.senderName}</div>
            <div className="text-sm font-medium line-clamp-2">{toast.content}</div>
            <button onClick={() => { setShowChat(true); setToast(null); }} className="mt-2 text-[10px] font-bold text-blue-400 underline">Voir la discussion</button>
          </div>
        </div>
      )}
    </div>
  );
}
