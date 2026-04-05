import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { notifyPickupDone, notifyDelivered, notifyDriverAccepted, notifyDriverDeclined } from "../lib/telegram";

const ArrowLeftIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
);
const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
);
const BoxIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.27 6.96 8.73 5.04 8.73-5.04"/><path d="M12 22.08V12"/></svg>
);
const TruckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-5h-7v7Z"/><path d="M16 8h4.5l2.5 3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>
);
const ZapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-2 10h3L11 22l2-10h-3l2-10z"/></svg>
);
const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const XCircleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
);

function openMaps(address) {
  const query = encodeURIComponent(address || "");
  if (!query) return;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);

  window.location.href = `waze://?q=${query}&navigate=yes`;
  setTimeout(() => {
    if (isIOS) {
      window.location.href = `maps://?q=${query}`;
      setTimeout(() => {
        window.location.href = `https://maps.apple.com/?q=${query}`;
      }, 400);
    } else {
      window.location.href = `geo:0,0?q=${query}`;
      setTimeout(() => {
        window.location.href = `https://maps.google.com/?q=${query}`;
      }, 400);
    }
  }, 400);
}

function statusTitle(status) {
  switch (status) {
    case "assigned":
      return "Étape 1 : À Accepter";
    case "driver_accepted":
      return "Étape 1 : En route vers Enlèvement";
    case "in_progress":
    case "picked_up":
      return "Étape 2 : En cours de livraison";
    case "delivered":
      return "Terminée";
    default:
      return status;
  }
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function MissionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [driverName, setDriverName] = useState("Chauffeur");
  const [currentUserId, setCurrentUserId] = useState(null);

  const [deliveryRecipient, setDeliveryRecipient] = useState("");
  const [deliveryDepartment, setDeliveryDepartment] = useState("");
  const [deliveryComment, setDeliveryComment] = useState("");

  const [pickupOpen, setPickupOpen] = useState(true);
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const pickupStages = ["assigned", "accepted", "dispatched", "driver_accepted", "arrived_pickup"];
  const deliveryStages = ["picked_up", "in_progress", "on_delivery"];

  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const fileRef = useRef(null);
  const missionRef = useRef(null);

  useEffect(() => {
    fetchMission();
    fetchDriverName();
  }, [id]);

  const fetchDriverName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('details').eq('id', user.id).single();
      const name = profile?.details?.full_name || profile?.details?.first_name || user.email?.split('@')[0] || "Chauffeur";
      setDriverName(name);
    }
  };

  useEffect(() => {
    if (!mission?.status) return;
    if (mission.status === "assigned" || mission.status === "accepted" || mission.status === "driver_accepted") {
      setPickupOpen(true);
      setDeliveryOpen(false);
    } else if (mission.status === "picked_up" || mission.status === "in_progress" || mission.status === "delivered") {
      setPickupOpen(false);
      setDeliveryOpen(true);
    }
  }, [mission?.status]);

  const fetchMission = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error("Error fetching mission:", error);
      setMission(null);
      missionRef.current = null;
    } else {
      setMission(data);
      missionRef.current = data;
      
      // Initialize delivery details from existing data if available
      if (data.delivery_recipient) setDeliveryRecipient(data.delivery_recipient);
      if (data.delivery_department) setDeliveryDepartment(data.delivery_department);
      if (data.delivery_comment) setDeliveryComment(data.delivery_comment);
      
      // Marquer comme vue si non déjà fait
      if (data.status === 'assigned' && !data.viewed_at) {
        supabase.from('orders')
          .update({ viewed_at: new Date().toISOString() })
          .eq('id', id)
          .then(({ error }) => {
            if (error) console.error("Error setting viewed_at:", error);
          });
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const channel = supabase
      .channel(`mission_details_${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setModalMessage("Cette course a été retirée par l'administrateur.");
            setShowModal(true);
          }
          else if (payload.eventType === 'UPDATE') {
            const newMission = payload.new;
            if (newMission.status === 'cancelled') {
              setModalMessage("La course a été annulée par l'administrateur.");
              setShowModal(true);
              return;
            }
            const prev = missionRef.current;
            if (prev && newMission.driver_id && newMission.driver_id !== prev.driver_id) {
              setModalMessage("Cette course a été réassignée à un autre chauffeur.");
              setShowModal(true);
              return;
            }
            setMission(newMission);
            missionRef.current = newMission;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const updateOrder = async (patch) => {
    setSaving(true);
    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id);

    if (error) {
      console.error("Update error:", error);
      alert("Erreur lors de la mise à jour: " + error.message);
    } else {
      await fetchMission();
      setTimeout(() => setSaving(false), 500);
      return;
    }
    setSaving(false);
  };

  const savePhoto = async (dataUrl, name) => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilisateur non connecté");

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      
      const fileExt = name.split('.').pop() || 'jpg';
      const fileName = `${user.id}/${id}/${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('delivery-photos')
        .upload(filePath, blob, {
          contentType: `image/${fileExt}`,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('delivery-photos')
        .getPublicUrl(filePath);

      const patch = {};
      if (mission.status === "picked_up" || mission.status === "in_progress") {
        patch.delivery_photo_url = publicUrl;
        // Even for a simple proof photo, let's save the delivery details if we have them
        if (deliveryRecipient) patch.delivery_recipient = deliveryRecipient;
        if (deliveryDepartment) patch.delivery_department = deliveryDepartment;
        if (deliveryComment) patch.delivery_comment = deliveryComment;
      } else {
        patch.pickup_photo_url = publicUrl;
      }

      await updateOrder(patch);
      return publicUrl;
    } catch (err) {
      console.error("Error uploading photo:", err);
      alert("Erreur lors de l'upload de la photo: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const completeDelivery = async () => {
    const now = new Date().toISOString();
    const patch = {
      status: "delivered",
      updated_at: now,
      delivered_at: now,
      delivery_recipient: deliveryRecipient,
      delivery_department: deliveryDepartment,
      delivery_comment: deliveryComment
    };
    await updateOrder(patch);
    if (mission) {
      notifyDelivered({ ...mission, ...patch }, driverName);
    }
    navigate("/missions");
  };

  const handleAccept = async () => {
    const now = new Date().toISOString();
    const driverId = currentUserId || (await supabase.auth.getUser())?.data?.user?.id;

    if (!driverId) {
      alert("Session chauffeur introuvable. Reconnectez-vous.");
      return;
    }

    const patch = {
      status: "driver_accepted",
      driver_id: driverId,
      updated_at: now,
      driver_accepted_at: now
    };

    await updateOrder(patch);
    if (mission) {
      notifyDriverAccepted({ ...mission, ...patch }, driverName);
    }
    alert("Mission acceptée !");
  };

  const handlePickup = async () => {
    const now = new Date().toISOString();
    const patch = {
      status: "in_progress",
      updated_at: now,
      picked_up_at: now
    };
    await updateOrder(patch);
    if (mission) {
      notifyPickupDone({ ...mission, ...patch }, driverName);
    }
    setPickupOpen(false);
    setDeliveryOpen(true);
  };

  const handleDecline = async () => {
    if (!confirm("Êtes-vous sûr de vouloir vous désister de cette mission ?")) return;

    const now = new Date().toISOString();
    const patch = {
      status: "assigned",
      driver_id: null,
      refused_by_driver: driverName || null,
      picked_up_at: null,
      driver_accepted_at: null,
      pickup_photo_url: null,
      delivery_photo_url: null,
      delivery_signature_url: null,
      updated_at: now
    };

    await updateOrder(patch);
    if (mission) {
      notifyDriverDeclined({ ...mission, ...patch }, driverName);
    }
    alert("Mission retirée.");
    navigate("/missions");
  };

    const { pickupInstructions, deliveryInstructions, scheduleComment } = useMemo(() => {
    let p = null;
    let d = null;
    let s = null;
    
    // Helper to extract text from potential JSON or technical strings
    const cleanup = (val) => {
      if (!val) return null;
      const t = val.trim();
      if (!t || t === "." || t === "—" || t.toLowerCase() === "null") return null;
      
      // Handle JSON strings
      if (t.startsWith('{') && t.endsWith('}')) {
        try {
          const parsed = JSON.parse(t);
          return parsed.instruction || parsed.notes || parsed.comment || parsed.message || t;
        } catch (e) {
          // Fall through if not valid JSON
        }
      }
      return t;
    };

    const filter = (text) => {
      const t = cleanup(text);
      if (!t) return null;
      const isOnlyPhone = /^(\+33|0)[1-9](\s*\d{2}){4}$/.test(t.replace(/[\s.-]/g, ""));
      if (isOnlyPhone) return null;
      if (t.toLowerCase().startsWith("dimensions:") && t.length < 30) return null;
      return t;
    };

    if (mission?.pickup_instructions || mission?.delivery_instructions) {
      p = mission?.pickup_instructions || null;
      d = mission?.delivery_instructions || null;
    }

    const notes = mission?.notes;
    
    // Always consider delivery_schedule_notes as a primary source for S
    if (mission?.delivery_schedule_notes) {
      s = mission.delivery_schedule_notes;
    }

    if (notes) {
      // Clean schedule comment from technical logs if present
      // Format usually: "Pick: ... | Del: ... | Dispatch: Actual Comment"
      const hasSeparators = notes.includes('|') || notes.includes('/');
      const parts = notes.includes('|') ? notes.split('|') : (notes.includes('/') ? notes.split('/') : [notes]);
      
      parts.forEach(part => {
        const trimmed = part.trim();
        // Handle "enlèvement:" or "Pick:"
        if (/enlèvement\s*:|Pick\s*:/i.test(trimmed)) {
          const m = trimmed.match(/(?:enlèvement|Pick)\s*:\s*(.*?)(?=livraison:|Del:|dispatch:|Decision:|Status:|$)/i);
          if (m && !p) p = m[1].trim();
        }
        // Handle "livraison:" or "Del:"
        if (/livraison\s*:|Del\s*:/i.test(trimmed)) {
          const m = trimmed.match(/(?:livraison|Del)\s*:\s*(.*?)(?=enlèvement:|Pick:|dispatch:|Decision:|Status:|$)/i);
          if (m && !d) d = m[1].trim();
        }
        // Handle "dispatch:" or "Note dispatch:"
        if (/dispatch\s*:/i.test(trimmed)) {
          const m = trimmed.match(/dispatch\s*:\s*(.*)/i);
          if (m && !s) s = m[1].trim();
        }
      });

      // If no specific schedule comment found via regex, and notes isn't just technical logs
      if (!s && !/(pick|del|dispatch|enlèvement|livraison)\s*:/i.test(notes)) {
        s = notes;
      }
    }

    return { 
      pickupInstructions: filter(p), 
      deliveryInstructions: filter(d),
      scheduleComment: filter(s)
    };
  }, [mission?.notes, mission?.pickup_instructions, mission?.delivery_instructions, mission?.delivery_schedule_notes]);

  if (loading) return <div className="p-4">Chargement...</div>;

  if (!mission) {
    return (
      <div className="min-h-screen bg-[#f6f7f9]">
        <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
          <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <div className="text-lg font-semibold text-slate-900">Mission introuvable</div>
            <p className="mt-1 text-sm text-slate-500">{id}</p>
            <button onClick={() => navigate(-1)} className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pickupName = mission.pickup_name || mission.pickup_address || "Enlèvement";
  const pickupAddr = mission.pickup_address || "";
  const pickupCity = `${mission.pickup_postal_code || ''} ${mission.pickup_city || ''}`.trim();
  const deliveryName = mission.delivery_name || mission.delivery_address || "Livraison";
  const deliveryAddr = mission.delivery_address || "";
  const deliveryCity = `${mission.delivery_postal_code || ''} ${mission.delivery_city || ''}`.trim();

  return (
    <div className="min-h-screen bg-[#f6f7f7] text-[#1d283a]">
      {saving && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
          <div className="rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-900 shadow-lg">
            Envoi au serveur…
          </div>
        </div>
      )}
      {pendingPhoto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto">
          <div className="w-full max-w-md my-8 rounded-3xl bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black uppercase tracking-wider text-slate-900">
                {pendingAction === "DELIVER" ? "Finaliser la Livraison" : "Valider la photo"}
              </div>
              <button 
                onClick={() => { setPendingPhoto(null); setPendingAction(null); }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <XCircleIcon />
              </button>
            </div>

            {(pendingAction === "DELIVER" || (deliveryStages.includes(mission?.status) && pendingAction === "PROOF")) && (
              <div className="mb-4 space-y-4">
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-3 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px]">!</span>
                    Détails de réception
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex justify-between">
                        <span>Qui a réceptionné ?</span>
                        {pendingAction === "DELIVER" && <span className="text-red-500">Requis</span>}
                      </label>
                      <input
                        type="text"
                        value={deliveryRecipient}
                        onChange={(e) => setDeliveryRecipient(e.target.value)}
                        placeholder="Ex: M. Jean (Accueil)"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex justify-between">
                        <span>Où a été déposé le colis ?</span>
                        {pendingAction === "DELIVER" && <span className="text-red-500">Requis</span>}
                      </label>
                      <input
                        type="text"
                        value={deliveryDepartment}
                        onChange={(e) => setDeliveryDepartment(e.target.value)}
                        placeholder="Ex: Accueil, Gardien, Boîte aux lettres..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Commentaire supplémentaire</label>
                      <textarea
                        rows={2}
                        value={deliveryComment}
                        onChange={(e) => setDeliveryComment(e.target.value)}
                        placeholder="Infos utiles, état du colis..."
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 placeholder:text-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="relative">
              <img src={pendingPhoto.dataUrl} alt="Preuve" className="h-48 w-full rounded-2xl object-cover border border-slate-100 shadow-sm" />
              <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[8px] font-black text-white uppercase tracking-widest">
                Aperçu photo
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <button
                type="button"
                className={`w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-[0.98] ${pendingAction === "DELIVER" ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-slate-900 shadow-slate-900/20'}`}
                onClick={async () => {
                  const action = pendingAction;
                  const photo = pendingPhoto;
                  
                  if (action === "DELIVER" && (!deliveryRecipient.trim() || !deliveryDepartment.trim())) {
                    alert("Veuillez renseigner le nom du réceptionnaire et le lieu de dépôt pour finaliser la livraison.");
                    return;
                  }

                  setPendingPhoto(null);
                  setPendingAction(null);
                  
                  if (photo) await savePhoto(photo.dataUrl, photo.name);
                  if (action === "DELIVER") {
                    await completeDelivery();
                  }
                }}
              >
                {pendingAction === "DELIVER" ? "Confirmer la Livraison" : "Valider la photo"}
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white py-4 text-sm font-bold text-slate-400 active:bg-slate-50 transition-colors"
                onClick={() => {
                  setPendingPhoto(null);
                  setPendingAction(null);
                  fileRef.current?.click();
                }}
              >
                Reprendre la photo
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-100/50 px-4 py-3.5 flex items-center justify-between backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-3">
          <Link to="/missions" className="p-2 -ml-2 rounded-xl active:bg-slate-100 transition-colors">
            <ArrowLeftIcon />
          </Link>
          <h1 className="text-sm font-black tracking-[0.1em] uppercase text-slate-900">Détails Mission</h1>
        </div>
        <div className="absolute left-1/2 top-1 -translate-x-1/2">
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2" />
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="p-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1d283a]/10 text-[#1d283a] border border-[#1d283a]/20">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#1d283a] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#1d283a]" />
            </span>
            <span className="text-xs font-bold tracking-wider uppercase">{statusTitle(mission.status)}</span>
          </div>
        </div>

        <section className="px-4 mb-4">
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <HistoryIcon />
                Chronologie
              </h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Prise en charge</p>
                  <p className="text-[13px] font-semibold text-slate-900">
                    {mission.picked_up_at ? formatDateTime(mission.picked_up_at) : 'En attente...'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 pt-1 relative">
                <div className="absolute left-1 -top-3 w-[1px] h-4 bg-slate-100" />
                <div className={`mt-1 h-2 w-2 rounded-full ${mission.status === 'delivered' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-200'}`} />
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Livraison finale</p>
                  <p className={`text-[13px] font-semibold ${mission.status === 'delivered' ? 'text-slate-900' : 'text-slate-300'}`}>
                    {mission.status === 'delivered' ? formatDateTime(mission.updated_at) : 'Pas encore livrée'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 space-y-3">
          <details className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100" open={pickupOpen}>
            <summary
              className="list-none cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setPickupOpen((v) => !v);
              }}
            >
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#1d283a] text-white flex items-center justify-center">
                    <span className="text-[10px] font-bold">1</span>
                  </div>
                  <h3 className="font-bold uppercase text-xs tracking-wider">Enlèvement</h3>
                </div>
              </div>
            </summary>
            <div className="px-3 pb-3">
              <div className="relative pl-6">
                <div className="mb-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date &amp; Heure</label>
                  <p className="text-sm font-semibold">{formatDateTime(mission.scheduled_at)}</p>
                </div>
                <div className="mb-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Lieu</label>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <p className="text-sm font-bold text-[#1d283a]">{pickupName}</p>
                      <p className="text-sm text-gray-600">{pickupAddr}</p>
                      <p className="text-sm text-gray-600">{pickupCity}</p>
                    </div>
                    <button className="p-2 bg-gray-50 rounded-lg text-[#1d283a]" onClick={() => openMaps([pickupAddr, pickupCity].filter(Boolean).join(", "))}>
                      ➤
                    </button>
                  </div>
                </div>
                {(mission.pickup_access_code || pickupInstructions) && (
                  <div className="mt-3 p-3 bg-slate-900 rounded-xl border border-slate-800 shadow-lg">
                    <label className="block text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Instructions Enlèvement</label>
                    <div className="space-y-1">
                      {mission.pickup_access_code && (
                        <p className="text-sm font-bold text-white mb-1"><span className="text-blue-400">CODE / ACCÈS:</span> {mission.pickup_access_code}</p>
                      )}
                      {pickupInstructions && (
                        <p className="text-sm font-medium text-slate-100 leading-relaxed">{pickupInstructions}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>

          <details className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100" open={deliveryOpen}>
            <summary
              className="list-none cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setDeliveryOpen((v) => !v);
              }}
            >
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <span className="text-[10px] font-bold">2</span>
                  </div>
                  <h3 className="font-bold uppercase text-xs tracking-wider">Livraison</h3>
                </div>
              </div>
            </summary>
            <div className="px-3 pb-3">
              <div className="relative pl-6">
                <div className="mb-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date limite</label>
                  <p className="text-sm font-semibold text-emerald-600 italic">
                    {mission.delivery_deadline ? formatDateTime(mission.delivery_deadline) : "Dès que possible"}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Lieu</label>
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <p className="text-sm font-bold text-[#1d283a]">{deliveryName}</p>
                      <p className="text-sm text-gray-600">{deliveryAddr}</p>
                      <p className="text-sm text-gray-600">{deliveryCity}</p>
                    </div>
                    <button className="p-2 bg-gray-50 rounded-lg text-[#1d283a]" onClick={() => openMaps([deliveryAddr, deliveryCity].filter(Boolean).join(", "))}>
                      ➤
                    </button>
                  </div>
                </div>
                {(mission.delivery_access_code || deliveryInstructions) && (
                  <div className="mt-3 p-3 bg-slate-900 rounded-xl border border-slate-800 shadow-lg">
                    <label className="block text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1.5">Instructions Livraison</label>
                    <div className="space-y-1">
                      {mission.delivery_access_code && (
                        <p className="text-sm font-bold text-white mb-1"><span className="text-emerald-400">CODE / ACCÈS:</span> {mission.delivery_access_code}</p>
                      )}
                      {deliveryInstructions && (
                        <p className="text-sm font-medium text-slate-100 leading-relaxed">{deliveryInstructions}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>

          {mission.status === "delivered" && (
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-emerald-100 p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckIcon />
                </div>
                <h3 className="font-black uppercase text-xs tracking-wider text-emerald-600">Preuve de Livraison</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Réceptionnaire</p>
                  <p className="text-sm font-bold text-slate-900">{mission.delivery_recipient || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lieu de dépôt</p>
                  <p className="text-sm font-bold text-slate-900">{mission.delivery_department || "—"}</p>
                </div>
              </div>

              {mission.delivery_comment && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Commentaire</p>
                  <p className="text-sm font-medium text-slate-600 italic">"{mission.delivery_comment}"</p>
                </div>
              )}

              {mission.delivery_photo_url && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Photo de preuve</p>
                  <img 
                    src={mission.delivery_photo_url} 
                    alt="Preuve" 
                    className="w-full h-48 object-cover rounded-xl border border-slate-100"
                  />
                </div>
              )}
            </div>
          )}

          <details className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100" open>
            <summary className="list-none cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-50 rounded-xl">
                    <BoxIcon />
                  </div>
                  <h3 className="font-black uppercase text-[10px] tracking-widest text-slate-900">Colis & Service</h3>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </summary>
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Véhicule</p>
                  <p className="text-sm font-bold text-slate-900 capitalize flex items-center gap-2">
                    <TruckIcon />
                    {mission.vehicle_type || "Standard"}
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Formule</p>
                  <p className="text-sm font-black capitalize text-red-600 flex items-center gap-2">
                    <ZapIcon />
                    {mission.service_level || "Standard"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Type</p>
                  <p className="text-sm font-bold text-slate-900 capitalize">{mission.package_type || "Colis"}</p>
                </div>
                <div className="p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Poids</p>
                  <p className="text-sm font-bold text-slate-900">{mission.weight ? `${mission.weight} kg` : "—"}</p>
                </div>
              </div>
              {mission.package_description && (
                <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Nature du contenu</p>
                  <p className="text-sm font-bold text-slate-900 leading-relaxed italic">"{mission.package_description}"</p>
                </div>
              )}

              {scheduleComment && (
                <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Commentaire sur l'horaire</p>
                  <p className="text-sm font-bold text-slate-900 leading-relaxed italic">"{scheduleComment}"</p>
                </div>
              )}
            </div>
          </details>
        </section>

        <section className="p-4 pt-6 space-y-3">
          {mission.status !== "delivered" && (
            <>
              {pickupStages.includes(mission.status) && mission.status !== "in_progress" && (
                <button
                  type="button"
                  onClick={handlePickup}
                  disabled={saving}
                  className="w-full bg-slate-900 text-white py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <CheckIcon />
                  Confirmer l'Enlèvement
                </button>
              )}

              {deliveryStages.includes(mission.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction("DELIVER");
                      fileRef.current?.click();
                    }}
                    disabled={saving}
                    className="w-full bg-emerald-600 text-white py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/10 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                  >
                    <CheckIcon />
                    Valider la Livraison
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction("PROOF");
                      fileRef.current?.click();
                    }}
                    className="w-full bg-white text-slate-900 border-2 border-slate-900 py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:bg-slate-50 transition-colors"
                    disabled={saving}
                  >
                    <CameraIcon />
                    Prendre une Photo
                  </button>
                </>
              )}

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    const dataUrl = String(reader.result || "");
                    setPendingPhoto({ dataUrl, name: file.name });
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </>
          )}

          {mission.status !== "delivered" && (mission.status === "assigned" || (mission.status === "driver_accepted" && !mission.driver_id)) && (
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleAccept}
                disabled={saving || !currentUserId}
                className="w-full bg-emerald-600 text-white py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all"
              >
                Accepter la mission
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={saving}
                className="w-full bg-red-50 text-red-600 border border-red-100 py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] active:bg-red-100 transition-all flex items-center justify-center gap-2"
              >
                <XCircleIcon />
                Me désister
              </button>
            </div>
          )}

          <Link to="/missions" className="w-full py-4 text-slate-400 font-bold text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
            <ArrowLeftIcon />
            Retour à la liste
          </Link>
        </section>
      </main>

      {/* Modal Mission Annulée / Supprimée */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>

              <h3 className="text-xl font-bold text-slate-900">Mission Annulée</h3>

              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                {modalMessage}
              </p>

              <button
                onClick={() => navigate('/missions')}
                className="w-full mt-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
              >
                Compris, retour aux missions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
