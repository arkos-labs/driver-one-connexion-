import React, { useState, useEffect, useRef, useMemo } from "react";
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
    case "en_attente":
    case "pending":
      return "En attente";
    case "assigned":
    case "confirmee":
      return "À accepter";
    case "driver_accepted":
      return "En route";
    case "in_progress":
    case "picked_up":
    case "en_cours":
      return "En cours";
    case "delivered":
    case "livree":
      return "Terminée";
    default:
      return status;
  }
}

function formatDateTime(value) {
  if (!value) return "Immédiat";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return value;
  }
}

// Composant pour formater les notes proprement
const ParsedNotes = ({ text }) => {
  if (!text) return null;

  const enlevementMatch = text.match(/Enl[èe]vement contact:\s*(.*?)(?=\n|$)/i);
  const livraisonMatch = text.match(/Livraison contact:\s*(.*?)(?=\n|$)/i);
  const notesMatch = text.match(/Notes:\s*([\s\S]*)/i);

  if (!enlevementMatch && !livraisonMatch && !notesMatch) {
    return (
      <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
        <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-wider">Notes</p>
        <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  const pickup = splitContact(enlevementMatch?.[1]);
  const dropoff = splitContact(livraisonMatch?.[1]);
  const extra = notesMatch?.[1]?.trim();

  return (
    <div className="space-y-2.5">
      {pickup && <ContactCard label="Enlèvement" tone="amber" {...pickup} />}
      {dropoff && <ContactCard label="Livraison" tone="emerald" {...dropoff} />}
      {extra && (
        <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
          <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Instructions</p>
          <p className="text-sm font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">{extra}</p>
        </div>
      )}
    </div>
  );
};

// "jean  06 59 59 52 6" -> { name: "jean", phone: "06 59 59 52 6" }
function splitContact(raw) {
  const t = (raw || "").trim();
  if (!t) return null;
  const m = t.match(/^(.*?)\s*((?:\+|0)[\d\s.\-*/()]{5,})$/);
  const name = (m ? m[1] : t).replace(/[\s—–-]+$/, "").trim();
  const phone = m ? m[2].trim() : "";
  if (!name && !phone) return null;
  return { name, phone };
}

function ContactCard({ label, tone, name, phone }) {
  const dial = phone.replace(/[^\d+]/g, "");
  const dot = tone === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-200/70 bg-white">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          {label}
        </p>
        <p className="mt-0.5 text-[15px] font-semibold text-slate-900 truncate capitalize">{name || "Contact"}</p>
        {phone && <p className="text-[13px] text-slate-500 tabular-nums">{phone}</p>}
      </div>
      {dial.length >= 6 && (
        <a
          href={`tel:${dial}`}
          aria-label={`Appeler ${name || label}`}
          className="shrink-0 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 active:bg-slate-200 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </a>
      )}
    </div>
  );
}

const ANOMALIES = {
  enlevement: [
    "Adresse d'enlèvement introuvable",
    "Adresse d'enlèvement incorrecte",
    "Expéditeur absent / injoignable",
    "Numéro de téléphone incorrect",
    "Colis non prêt",
    "Colis trop gros / trop lourd",
    "Colis endommagé ou mal emballé",
    "Nombre de colis différent",
    "Accès impossible (code, digicode, fermé)",
    "Refus de remise du colis",
  ],
  livraison: [
    "Adresse de livraison introuvable",
    "Adresse de livraison incorrecte",
    "Destinataire absent / injoignable",
    "Numéro de téléphone incorrect",
    "Refus du colis par le destinataire",
    "Colis endommagé",
    "Accès impossible (code, digicode, fermé)",
    "Établissement fermé",
    "Livraison partielle",
  ],
  general: [
    "Retard important (trafic)",
    "Panne ou accident du véhicule",
    "Problème de stationnement / amende",
    "Autre",
  ],
};

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

  // Tracking for standard orders pickup modal
  const [standardPickupModal, setStandardPickupModal] = useState(false);
  const [pickupRecipient, setPickupRecipient] = useState("");
  const [pickupDescription, setPickupDescription] = useState("");

  // Tracking for navette stops
  const [completedStops, setCompletedStops] = useState([]);
  const [deliveredPickups, setDeliveredPickups] = useState([]);
  const [deliveryPhotos, setDeliveryPhotos] = useState({});

  useEffect(() => {
    if (mission?.point_progress) {
      const progress = mission.point_progress;
      const completed = [];
      const delivered = [];
      const photos = {};
      Object.keys(progress).forEach(key => {
        const idx = parseInt(key, 10);
        if (progress[key].pickedUpAt) completed.push(idx);
        if (progress[key].deliveredAt) delivered.push(idx);
        if (progress[key].photoUrl) photos[idx] = progress[key].photoUrl;
      });
      setCompletedStops(completed);
      setDeliveredPickups(delivered);
      setDeliveryPhotos(photos);
    }
  }, [mission?.point_progress]);

  // Delivery modal state for navette stops
  const [deliveryModal, setDeliveryModal] = useState(null); // { triggerIdx, selectedIndices: [], photo: null }
  const deliveryFileRef = useRef(null);
  
  // Pickup modal state for navette stops
  const [pickupModal, setPickupModal] = useState(null); // { triggerIdx, recipient: '', description: '' }

  const pickupStages = ["assigned", "accepted", "dispatched", "driver_accepted", "arrived_pickup", "en_attente", "confirmee"];
  const deliveryStages = ["picked_up", "in_progress", "on_delivery", "en_cours"];

  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const [anomalyStep, setAnomalyStep] = useState("enlevement");
  const [anomalyType, setAnomalyType] = useState("");
  const [anomalyComment, setAnomalyComment] = useState("");
  const [anomalyPointIndex, setAnomalyPointIndex] = useState(null);
  const [anomalySending, setAnomalySending] = useState(false);
  const [anomalies, setAnomalies] = useState([]);

  const loadAnomalies = async () => {
    const { data } = await supabase
      .from("mission_anomalies")
      .select("id, step, type, comment, created_at, resolved, point_index")
      .eq("mission_id", id)
      .order("created_at", { ascending: false });
    setAnomalies(data ?? []);
  };

  useEffect(() => {
    loadAnomalies();
    const channel = supabase
      .channel(`driver-anomalies-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_anomalies", filter: `mission_id=eq.${id}` }, () => loadAnomalies())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const openAnomaly = (pointIndex = null) => {
    const picked = ["picked_up", "in_progress", "en_cours", "on_delivery"].includes(mission?.status);
    setAnomalyStep(picked ? "livraison" : "enlevement");
    setAnomalyType("");
    setAnomalyComment("");
    setAnomalyPointIndex(typeof pointIndex === 'number' ? pointIndex : null);
    setAnomalyOpen(true);
  };

  const submitAnomaly = async () => {
    if (!anomalyType) return alert("Choisissez le type d'anomalie.");
    if (anomalyType === "Autre" && !anomalyComment.trim()) return alert("Décrivez le problème.");
    setAnomalySending(true);
    const { error } = await supabase.from("mission_anomalies").insert({
      mission_type: mission?.type === "navette" ? "navette" : "order",
      mission_id: id,
      step: anomalyStep,
      type: anomalyType,
      comment: anomalyComment.trim() || null,
      point_index: anomalyPointIndex,
    });
    setAnomalySending(false);
    if (error) return alert("Envoi impossible : " + error.message);
    setAnomalyOpen(false);
    loadAnomalies();
    alert("Anomalie envoyée à One Connexion.");
  };

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
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      const name = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || "Chauffeur";
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

    // Try to fetch from orders first
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (!orderError && orderData) {
      // Found in orders table
      const dataWithType = { ...orderData, type: 'order' };
      setMission(dataWithType);
      missionRef.current = dataWithType;

      // Initialize delivery details from existing data if available
      if (orderData.delivery_recipient) setDeliveryRecipient(orderData.delivery_recipient);
      if (orderData.delivery_department) setDeliveryDepartment(orderData.delivery_department);
      if (orderData.delivery_comment) setDeliveryComment(orderData.delivery_comment);

      // Marquer comme vue si non déjà fait
      if (orderData.status === 'assigned' && !orderData.viewed_at) {
        supabase.from('orders')
          .update({ viewed_at: new Date().toISOString() })
          .eq('id', id)
          .then(({ error }) => {
            if (error) console.error("Error setting viewed_at:", error);
          });
      }
    } else {
      // Try to fetch from navettes
      const { data: navetteData, error: navetteError } = await supabase
        .from('navettes')
        .select('*')
        .eq('id', id)
        .single();

      if (navetteError) {
        console.error("Error fetching mission:", navetteError);
        setMission(null);
        missionRef.current = null;
      } else {
        const dataWithType = { ...navetteData, type: 'navette' };
        setMission(dataWithType);
        missionRef.current = dataWithType;
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
            const newMission = { ...payload.new, type: 'order' };
            if (newMission.status === 'cancelled' || newMission.status === 'annulee') {
              setModalMessage("La course a été annulée.");
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'navettes', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setModalMessage("Cette navette a été supprimée par l'administrateur.");
            setShowModal(true);
          }
          else if (payload.eventType === 'UPDATE') {
            const newMission = { ...payload.new, type: 'navette' };
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

  const updateOrder = async (patch, extraFilters) => {
    setSaving(true);

    const tableName = mission?.type === 'navette' ? 'navettes' : 'orders';
    const finalPatch = { ...patch };
    
    if (tableName === 'navettes') {
      delete finalPatch.pickup_photo_url;
      delete finalPatch.delivery_signature_url;
      delete finalPatch.last_completed_at;
    }
    
    let query = supabase
      .from(tableName)
      .update(finalPatch)
      .eq('id', id);

    if (extraFilters) {
      for (const [method, args] of extraFilters) {
        query = query[method](...args);
      }
    }

    const { error, count } = await query.select('id', { count: 'exact', head: true });

    if (error) {
      console.error("Update error:", error);
      alert("Erreur lors de la mise à jour: " + error.message);
    } else if (extraFilters && count === 0) {
      alert("Cette mission a déjà été prise par un autre chauffeur.");
      await fetchMission();
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
    
    if (mission?.type === 'navette') {
      try {
        const { error: histError } = await supabase.rpc('record_navette_delivery', {
          p_navette_id: id,
          p_recipient: deliveryRecipient,
          p_department: deliveryDepartment,
          p_comment: deliveryComment,
        });
        if (histError) throw histError;
      } catch(e) { console.error("Error saving navette history:", e); }
      
      const patch = {
        status: "active",
        updated_at: now,
        point_progress: { last_completed_at: now }
      };
      await updateOrder(patch);
    } else {
      const patch = {
        status: "delivered",
        updated_at: now,
        delivered_at: now,
        delivery_recipient: deliveryRecipient,
        delivery_department: deliveryDepartment,
        delivery_comment: deliveryComment
      };
      await updateOrder(patch);
    }

    if (mission) {
      notifyDelivered({ ...mission, status: 'delivered' }, driverName);
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

    const raceGuard = [
      ['eq', ['driver_id', driverId]],
      ['in', ['status', ['assigned', 'pending']]],
    ];
    await updateOrder(patch, raceGuard);
    if (mission) {
      notifyDriverAccepted({ ...mission, ...patch }, driverName);
    }
  };

  const handlePickup = async (recipient = '', description = '') => {
    const now = new Date().toISOString();
    const patch = {
      status: "in_progress",
      updated_at: now,
      picked_up_at: now,
      point_progress: {
        ...(mission?.point_progress || {}),
        '0': {
          ...(mission?.point_progress?.['0'] || {}),
          pickupRecipient: recipient,
          pickupDescription: description,
          pickedUpAt: now
        }
      }
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
      status: "en_attente",
      driver_id: null,
      refused_by_driver: driverName || null,
      updated_at: now
    };

    setSaving(true);
    const { error } = await supabase.rpc('driver_decline', {
      p_type: mission?.type === 'navette' ? 'navette' : 'order',
      p_id: id,
      p_driver_name: driverName || null,
    });
    setSaving(false);
    if (error) {
      alert("Désistement impossible : " + error.message);
      return;
    }
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
      scheduleComment: filter(s)?.replace(/Pickup contact/gi, 'Enlèvement contact').replace(/Dropoff contact/gi, 'Livraison contact')
    };
  }, [mission?.notes, mission?.pickup_instructions, mission?.delivery_instructions, mission?.delivery_schedule_notes]);

  if (loading) return <div className="p-4">Chargement...</div>;

  if (!mission) {
    return (
      <div className="min-h-screen bg-paper">
        <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-6">
          <div className="rounded-[2px] border border-line bg-paper-card p-6 shadow-sm">
            <div className="text-lg font-semibold text-ink">Mission introuvable</div>
            <p className="mt-1 text-sm text-muted">{id}</p>
            <button onClick={() => navigate(-1)} className="mt-4 rounded-[2px] bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-accent transition-colors">
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isNavette = mission.type === 'navette';
  const isCollecte = isNavette && (mission.name || '').toLowerCase().includes('collecte');

  const pickupName = mission.pickup_name || mission.pickup_address || mission.name || "Enlèvement";
  const pickupAddr = mission.pickup_address || "";
  const pickupCity = `${mission.pickup_postal_code || ''} ${mission.pickup_city || ''}`.trim();

  const deliveryName = isNavette ? (mission.name || "Navette") : (mission.delivery_name || mission.delivery_address || "Livraison");
  const deliveryAddr = isNavette ? (mission.dropoff_address || "") : (mission.dropoff_address || mission.delivery_address || "");
  const deliveryCity = isNavette
    ? `${mission.dropoff_postal_code || ''} ${mission.dropoff_city || ''}`.trim()
    : `${mission.delivery_postal_code || ''} ${mission.delivery_city || ''}`.trim();

  return (
    <div className="min-h-screen bg-paper text-ink">
      {anomalyOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setAnomalyOpen(false)}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Signaler une anomalie</h3>
              <button onClick={() => setAnomalyOpen(false)} className="p-1 text-slate-400"><XCircleIcon /></button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl mb-4">
              {[["enlevement", "Enlèvement"], ["livraison", "Livraison"], ["general", "Autre"]].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setAnomalyStep(k); setAnomalyType(""); }}
                  className={`py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors ${anomalyStep === k ? "bg-white text-slate-900 shadow" : "text-slate-500"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {ANOMALIES[anomalyStep].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAnomalyType(t)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-bold transition-colors ${anomalyType === t ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-800 active:bg-slate-50"}`}
                >
                  {t}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={anomalyComment}
              onChange={(e) => setAnomalyComment(e.target.value)}
              placeholder={anomalyType === "Autre" ? "Décrivez le problème (obligatoire)" : "Précisions (facultatif)"}
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-red-500 resize-none"
            />

            <button
              type="button"
              disabled={anomalySending || !anomalyType}
              onClick={submitAnomaly}
              className="mt-4 w-full rounded-2xl py-4 bg-red-600 text-white text-sm font-black uppercase tracking-widest shadow-lg disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {anomalySending ? "Envoi…" : "Envoyer à One Connexion"}
            </button>
          </div>
        </div>
      )}

      {/* Modal enlèvement standard */}
      {standardPickupModal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 overflow-y-auto">
          <div className="w-full max-w-md my-8 rounded-[32px] bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Confirmer l'enlèvement</h3>
              <button onClick={() => setStandardPickupModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <XCircleIcon />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/50 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Remis par
                  </label>
                  <input
                    type="text"
                    value={pickupRecipient}
                    onChange={(e) => setPickupRecipient(e.target.value)}
                    placeholder="Ex: M. Dupont (Gardien)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Marchandise récupérée
                  </label>
                  <textarea
                    rows={2}
                    value={pickupDescription}
                    onChange={(e) => setPickupDescription(e.target.value)}
                    placeholder="Ex: 2 cartons, 1 enveloppe..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all resize-none"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handlePickup(pickupRecipient, pickupDescription);
                    setStandardPickupModal(false);
                  }}
                  className="w-full rounded-2xl py-4 bg-amber-500 text-white text-sm font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setStandardPickupModal(false)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-400 active:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
          <div className="rounded-[2px] bg-paper-card px-5 py-4 text-sm font-semibold text-ink shadow-lg">
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

      {/* Modal livraison navette — photo + sélection multiple */}
      {deliveryModal && (() => {
        const stops = Array.isArray(mission.stops) ? mission.stops : [];
        const allPoints = [
          { address: mission.pickup_address, label: "Départ", type: "pickup", deliveryAddress: null, deliveryContactName: null, deliveryContactPhone: null },
          ...stops.map((s, i) => ({
            address: s.address,
            contact_name: s.contactName || s.contact_name,
            contact_phone: s.contactPhone || s.contact_phone,
            notes: s.notes,
            label: `Étape ${i + 1}`,
            type: "stop",
            deliveryAddress: s.deliveryAddress || s.delivery_address || null,
            deliveryContactName: s.deliveryContactName || s.delivery_contact_name || null,
            deliveryContactPhone: s.deliveryContactPhone || s.delivery_contact_phone || null,
          })),
          { address: mission.dropoff_address, label: "Arrivée", type: "dropoff", deliveryAddress: null, deliveryContactName: null, deliveryContactPhone: null },
        ];
        // Other picked-up but not yet delivered stops
        const otherPickedUp = completedStops.filter(
          idx => idx !== deliveryModal.triggerIdx && !deliveredPickups.includes(idx)
        );

        const toggleSelect = (idx) => {
          setDeliveryModal(prev => {
            const sel = prev.selectedIndices.includes(idx)
              ? prev.selectedIndices.filter(i => i !== idx)
              : [...prev.selectedIndices, idx];
            return { ...prev, selectedIndices: sel };
          });
        };

        const confirmDelivery = async () => {
          const indicesToDeliver = deliveryModal.selectedIndices;
          let publicUrl = null;
          // Upload photo if taken
          if (deliveryModal.photo) {
            try {
              setSaving(true);
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const res = await fetch(deliveryModal.photo.dataUrl);
                const blob = await res.blob();
                const fileExt = deliveryModal.photo.name.split('.').pop() || 'jpg';
                const fileName = `${user.id}/${id}/navette-stop-${Date.now()}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                  .from('delivery-photos')
                  .upload(fileName, blob, { contentType: `image/${fileExt}`, cacheControl: '3600', upsert: false });
                if (!uploadError) {
                  publicUrl = supabase.storage.from('delivery-photos').getPublicUrl(fileName).data.publicUrl;
                  const photoMap = {};
                  indicesToDeliver.forEach(idx => { photoMap[idx] = publicUrl; });
                  setDeliveryPhotos(prev => ({ ...prev, ...photoMap }));
                }
              }
            } catch (err) {
              console.error("Photo upload error:", err);
            } finally {
              setSaving(false);
            }
          }
          // Mark all selected as delivered
          setDeliveredPickups(prev => [...new Set([...prev, ...indicesToDeliver])]);



          // Save to Supabase
          const newProgress = { ...(mission.point_progress || {}) };
          const deliveredAt = new Date().toISOString();
          indicesToDeliver.forEach(idx => {
            newProgress[idx] = {
              ...(newProgress[idx] || {}),
              deliveredAt,
              deliveryRecipient: deliveryRecipient || undefined,
              deliveryDepartment: deliveryDepartment || undefined,
              deliveryComment: deliveryComment || undefined,
            };
            if (publicUrl) {
              newProgress[idx].photoUrl = publicUrl;
            }
          });
          
          const stops = Array.isArray(mission.stops) ? mission.stops : [];
          const totalPoints = stops.length + 2;
          const newDeliveredPickupsCount = new Set([...deliveredPickups, ...indicesToDeliver]).size;

          if (newDeliveredPickupsCount === totalPoints) {
            if (mission?.type === 'navette') {
              try {
                const { error: histError } = await supabase.rpc('record_navette_delivery', {
                  p_navette_id: id,
                  p_recipient: deliveryRecipient,
                  p_department: deliveryDepartment,
                  p_comment: deliveryComment,
                  p_photo_url: publicUrl || null,
                  p_point_progress: newProgress,
                });
                if (histError) throw histError;
              } catch(e) { console.error("Error saving navette history:", e); }

              const patch = {
                point_progress: { ...newProgress, last_completed_at: deliveredAt },
                picked_up_at: mission.picked_up_at || newProgress?.['0']?.pickedUpAt || null,
                status: "active",
                updated_at: deliveredAt,
                delivery_recipient: deliveryRecipient,
                delivery_department: deliveryDepartment,
                delivery_comment: deliveryComment,
                delivery_photo_url: publicUrl,
                delivered_at: deliveredAt
              };
              updateOrder(patch);
              setDeliveryRecipient("");
              setDeliveryDepartment("");
              setDeliveryComment("");
            } else {
              const patch = { 
                point_progress: newProgress,
                status: "delivered",
                delivered_at: deliveredAt,
                updated_at: deliveredAt
              };
              updateOrder(patch);
            }

            if (mission) {
              notifyDelivered({ ...mission, status: 'delivered' }, driverName);
            }
            navigate("/missions");
          } else {
            updateOrder({ point_progress: newProgress });
          }

          setDeliveryModal(null);
        };

        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto">
            <div className="w-full max-w-md my-8 rounded-3xl bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Confirmer la livraison
                </div>
                <button
                  onClick={() => setDeliveryModal(null)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <XCircleIcon />
                </button>
              </div>

              {/* Point principal */}
              {(() => {
                const pt = allPoints[deliveryModal.triggerIdx];
                return (
                  <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100/50 mb-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-[9px] font-black">{deliveryModal.triggerIdx + 1}</span>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase text-amber-600">Enlevé à</p>
                        <p className="text-[11px] font-bold text-slate-800">{pt?.address}</p>
                      </div>
                    </div>
                    {pt?.deliveryAddress && (
                      <div className="flex items-center gap-2 pl-7">
                        <div>
                          <p className="text-[9px] font-bold uppercase text-emerald-600">Livrer à</p>
                          <p className="text-[11px] font-bold text-emerald-800">{pt.deliveryAddress}</p>
                          {pt.deliveryContactName && <p className="text-[10px] text-emerald-700">{pt.deliveryContactName}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Autres points enlevés — sélection multiple (même lieu de livraison en priorité) */}
              {otherPickedUp.length > 0 && (() => {
                const triggerDelivery = allPoints[deliveryModal.triggerIdx]?.deliveryAddress || '';
                const sameAddr = triggerDelivery ? otherPickedUp.filter(idx => (allPoints[idx]?.deliveryAddress || '') === triggerDelivery) : [];
                const otherAddr = triggerDelivery ? otherPickedUp.filter(idx => (allPoints[idx]?.deliveryAddress || '') !== triggerDelivery) : otherPickedUp;
                return (
                  <div className="mb-4">
                    {sameAddr.length > 0 && (
                      <>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">
                          Même lieu de livraison
                        </p>
                        <div className="space-y-1.5 mb-3">
                          {sameAddr.map(idx => {
                            const selected = deliveryModal.selectedIndices.includes(idx);
                            return (
                              <button key={idx} type="button" onClick={() => toggleSelect(idx)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'}`}>
                                  {selected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-ink truncate">{allPoints[idx]?.label} — enlevé à {allPoints[idx]?.address}</p>
                                  <p className="text-[10px] text-emerald-600 truncate">Livrer : {allPoints[idx]?.deliveryAddress}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {otherAddr.length > 0 && (
                      <>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          Autres colis enlevés
                        </p>
                        <div className="space-y-1.5">
                          {otherAddr.map(idx => {
                            const selected = deliveryModal.selectedIndices.includes(idx);
                            return (
                              <button key={idx} type="button" onClick={() => toggleSelect(idx)}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selected ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'}`}>
                                  {selected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-ink truncate">{allPoints[idx]?.label} — enlevé à {allPoints[idx]?.address}</p>
                                  {allPoints[idx]?.deliveryAddress && <p className="text-[10px] text-muted truncate">Livrer : {allPoints[idx]?.deliveryAddress}</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Détails de réception */}
              <div className="mb-4 p-3 bg-emerald-50 rounded-2xl border border-emerald-100/50">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-3 flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[8px]">!</span>
                  Détails de réception
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex justify-between">
                      <span>Qui a réceptionné ?</span>
                      <span className="text-red-500">Requis</span>
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
                      <span className="text-red-500">Requis</span>
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

              {/* Photo */}
              <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Photo de livraison <span className="text-red-500">— Requise</span>
                </p>
                {deliveryModal.photo ? (
                  <div className="relative">
                    <img src={deliveryModal.photo.dataUrl} alt="Preuve" className="h-40 w-full rounded-2xl object-cover border border-slate-100 shadow-sm" />
                    <button
                      type="button"
                      onClick={() => { setDeliveryModal(prev => ({ ...prev, photo: null })); deliveryFileRef.current?.click(); }}
                      className="absolute bottom-2 right-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-black text-slate-700 shadow"
                    >
                      Reprendre
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => deliveryFileRef.current?.click()}
                    className="w-full py-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 flex flex-col items-center gap-2 active:bg-slate-100 transition-colors"
                  >
                    <CameraIcon />
                    <span className="text-[11px] font-bold">Prendre une photo</span>
                  </button>
                )}
              </div>

              {/* Actions */}
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!deliveryRecipient.trim() || !deliveryDepartment.trim()) {
                      alert("Veuillez renseigner le nom du réceptionnaire et le lieu de dépôt.");
                      return;
                    }
                    if (!deliveryModal.photo) {
                      alert("Veuillez prendre une photo de livraison.");
                      return;
                    }
                    confirmDelivery();
                  }}
                  disabled={saving || !deliveryModal.photo || !deliveryRecipient.trim() || !deliveryDepartment.trim()}
                  className="w-full rounded-2xl py-4 bg-emerald-600 text-white text-sm font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {deliveryModal.selectedIndices.length > 1
                    ? `Confirmer ${deliveryModal.selectedIndices.length} livraisons`
                    : 'Confirmer la livraison'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryModal(null)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-400 active:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Hidden file input for navette delivery photos */}
      <input
        ref={deliveryFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || "");
            setDeliveryModal(prev => prev ? { ...prev, photo: { dataUrl, name: file.name } } : null);
          };
          reader.readAsDataURL(file);
          e.target.value = "";
        }}
      />

      <header className="relative sticky top-0 z-30 bg-paper-card border-b border-line px-4 py-3.5 flex items-center justify-between backdrop-blur-md bg-paper-card/90">
        <div className="flex items-center gap-3">
          <Link to="/missions" className="p-2 -ml-2 rounded-[2px] active:bg-line transition-colors text-ink hover:text-accent">
            <ArrowLeftIcon />
          </Link>
          <h1 className="text-sm font-black tracking-[0.1em] uppercase text-ink">Détails Mission</h1>
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
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug pr-4">{pickupAddr}</p>
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
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug pr-4">{deliveryAddr}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 space-y-3">
          {/* NAVETTE ou COURSE MULTI-POINTS - Tous les points (départ + étapes + arrivée) */}
          {(isNavette || (Array.isArray(mission.stops) && mission.stops.length > 0)) && (() => {
            const stops = Array.isArray(mission.stops) ? mission.stops : [];
            const allPoints = [
              { address: mission.pickup_address, label: "Départ", type: "pickup", deliveryAddress: null, deliveryContactName: null, deliveryContactPhone: null },
              ...stops.map((s, i) => ({
                address: typeof s === 'string' ? s : s.address,
                contact_name: typeof s === 'string' ? null : (s.contactName || s.contact_name),
                contact_phone: typeof s === 'string' ? null : (s.contactPhone || s.contact_phone),
                notes: typeof s === 'string' ? null : s.notes,
                label: `Étape ${i + 1}`,
                type: "stop",
                deliveryAddress: typeof s === 'string' ? null : (s.deliveryAddress || s.delivery_address || null),
                deliveryContactName: typeof s === 'string' ? null : (s.deliveryContactName || s.delivery_contact_name || null),
                deliveryContactPhone: typeof s === 'string' ? null : (s.deliveryContactPhone || s.delivery_contact_phone || null),
              })),
              { address: mission.dropoff_address, label: "Arrivée", type: "dropoff", deliveryAddress: null, deliveryContactName: null, deliveryContactPhone: null },
            ];
            const totalPoints = allPoints.length;
            const pickedCount = completedStops.length;
            const deliveredCount = deliveredPickups.length;
            const activeIndex = allPoints.findIndex((_, i) => !completedStops.includes(i) && !deliveredPickups.includes(i));

            const markPickedUp = (idx, recipient, description) => {
              if (!completedStops.includes(idx)) {
                setCompletedStops(prev => [...prev, idx]);
                const newProgress = { ...(mission.point_progress || {}) };
                newProgress[idx] = { 
                  ...(newProgress[idx] || {}), 
                  pickedUpAt: new Date().toISOString(),
                  pickupRecipient: recipient,
                  pickupDescription: description
                };
                
                const updates = { point_progress: newProgress };
                if (completedStops.length === 0 && !mission.picked_up_at) {
                  updates.picked_up_at = new Date().toISOString();
                  if (["en_attente", "assigned", "confirmee"].includes(mission.status)) {
                    updates.status = "in_progress";
                  }
                }
                
                updateOrder(updates);
              }
            };
            const undoPickedUp = (idx) => {
              setCompletedStops(prev => prev.filter(i => i !== idx));
              setDeliveredPickups(prev => prev.filter(i => i !== idx));
              const newProgress = { ...(mission.point_progress || {}) };
              if (newProgress[idx]) {
                delete newProgress[idx].pickedUpAt;
                delete newProgress[idx].deliveredAt;
                delete newProgress[idx].photoUrl;
              }
              updateOrder({ point_progress: newProgress });
            };
            const undoDelivered = (idx) => {
              setDeliveredPickups(prev => prev.filter(i => i !== idx));
              const newProgress = { ...(mission.point_progress || {}) };
              if (newProgress[idx]) {
                delete newProgress[idx].deliveredAt;
                delete newProgress[idx].photoUrl;
              }
              updateOrder({ point_progress: newProgress });
            };

            return (
              <div className="space-y-3">
                {/* Barre de progression */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progression</span>
                    <span className="text-sm font-black text-ink">{deliveredCount}/{totalPoints}</span>
                  </div>
                  <div className="flex gap-1">
                    {allPoints.map((_, idx) => {
                      const delivered = deliveredPickups.includes(idx);
                      const picked = completedStops.includes(idx);
                      return (
                        <div key={idx} className={`flex-1 h-2 rounded-full transition-colors ${delivered ? 'bg-emerald-500' : picked ? 'bg-amber-400' : 'bg-slate-100'}`} />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px] font-bold text-muted">
                    <span>Enlevés : {pickedCount}</span>
                    <span>Livrés : {deliveredCount}</span>
                  </div>
                  {deliveredCount === totalPoints && (
                    <p className="mt-2 text-xs font-bold text-emerald-600 text-center">Tous les points sont livrés !</p>
                  )}
                </div>

                {/* Liste des points */}
                <div className="space-y-2">
                  {allPoints.map((point, idx) => {
                    const isPickedUp = completedStops.includes(idx);
                    const isDelivered = deliveredPickups.includes(idx);
                    const isFirst = idx === 0;
                    const isLast = idx === allPoints.length - 1;
                    const hasDeliveryAddr = !!point.deliveryAddress;
                    
                    const isPickupStep = isCollecte ? !isLast : isFirst;
                    const isDeliveryStep = isCollecte ? isLast : (hasDeliveryAddr || !isFirst);

                    const dotColor = isFirst ? 'bg-emerald-500' : isLast ? 'bg-red-500' : 'bg-blue-500';

                    // 3 states: pending (not picked up), picked up (orange), delivered (green)
                    const bgClass = isDelivered
                      ? 'bg-emerald-50/40 border-emerald-200/40 opacity-60'
                      : isPickedUp
                        ? 'bg-amber-50/60 border-amber-200/60'
                        : 'bg-white border-slate-100 shadow-sm';

                    const dotClass = isDelivered
                      ? 'bg-emerald-500'
                      : isPickedUp
                        ? 'bg-amber-500'
                        : dotColor;

                    const statusLabel = isDelivered ? 'Livré' : isPickedUp ? 'Enlevé' : null;
                    const statusColor = isDelivered ? 'text-emerald-600' : 'text-amber-600';
                    const isOpenByDefault = (idx === activeIndex || activeIndex === -1);

                    return (
                      <details key={`${idx}-${isOpenByDefault}`} className={`group rounded-2xl border overflow-hidden transition-all ${bgClass}`} open={isOpenByDefault}>
                        <summary className="p-4 cursor-pointer list-none outline-none">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${dotClass}`}>
                                {isDelivered
                                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  : isPickedUp
                                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/></svg>
                                    : <span className="text-white text-[11px] font-black">{idx + 1}</span>
                                }
                              </div>
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                isFirst ? 'bg-emerald-100 text-emerald-700' : isLast ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {point.label}
                              </span>
                              {statusLabel && <span className={`text-[9px] font-black uppercase ${statusColor}`}>{statusLabel}</span>}
                            </div>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-open:rotate-180 transition-transform"><path d="m6 9 6 6 6-6"/></svg>
                          </div>
                        </summary>

                        <div className="px-4 pb-4 border-t border-slate-100/50 pt-3">
                          {/* Section Enlèvement — masquée quand livré */}
                          {!isDelivered && isPickupStep && (
                          <div className={`rounded-xl p-3 mb-2 ${isPickedUp ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50 border border-slate-100'}`}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-1">Enlèvement</p>
                            <p className={`text-sm font-bold leading-snug ${isPickedUp ? 'text-amber-800' : 'text-ink'}`}>
                              {point.address}
                            </p>
                            {point.contact_name && (
                              <div className="text-xs text-muted mt-0.5 flex items-center gap-1">
                                <span>{point.contact_name}</span>
                                {point.contact_phone && (
                                  <>
                                    <span>—</span>
                                    <a href={`tel:${point.contact_phone}`} className="text-amber-600 font-bold hover:underline">
                                      {point.contact_phone}
                                    </a>
                                  </>
                                )}
                              </div>
                            )}
                            {point.notes && <p className="text-[10px] text-muted mt-0.5 italic">{point.notes}</p>}

                            {!isPickedUp && (
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                <button
                                  type="button"
                                  onClick={() => openMaps(point.address)}
                                  className="py-2 rounded-lg bg-white text-ink font-black text-[10px] uppercase tracking-widest active:bg-slate-100 transition-colors border border-slate-200"
                                >
                                  GPS
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPickupModal({ triggerIdx: idx, recipient: '', description: '' })}
                                  className="py-2 rounded-lg bg-amber-500 text-white font-black text-[10px] uppercase tracking-widest shadow active:scale-[0.98] transition-all"
                                >
                                  Enlever
                                </button>
                              </div>
                            )}
                            {isPickedUp && (
                              <div className="mt-3 space-y-2">
                                {mission.point_progress?.[idx]?.pickupRecipient && (
                                  <div>
                                    <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">Remis par</p>
                                    <p className="text-xs font-bold text-amber-900">{mission.point_progress[idx].pickupRecipient}</p>
                                  </div>
                                )}
                                {mission.point_progress?.[idx]?.pickupDescription && (
                                  <div>
                                    <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest">Marchandise</p>
                                    <p className="text-xs font-medium text-amber-800 italic">{mission.point_progress[idx].pickupDescription}</p>
                                  </div>
                                )}
                                <button type="button" onClick={() => undoPickedUp(idx)} className="mt-2 text-[10px] font-bold text-slate-400 underline">
                                  Annuler l'enlèvement
                                </button>
                              </div>
                            )}
                          </div>
                          )}

                          {/* Section Livraison */}
                          {isDeliveryStep && (
                            <div className={`rounded-xl p-3 ${isDelivered ? 'bg-emerald-50 border border-emerald-100' : 'bg-white border border-emerald-200'}`}>
                              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isDelivered ? 'text-emerald-600' : 'text-emerald-500'}`}>Livraison</p>
                              {hasDeliveryAddr ? (
                                <>
                                  <p className={`text-sm font-bold leading-snug ${isDelivered ? 'text-emerald-700 line-through' : 'text-ink'}`}>
                                    {point.deliveryAddress}
                                  </p>
                                  {point.deliveryContactName && (
                                    <div className="text-xs text-muted mt-0.5">
                                      {point.deliveryContactName.match(/^\d+$/) ? (
                                        <a href={`tel:${point.deliveryContactName}`} className="text-emerald-600 font-bold hover:underline">
                                          {point.deliveryContactName}
                                        </a>
                                      ) : (
                                        <div>
                                          <p>{point.deliveryContactName}</p>
                                          {point.deliveryContactPhone && (
                                            <a href={`tel:${point.deliveryContactPhone}`} className="text-emerald-600 font-bold hover:underline">
                                              {point.deliveryContactPhone}
                                            </a>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className={`text-sm font-bold leading-snug ${isDelivered ? 'text-emerald-700 line-through' : 'text-ink'}`}>
                                  {point.address}
                                </p>
                              )}

                              {!isDelivered && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => openMaps(hasDeliveryAddr ? point.deliveryAddress : point.address)}
                                    className="py-2 rounded-lg bg-white text-ink font-black text-[10px] uppercase tracking-widest active:bg-slate-100 transition-colors border border-slate-200"
                                  >
                                    GPS
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeliveryModal({ triggerIdx: idx, selectedIndices: [idx], photo: null })}
                                    className="py-2 rounded-lg bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow active:scale-[0.98] transition-all"
                                  >
                                    Livraison
                                  </button>
                                </div>
                              )}

                              {isDelivered && (
                                <div className="mt-2 space-y-1">
                                  {deliveryPhotos[idx] && (
                                    <img src={deliveryPhotos[idx]} alt="Preuve" className="h-16 w-full rounded-lg object-cover border border-emerald-100" />
                                  )}
                                  <button type="button" onClick={() => undoDelivered(idx)} className="text-[10px] font-bold text-slate-400 underline">
                                    Annuler livraison
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Les étapes sans adresse de livraison spécifique étaient gérées ici, mais elles sont maintenant incluses dans Section Livraison ci-dessus */}
                          
                          {/* Bouton Anomalie spécifique au point */}
                          {!isDelivered && (
                            <button
                              type="button"
                              onClick={() => openAnomaly(idx)}
                              className="mt-3 w-full py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-600 font-bold text-[11px] uppercase tracking-wider active:bg-red-100 transition-colors flex items-center justify-center gap-2"
                            >
                              <XCircleIcon />
                              Signaler un problème
                            </button>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
                
                {/* Modal enlèvement navette */}
                {pickupModal && (
                  <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto">
                    <div className="w-full max-w-md my-8 rounded-[32px] bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">Confirmer l'enlèvement</h3>
                        <button onClick={() => setPickupModal(null)} className="p-1 text-slate-400 hover:text-slate-600">
                          <XCircleIcon />
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/50 space-y-4">
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                              Remis par
                            </label>
                            <input
                              type="text"
                              value={pickupModal.recipient}
                              onChange={(e) => setPickupModal(prev => ({ ...prev, recipient: e.target.value }))}
                              placeholder="Ex: M. Dupont (Gardien)"
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                              Marchandise récupérée
                            </label>
                            <textarea
                              rows={2}
                              value={pickupModal.description}
                              onChange={(e) => setPickupModal(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Ex: 2 cartons, 1 enveloppe..."
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all resize-none"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              markPickedUp(pickupModal.triggerIdx, pickupModal.recipient, pickupModal.description);
                              setPickupModal(null);
                            }}
                            className="w-full rounded-2xl py-4 bg-amber-500 text-white text-sm font-black uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickupModal(null)}
                            className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-400 active:bg-slate-50 transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* MISSION CLASSIQUE - Sections ENLÈVEMENT / LIVRAISON */}
          {(!isNavette && !(Array.isArray(mission.stops) && mission.stops.length > 0)) && (
            <>
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
            </>
          )}
          {/* FIN: Affichage conditionnel missions classiques */}

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
                  <p className="text-sm font-medium text-slate-600 italic">{mission.delivery_comment}</p>
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
              <div className="p-3.5 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Type</p>
                <p className="text-sm font-bold text-slate-900 capitalize">{mission.package_type || "Colis"}</p>
              </div>
              {mission.package_description && (
                <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100/50">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-1 tracking-wider">Nature du contenu</p>
                  <p className="text-sm font-bold text-slate-900 leading-relaxed italic">{mission.package_description}</p>
                </div>
              )}

              {scheduleComment && (
                <ParsedNotes text={scheduleComment} />
              )}
            </div>
          </details>
        </section>

        <section className="p-4 pt-6 space-y-3">
          {mission.status !== "delivered" && (
            <>
              {anomalies.length > 0 && (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-3.5 space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-red-600">Anomalies signalées</p>
                  {anomalies.map((a) => (
                    <div key={a.id} className={`text-xs ${a.resolved ? "opacity-60" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-red-900">
                          {a.type}
                          <span className="ml-1.5 font-semibold text-red-400">
                            · {new Date(a.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${a.resolved ? "bg-emerald-100 text-emerald-700" : "bg-white text-red-600"}`}>
                          {a.resolved ? "Traitée" : "En traitement"}
                        </span>
                      </div>
                      {a.comment && <p className="text-red-700/80">{a.comment}</p>}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={openAnomaly}
                className="w-full bg-red-600 text-white py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] shadow-xl shadow-red-600/10 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
              >
                ⚠️ Signaler une Anomalie
              </button>

              {/* Bouton Accepter : visible quand la mission est assignée mais pas encore acceptée */}
              {mission.status === "assigned" && (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={saving}
                  className="w-full bg-emerald-600 text-white py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/10 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <CheckIcon />
                  Accepter la Mission
                </button>
              )}

              {/* Missions classiques uniquement : pour les navettes, l'enlèvement se confirme directement sur la carte du point ci-dessus */}
              {(!isNavette && !(Array.isArray(mission.stops) && mission.stops.length > 0)) && mission.status !== "assigned" && ((pickupStages.includes(mission.status) && mission.status !== "in_progress") || mission.status === "confirmee" || mission.status === "en_attente") && (
                <button
                  type="button"
                  onClick={() => setStandardPickupModal(true)}
                  disabled={saving}
                  className="w-full bg-slate-900 text-white py-4.5 rounded-2xl font-black text-[13px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/10 disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <CheckIcon />
                  Confirmer l'Enlèvement
                </button>
              )}

              {(deliveryStages.includes(mission.status) || (mission.type === 'navette' && mission.picked_up_at) || (Array.isArray(mission.stops) && mission.stops.length > 0 && mission.picked_up_at)) && (
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
