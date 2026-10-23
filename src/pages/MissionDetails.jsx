import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import OnlineSwitch from "../components/OnlineSwitch.jsx";
import { notifyPickupDone, notifyDelivered, notifyDriverAccepted } from "../lib/telegram";
import { cityOnly } from "../lib/address";
import ActionOverlay from "../components/ActionOverlay.jsx";
import { vibrateSuccess } from "../lib/chime";
import { savePendingDelivery, loadPendingDelivery, clearPendingDelivery } from "../lib/pendingDelivery";
import { savePendingPhoto, listPendingPhotos, clearPendingPhoto } from "../lib/pendingPhotos";
import { withBackgroundSend } from "../lib/backgroundSend";
import { lastStopIsArrival, countPoints, delaiLabel, formatLabel } from "../lib/missionPoints";
import { GPS_APPS, getGpsApp, setGpsApp, gpsLabel, openGps } from "../lib/gps";

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
  openGps(address);
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
  const m = t.match(/^(.*?)\s*([+\d][\d\s.\-*/()]{5,})$/);
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

function parseNoteContacts(text) {
  if (!text) return { pickup: null, dropoff: null, extra: null };
  const e = text.match(/Enl[èe]vement contact:\s*(.*?)(?=\n|$)/i);
  const l = text.match(/Livraison contact:\s*(.*?)(?=\n|$)/i);
  const n = text.match(/Notes:\s*([\s\S]*)/i);
  const hasStructure = e || l || n;
  return {
    pickup: splitContact(e?.[1]),
    dropoff: splitContact(l?.[1]),
    extra: hasStructure ? (n?.[1]?.trim() || null) : text.trim(),
  };
}

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
);

// Un point du trajet (enlèvement ou livraison) dans le bandeau du haut.
function PointBlock({ label, time, accentTime, name, address, contact, access, instructions, doneLine, navOpen, onToggleNav, gpsApp, onPickGps }) {
  const dial = contact?.phone ? contact.phone.replace(/[^\d+]/g, "") : "";
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</span>
        <span className={`font-mono text-sm font-semibold ${accentTime ? "text-accent" : ""}`}>{time}</span>
      </div>
      <p className="mt-0.5 text-[15px] font-bold leading-tight">{name}</p>

      {onToggleNav ? (
        <button type="button" onClick={onToggleNav} className="mt-1 flex w-full items-start gap-2 text-left active:opacity-70">
          <span className="flex-1 text-sm text-white/70 underline decoration-white/25 underline-offset-2">{address}</span>
          <svg className={`mt-1 shrink-0 text-accent transition-transform ${navOpen ? "rotate-90" : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      ) : (
        <p className="mt-1 text-sm text-white/70">{address}</p>
      )}

      {navOpen && (
        <div className="mt-2">
          {gpsApp ? (
            <button type="button" onClick={() => openGps(address, gpsApp)} className="w-full rounded-lg bg-accent py-3 text-sm font-bold text-white active:scale-[0.98] transition-transform">
              Ouvrir dans {gpsLabel(gpsApp)}
            </button>
          ) : (
            <>
              <p className="mb-2 text-xs text-white/60">Choisissez votre GPS (modifiable dans Profil) :</p>
              <div className="grid grid-cols-3 gap-2">
                {GPS_APPS.map((a) => (
                  <button key={a.id} type="button" onClick={() => { onPickGps(a.id); openGps(address, a.id); }} className="rounded-lg bg-white/10 px-2 py-2.5 text-xs font-bold text-white active:bg-white/20">
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {contact && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Contact</p>
            <p className="truncate text-sm font-bold capitalize">{contact.name || "Contact"}</p>
            {contact.phone && <p className="text-xs text-white/60 tabular-nums">{contact.phone}</p>}
          </div>
          {dial.length >= 6 && (
            <a href={`tel:${dial}`} aria-label={`Appeler ${contact.name || label}`} className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-white active:scale-95 transition-transform">
              <PhoneIcon />
              Appeler
            </a>
          )}
        </div>
      )}

      {(access || instructions) && (
        <div className="mt-2 rounded-lg border border-white/15 px-3 py-2">
          {access && <p className="text-sm font-bold"><span className="text-accent">CODE / ACCÈS :</span> {access}</p>}
          {instructions && <p className="text-sm text-white/80 leading-snug">{instructions}</p>}
        </div>
      )}

      {doneLine && <p className="mt-2 text-xs text-white/70">{doneLine}</p>}
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
  const [navFor, setNavFor] = useState(null);
  const [deliveryUi, setDeliveryUi] = useState(null); // null | "sending" | "success"
  const [gpsApp, setGpsAppState] = useState(() => getGpsApp());
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  // Tracking for standard orders pickup modal
  const [standardPickupModal, setStandardPickupModal] = useState(false);
  const [pickupRecipient, setPickupRecipient] = useState("");
  const [pickupDescription, setPickupDescription] = useState("");
  const [pickupMatch, setPickupMatch] = useState(null); // true = conforme à l'annonce, false = différent

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

  const updateOrder = withBackgroundSend(async (patch, extraFilters) => {
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
      return true;
    }
    setSaving(false);
    return false;
  });

  // Envoie une photo puis la rattache à la commande. `extra` garde les infos de livraison du moment.
  const uploadPhotoAndAttach = withBackgroundSend(async (dataUrl, name, kind, extra) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Utilisateur non connecté");

    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const fileExt = name.split('.').pop() || 'jpg';
    const filePath = `${user.id}/${id}/${Date.now()}.${fileExt}`;

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

    const patch = kind === "delivery"
      ? { delivery_photo_url: publicUrl, ...extra }
      : { pickup_photo_url: publicUrl };

    await updateOrder(patch);
    return publicUrl;
  });

  // Photos en cours d'envoi (pour ne pas les renvoyer deux fois)
  const photosInFlightRef = useRef(new Set());

  const savePhoto = async (dataUrl, name) => {
    let pendingId = null;
    try {
      setSaving(true);
      const kind = (mission.status === "picked_up" || mission.status === "in_progress") ? "delivery" : "pickup";
      const extra = kind === "delivery" ? {
        ...(deliveryRecipient ? { delivery_recipient: deliveryRecipient } : {}),
        ...(deliveryDepartment ? { delivery_department: deliveryDepartment } : {}),
        ...(deliveryComment ? { delivery_comment: deliveryComment } : {}),
      } : {};
      // La photo reste sur le téléphone jusqu'à son envoi réussi
      pendingId = await savePendingPhoto(id, kind, dataUrl, name, extra).catch(() => null);
      if (pendingId) photosInFlightRef.current.add(pendingId);
      const url = await uploadPhotoAndAttach(dataUrl, name, kind, extra);
      if (pendingId) await clearPendingPhoto(pendingId).catch(() => {});
      return url;
    } catch (err) {
      console.error("Error uploading photo:", err);
      alert("Erreur lors de l'upload de la photo: " + err.message);
    } finally {
      if (pendingId) photosInFlightRef.current.delete(pendingId);
      setSaving(false);
    }
  };

  // Reprise des photos non envoyées (appli fermée ou réseau coupé pendant l'envoi)
  const photosResumedRef = useRef(false);
  useEffect(() => {
    if (!mission || mission.type === 'navette' || photosResumedRef.current) return;
    photosResumedRef.current = true;
    listPendingPhotos(id).then(async (pending) => {
      for (const p of pending) {
        if (photosInFlightRef.current.has(p.id)) continue;
        photosInFlightRef.current.add(p.id);
        try {
          await uploadPhotoAndAttach(p.dataUrl, p.name, p.kind, p.extra || {});
          await clearPendingPhoto(p.id);
        } catch (err) {
          console.error("Reprise photo impossible, nouvel essai plus tard:", err);
        } finally {
          photosInFlightRef.current.delete(p.id);
        }
      }
    }).catch(() => {});
  }, [mission, id]);

  const completeDelivery = async () => {
    const now = new Date().toISOString();
    let ok = false;
    setDeliveryUi("sending");
    
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
      ok = await updateOrder(patch);
    } else {
      const patch = {
        status: "delivered",
        updated_at: now,
        delivered_at: now,
        delivery_recipient: deliveryRecipient,
        delivery_department: deliveryDepartment,
        delivery_comment: deliveryComment
      };
      // Sauvegardé avant l'envoi : si l'app se ferme maintenant, elle renverra la validation au prochain lancement
      savePendingDelivery(id, patch);
      ok = await updateOrder(patch);
      if (ok) clearPendingDelivery(id);
    }

    if (!ok) {
      setDeliveryUi(null);
      return;
    }

    if (mission) {
      notifyDelivered({ ...mission, status: 'delivered' }, driverName);
    }
    setDeliveryUi("success");
    vibrateSuccess();
    await new Promise((resolve) => setTimeout(resolve, 1900));
    navigate("/missions");
  };

  // Reprise d'une validation interrompue (batterie vide, appli fermée pendant l'envoi)
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!mission || mission.type === 'navette' || resumedRef.current) return;
    const pending = loadPendingDelivery(id);
    if (!pending) return;
    resumedRef.current = true;
    if (mission.status === 'delivered') {
      clearPendingDelivery(id);
      return;
    }
    updateOrder(pending.patch).then((ok) => {
      if (ok) clearPendingDelivery(id);
    });
  }, [mission, id]);

  const handleRefuse = async () => {
    if (!window.confirm("Refuser cette mission ? Elle repartira au dispatch.")) return;
    setSaving(true);
    const { error } = await supabase.rpc("driver_refuse_order", { p_order_id: id });
    setSaving(false);
    if (error) {
      alert("Impossible de refuser la mission : " + error.message);
      return;
    }
    navigate("/missions");
  };

  // Tous les points sont livrés : on termine la course sans reprendre de photo
  const completeCourseNoPhoto = async () => {
    const deliveredAt = new Date().toISOString();
    const ok = await updateOrder({
      status: "delivered",
      delivered_at: deliveredAt,
      updated_at: deliveredAt,
      point_progress: mission.point_progress || {},
    });
    if (ok) {
      notifyDelivered({ ...mission, status: "delivered" }, driverName);
      navigate("/missions");
    }
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

  // Course terminée : plus aucune information de la course n'est affichée.
  if (["delivered", "livree"].includes(mission.status)) {
    return (
      <div className="min-h-screen bg-paper text-ink">
        {deliveryUi === "sending" && <ActionOverlay mode="sending" label="Validation de la livraison…" />}
        {deliveryUi === "success" && <ActionOverlay mode="success" title="Livraison validée" subtitle="Merci, bonne continuation." />}
        <header className="relative sticky top-0 z-30 bg-paper-card/95 border-b border-line px-4 py-3.5 flex items-center backdrop-blur-md">
          <Link to="/map" className="p-2 -ml-2 rounded-[2px] active:bg-line transition-colors text-ink">
            <ArrowLeftIcon />
          </Link>
          <h1 className="ml-3 text-base font-bold tracking-tight text-ink">Mission</h1>
        </header>
        <main className="px-4 pt-16">
          <div className="flex flex-col items-center rounded-xl border border-line bg-paper-card px-6 py-12 text-center">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckIcon />
            </div>
            <p className="text-base font-bold text-ink">Course terminée</p>
            <p className="mt-1.5 max-w-[16rem] text-sm text-muted">Les informations de cette course ne sont plus disponibles.</p>
            <Link to="/map" className="mt-6 rounded-xl bg-ink px-5 py-3 text-sm font-bold text-white active:scale-[0.98] transition-transform">
              Retour à l'historique
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {anomalyOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-[2px]" onClick={() => setAnomalyOpen(false)}>
          <div
            className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-paper-card shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>

            <div className="flex items-start justify-between px-5 pb-3 pt-3">
              <div>
                <h3 className="text-lg font-bold leading-tight tracking-tight text-ink">Signaler un problème</h3>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-label">
                  Course {mission?.tracking_code || `#${String(mission?.id || "").slice(0, 6)}`}
                </p>
              </div>
              <button onClick={() => setAnomalyOpen(false)} aria-label="Fermer" className="-mr-1 p-1 text-label active:text-ink"><XCircleIcon /></button>
            </div>

            <div className="px-5">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1">
                {[["enlevement", "Enlèvement"], ["livraison", "Livraison"], ["general", "Autre"]].map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setAnomalyStep(k); setAnomalyType(""); }}
                    className={`rounded-lg py-2.5 text-sm font-bold transition-colors ${anomalyStep === k ? "bg-paper-card text-ink shadow-sm" : "text-label"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2 pt-4">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-label">Que se passe-t-il ?</p>
              <div className="space-y-2">
                {ANOMALIES[anomalyStep].map((t) => {
                  const active = anomalyType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAnomalyType(t)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-[15px] font-semibold transition-colors ${active ? "border-accent bg-accent/10 text-ink" : "border-line bg-paper text-ink active:bg-line"}`}
                    >
                      <span>{t}</span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-accent bg-accent text-white" : "border-line"}`}>
                        {active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="mb-1.5 mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-label">
                <span>Précisions</span>
                <span className={anomalyType === "Autre" ? "text-accent" : ""}>{anomalyType === "Autre" ? "Obligatoire" : "Facultatif"}</span>
              </label>
              <textarea
                rows={3}
                value={anomalyComment}
                onChange={(e) => setAnomalyComment(e.target.value)}
                placeholder={anomalyType === "Autre" ? "Décrivez le problème" : "Ajoutez un détail utile (facultatif)"}
                className="w-full resize-none rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink outline-none placeholder:text-label focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>

            <div className="border-t border-line px-5 pb-4 pt-3">
              <button
                type="button"
                disabled={anomalySending || !anomalyType || (anomalyType === "Autre" && !anomalyComment.trim())}
                onClick={submitAnomaly}
                className="w-full rounded-xl bg-accent py-4 text-base font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
              >
                {anomalySending ? "Envoi…" : "Envoyer à One Connexion"}
              </button>
            </div>
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
              {(() => {
                const declared = String(mission?.package_type || mission?.format || "").trim();
                const label = declared ? declared.charAt(0).toUpperCase() + declared.slice(1) : "Non précisé";
                return (
                  <div className="rounded-xl border border-line bg-paper p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-label">Annoncé par le client</p>
                    <p className="mt-1 text-lg font-bold text-ink">{label}</p>
                    {mission?.package_description && <p className="text-sm text-muted">{mission.package_description}</p>}
                    <p className="mt-3 text-xs font-semibold text-muted">Ce que vous récupérez correspond-il ?</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPickupMatch(true)}
                        className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${pickupMatch === true ? "border-accent bg-accent text-white" : "border-line bg-paper-card text-ink"}`}
                      >
                        Conforme
                      </button>
                      <button
                        type="button"
                        onClick={() => setPickupMatch(false)}
                        className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${pickupMatch === false ? "border-red-600 bg-red-600 text-white" : "border-line bg-paper-card text-ink"}`}
                      >
                        Différent
                      </button>
                    </div>
                  </div>
                );
              })()}
              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/50 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Récupéré auprès de
                  </label>
                  <input
                    type="text"
                    value={pickupRecipient}
                    onChange={(e) => setPickupRecipient(e.target.value)}
                    placeholder="Ex: Marie, à l'accueil"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Ce que vous avez récupéré
                  </label>
                  <textarea
                    rows={2}
                    value={pickupDescription}
                    onChange={(e) => setPickupDescription(e.target.value)}
                    placeholder="Ex: 1 pli, 2 cartons..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all resize-none"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={pickupMatch === null || !pickupRecipient.trim() || !pickupDescription.trim()}
                  onClick={() => {
                    const declared = String(mission?.package_type || mission?.format || "").trim() || "non précisé";
                    const description = pickupMatch === false
                      ? `DIFFÉRENT de l'annonce (${declared}) : ${pickupDescription.trim()}`
                      : pickupDescription.trim();
                    handlePickup(pickupRecipient.trim(), description);
                    setStandardPickupModal(false);
                  }}
                  className="w-full rounded-2xl py-4 bg-accent text-white text-sm font-bold shadow-lg disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                  Confirmer l'enlèvement
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

      {deliveryUi === "sending" && <ActionOverlay mode="sending" label="Validation de la livraison…" />}
      {deliveryUi === "success" && <ActionOverlay mode="success" title="Livraison validée" subtitle="Merci, bonne continuation." />}
      {saving && !deliveryUi && <ActionOverlay mode="sending" label="Enregistrement…" />}
      {pendingPhoto && (() => {
        const isDeliver = pendingAction === "DELIVER";
        const showDetails = isDeliver || (deliveryStages.includes(mission?.status) && pendingAction === "PROOF");
        const missing = isDeliver && (!deliveryRecipient.trim() || !deliveryDepartment.trim());
        const close = () => { setPendingPhoto(null); setPendingAction(null); };
        const PLACES = ["En main propre", "Accueil", "Gardien", "Boîte aux lettres", "Voisin"];
        const FIELD = "w-full rounded-xl border border-line bg-paper px-4 py-3 text-[15px] text-ink outline-none placeholder:text-label focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all";

        const confirm = async () => {
          const action = pendingAction;
          const photo = pendingPhoto;
          if (action === "DELIVER" && (!deliveryRecipient.trim() || !deliveryDepartment.trim())) return;

          setPendingPhoto(null);
          setPendingAction(null);
          if (action === "DELIVER") setDeliveryUi("sending");

          try {
            if (photo) await savePhoto(photo.dataUrl, photo.name);
            if (action === "DELIVER") {
              await completeDelivery();
            }
          } catch (err) {
            console.error("Delivery error:", err);
            setDeliveryUi(null);
          }
        };

        return (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-[2px]" onClick={close}>
            <div
              className="flex max-h-[94dvh] w-full max-w-md flex-col rounded-t-2xl bg-paper-card shadow-2xl"
              style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2.5"><span className="h-1 w-10 rounded-full bg-line" /></div>

              <div className="flex items-start justify-between px-5 pb-3 pt-3">
                <div>
                  <h3 className="text-lg font-bold leading-tight tracking-tight text-ink">{isDeliver ? "Finaliser la livraison" : "Valider la photo"}</h3>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-label">
                    Course {mission?.tracking_code || `#${String(mission?.id || "").slice(0, 6)}`}
                  </p>
                </div>
                <button onClick={close} aria-label="Fermer" className="-mr-1 p-1 text-label active:text-ink"><XCircleIcon /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-2">
                {/* Photo de preuve */}
                <div className="relative overflow-hidden rounded-xl border border-line">
                  <img src={pendingPhoto.dataUrl} alt="Preuve de livraison" className="h-44 w-full object-cover" />
                  <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white backdrop-blur-sm">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    Photo de preuve
                  </span>
                  <button
                    type="button"
                    onClick={() => { close(); fileRef.current?.click(); }}
                    className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm active:bg-black/80"
                  >
                    <CameraIcon />
                    Reprendre
                  </button>
                </div>

                {showDetails && (
                  <div className="mt-5 space-y-5">
                    <label className="grid gap-1.5">
                      <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-label">
                        <span>Qui a réceptionné ?</span>
                        {isDeliver && <span className="text-accent">Obligatoire</span>}
                      </span>
                      <input
                        type="text"
                        value={deliveryRecipient}
                        onChange={(e) => setDeliveryRecipient(e.target.value)}
                        placeholder="Ex : Marie Dupont"
                        autoComplete="off"
                        className={FIELD}
                      />
                    </label>

                    <div className="grid gap-2">
                      <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-label">
                        <span>Où le colis a-t-il été remis ?</span>
                        {isDeliver && <span className="text-accent">Obligatoire</span>}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {PLACES.map((place) => {
                          const active = deliveryDepartment === place;
                          return (
                            <button
                              key={place}
                              type="button"
                              onClick={() => setDeliveryDepartment(active ? "" : place)}
                              className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${active ? "border-accent bg-accent text-white" : "border-line bg-paper text-ink active:bg-line"}`}
                            >
                              {place}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="text"
                        value={deliveryDepartment}
                        onChange={(e) => setDeliveryDepartment(e.target.value)}
                        placeholder="Ou précisez : 2e étage, bureau 12…"
                        autoComplete="off"
                        className={FIELD}
                      />
                    </div>

                    <label className="grid gap-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-label">Commentaire (facultatif)</span>
                      <textarea
                        rows={2}
                        value={deliveryComment}
                        onChange={(e) => setDeliveryComment(e.target.value)}
                        placeholder="Infos utiles, état du colis…"
                        className={`${FIELD} resize-none`}
                      />
                    </label>
                  </div>
                )}
                <div className="h-3" />
              </div>

              <div className="border-t border-line px-5 pb-4 pt-3">
                {missing && <p className="mb-2 text-center text-xs text-muted">Indiquez qui a réceptionné et où le colis a été remis.</p>}
                <button
                  type="button"
                  disabled={missing}
                  onClick={confirm}
                  className="w-full rounded-xl bg-accent py-4 text-base font-bold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {isDeliver ? "Confirmer la livraison" : "Valider la photo"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
            label: lastStopIsArrival(mission) && i === stops.length - 1 ? "Arrivée" : `Étape ${i + 1}`,
            type: "stop",
            deliveryAddress: s.deliveryAddress || s.delivery_address || null,
            deliveryContactName: s.deliveryContactName || s.delivery_contact_name || null,
            deliveryContactPhone: s.deliveryContactPhone || s.delivery_contact_phone || null,
          })),
          ...(lastStopIsArrival(mission) ? [] : [{ address: mission.dropoff_address, label: "Arrivée", type: "dropoff", deliveryAddress: null, deliveryContactName: null, deliveryContactPhone: null }]),
        ];
        // Une livraison = le point sur lequel on a cliqué (pas de sélection des autres colis)
        const otherPickedUp = [];

        const toggleSelect = (idx) => {
          setDeliveryModal(prev => {
            const sel = prev.selectedIndices.includes(idx)
              ? prev.selectedIndices.filter(i => i !== idx)
              : [...prev.selectedIndices, idx];
            return { ...prev, selectedIndices: sel };
          });
        };

        // Photo de livraison déjà prise sur un point précédent : pas besoin de la reprendre
        const existingPhoto = deliveryModal.photo
          ? null
          : (Object.values(mission.point_progress || {}).map((p) => p?.photoUrl).find(Boolean) || mission.delivery_photo_url || null);
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
          if (!publicUrl && existingPhoto) publicUrl = existingPhoto;
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
          const totalPoints = countPoints(mission);
          const newDeliveredPickupsCount = new Set([...deliveredPickups, ...indicesToDeliver]).size;

          // Course normale : le départ est un enlèvement, la course est livrée dès que toutes les livraisons sont faites
          const newSet = new Set([...deliveredPickups, ...indicesToDeliver]);
          const allDelivered = mission?.type === 'navette'
            ? newDeliveredPickupsCount === totalPoints
            : Array.from({ length: totalPoints - 1 }, (_, i) => i + 1).every((i) => newSet.has(i));
          if (allDelivered) {
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
                updated_at: deliveredAt,
                delivery_recipient: deliveryRecipient || mission.delivery_recipient || null,
                delivery_department: deliveryDepartment || mission.delivery_department || null,
                delivery_comment: deliveryComment || mission.delivery_comment || null,
                ...(publicUrl ? { delivery_photo_url: publicUrl } : {}),
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
            <div className="w-full max-w-md my-8 rounded-xl border border-line bg-paper-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">
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
                  <div className="mb-3 space-y-3 border-b border-line pb-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-label">Enlevé à</p>
                        <p className="text-sm text-ink">{pt?.address}</p>
                      </div>
                    </div>
                    {pt?.deliveryAddress && (
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-label">Livrer à</p>
                          <p className="text-sm text-ink">{pt.deliveryAddress}</p>
                          {pt.deliveryContactName && <p className="text-xs text-muted">{pt.deliveryContactName}</p>}
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
                      placeholder="Ex: Marie, à l'accueil"
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
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-label mb-2">
                  Photo de livraison <span className="text-red-500">— Requise</span>
                </p>
                {deliveryModal.photo ? (
                  <div className="relative">
                    <img src={deliveryModal.photo.dataUrl} alt="Preuve" className="h-40 w-full rounded-lg object-cover border border-line" />
                    <button
                      type="button"
                      onClick={() => { setDeliveryModal(prev => ({ ...prev, photo: null })); deliveryFileRef.current?.click(); }}
                      className="absolute bottom-2 right-2 rounded-md border border-line bg-paper-card px-3 py-1.5 text-[11px] font-bold text-ink"
                    >
                      Reprendre
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => deliveryFileRef.current?.click()}
                    className="w-full py-8 rounded-lg border border-dashed border-line text-muted flex flex-col items-center gap-2 active:bg-line transition-colors"
                  >
                    <CameraIcon />
                    <span className="text-xs font-bold">Prendre une photo</span>
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
                    if (!deliveryModal.photo && !existingPhoto) {
                      alert("Veuillez prendre une photo de livraison.");
                      return;
                    }
                    confirmDelivery();
                  }}
                  disabled={saving || (!deliveryModal.photo && !existingPhoto) || !deliveryRecipient.trim() || !deliveryDepartment.trim()}
                  className="w-full rounded-lg py-3.5 bg-accent text-white text-sm font-bold active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {deliveryModal.selectedIndices.length > 1
                    ? `Confirmer ${deliveryModal.selectedIndices.length} livraisons`
                    : 'Confirmer la livraison'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryModal(null)}
                  className="w-full rounded-lg border border-line py-3 text-sm font-bold text-muted active:bg-line transition-colors"
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

      <header className="relative sticky top-0 z-30 bg-paper-card/95 border-b border-line px-4 py-3.5 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link to="/missions" className="p-2 -ml-2 rounded-[2px] active:bg-line transition-colors text-ink hover:text-accent">
            <ArrowLeftIcon />
          </Link>
          <h1 className="text-base font-bold tracking-tight text-ink">Mission</h1>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2" style={{ top: "calc(50% + env(safe-area-inset-top, 0px) / 2)" }}>
          <OnlineSwitch />
        </div>
        <div className="flex items-center gap-2" />
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <section className="px-4 pt-4">
          {(() => {
            const notes = parseNoteContacts(scheduleComment);
            const fallbackContact = !notes.pickup && (mission.contact_name || mission.contact_phone)
              ? { name: mission.contact_name || "", phone: mission.contact_phone || "" }
              : null;
            const pickupContact = notes.pickup || fallbackContact;
            const pkgType = String(mission.package_type || mission.format || "").trim();
            const pkgSpeed = String(mission.delai || "").trim();
            const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
            const pp = mission.point_progress?.["0"];
            const pickedLine = pp?.pickupRecipient || pp?.pickupDescription
              ? `Enlevé${pp.pickupRecipient ? ` — remis par ${pp.pickupRecipient}` : ""}${pp.pickupDescription ? ` (${pp.pickupDescription})` : ""}`
              : null;
            const deliveredLine = mission.delivery_recipient
              ? `Livré — réceptionné par ${mission.delivery_recipient}${mission.delivery_department ? ` (${mission.delivery_department})` : ""}`
              : null;
            const isDone = ["delivered", "livree"].includes(mission.status);
            const hidePhone = (c) => (c && isDone ? { name: c.name, phone: "" } : c);
            const toggle = (k) => setNavFor((v) => (v === k ? null : k));
            const pickGps = (id) => { setGpsApp(id); setGpsAppState(id); };
            const stopList = Array.isArray(mission.stops) ? mission.stops.filter((x) => x && typeof x !== "string") : [];
            const multiStops = stopList.length > 0 ? { list: stopList, arrival: lastStopIsArrival(mission) } : null;

            return (
              <div className="rounded-xl bg-ink p-5 text-white shadow-md">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                    {statusTitle(mission.status)}
                  </span>
                  <span className="font-mono text-[11px] text-white/50">{mission.tracking_code || `#${String(mission.id).slice(0, 6)}`}</span>
                </div>

                {multiStops && (() => {
                  const total = countPoints(mission);
                  const done = deliveredPickups.length;
                  return (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Progression</span>
                        <span className="font-mono text-xs font-semibold text-white">{done}/{total}</span>
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: total }).map((_, idx) => {
                          const delivered = deliveredPickups.includes(idx);
                          const picked = completedStops.includes(idx);
                          return (
                            <div
                              key={idx}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${delivered ? "bg-emerald-500" : picked ? "bg-amber-400" : "bg-white/15"}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {(pkgType || pkgSpeed || mission.package_description || mission.notes) && (
                  <div className="mt-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Annoncé par le client</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {pkgType && <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-bold">{formatLabel(pkgType)}</span>}
                    {pkgSpeed && <span className="rounded-md bg-accent/20 px-2.5 py-1 text-xs font-bold text-accent">{delaiLabel(pkgSpeed)}</span>}
                    {mission.package_description && <span className="text-xs text-white/70">{mission.package_description}</span>}
                    </div>
                    {(mission.package_description || mission.notes) && (
                      <div className="mt-3 rounded-lg bg-white/10 p-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">Contenu de la course</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-white">{mission.package_description || mission.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5 flex gap-3">
                  <div className="flex flex-col items-center pt-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border-2 border-white" />
                    <span className="my-1 w-px flex-1 bg-white/25" />
                    <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-6">
                    <PointBlock
                      label="Enlèvement"
                      time={formatDateTime(mission.scheduled_at)}
                      name={pickupName}
                      address={isDone ? cityOnly(pickupAddr, mission.pickup_city, mission.pickup_postal_code) : [pickupAddr, pickupCity].filter(Boolean).join(", ")}
                      contact={hidePhone(pickupContact)}
                      access={isDone ? null : mission.pickup_access_code}
                      instructions={isDone ? null : pickupInstructions}
                      doneLine={pickedLine}
                      navOpen={navFor === "pickup"}
                      onToggleNav={isDone ? null : () => toggle("pickup")}
                      gpsApp={gpsApp}
                      onPickGps={pickGps}
                    />
                    {multiStops ? (
                      <>
                        {!completedStops.includes(0) && mission.status !== "assigned" && mission.status !== "delivered" && (
                          <button
                            type="button"
                            onClick={() => setPickupModal({ triggerIdx: 0, recipient: "", description: "" })}
                            className="w-full py-3 rounded-lg bg-accent text-white font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-all"
                          >
                            Enlever
                          </button>
                        )}
                        {multiStops.list.map((st, k) => {
                          const isArr = multiStops.arrival && k === multiStops.list.length - 1;
                          const pIdx = k + 1;
                          const readyToDeliver = completedStops.includes(pIdx) && !deliveredPickups.includes(pIdx);
                          return (
                            <div key={`stop-${k}`} className="space-y-2">
                            <PointBlock
                              label={isArr ? "Arrivée" : `Livraison ${k + 1}`}
                              time={mission.delivery_deadline ? formatDateTime(mission.delivery_deadline) : "Dès que possible"}
                              accentTime
                              name={st.deliveryContactName || `Destinataire ${k + 1}`}
                              address={st.deliveryAddress}
                              contact={null}
                              access={null}
                              instructions={null}
                              doneLine={deliveredPickups.includes(pIdx) ? (mission.point_progress?.[String(pIdx)]?.deliveryRecipient ? `Livré — réceptionné par ${mission.point_progress[String(pIdx)].deliveryRecipient}` : "Livré") : null}
                              navOpen={navFor === `stop-${k}`}
                              onToggleNav={() => toggle(`stop-${k}`)}
                              gpsApp={gpsApp}
                              onPickGps={pickGps}
                            />
                            {readyToDeliver && (
                              <button
                                type="button"
                                onClick={() => setDeliveryModal({ triggerIdx: pIdx, selectedIndices: [pIdx], photo: null })}
                                className="w-full py-3 rounded-lg bg-emerald-600 text-white font-black text-sm uppercase tracking-wider active:scale-[0.98] transition-all"
                              >
                                Livrer
                              </button>
                            )}
                            </div>
                          );
                        })}
                        {mission.status !== "delivered" && Array.from({ length: countPoints(mission) - 1 }, (_, i) => i + 1).every((i) => deliveredPickups.includes(i)) && (
                          <button
                            type="button"
                            onClick={completeCourseNoPhoto}
                            disabled={saving}
                            className="w-full py-3.5 rounded-lg bg-emerald-600 text-white font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                          >
                            Valider la course
                          </button>
                        )}
                        {!multiStops.arrival && (
                          <PointBlock
                            label="Arrivée"
                            time={mission.delivery_deadline ? formatDateTime(mission.delivery_deadline) : "Dès que possible"}
                            accentTime
                            name={deliveryName}
                            address={[deliveryAddr, deliveryCity].filter(Boolean).join(", ")}
                            contact={null}
                            access={null}
                            instructions={null}
                            doneLine={deliveredPickups.includes(countPoints(mission) - 1) ? "Livré" : null}
                            navOpen={navFor === "delivery"}
                            onToggleNav={() => toggle("delivery")}
                            gpsApp={gpsApp}
                            onPickGps={pickGps}
                          />
                        )}
                      </>
                    ) : (
                    <PointBlock
                      label="Livraison"
                      time={mission.delivery_deadline ? formatDateTime(mission.delivery_deadline) : "Dès que possible"}
                      accentTime
                      name={deliveryName}
                      address={isDone ? cityOnly(deliveryAddr, mission.delivery_city, mission.delivery_postal_code) : [deliveryAddr, deliveryCity].filter(Boolean).join(", ")}
                      contact={hidePhone(notes.dropoff)}
                      access={isDone ? null : mission.delivery_access_code}
                      instructions={isDone ? null : deliveryInstructions}
                      doneLine={deliveredLine}
                      navOpen={navFor === "delivery"}
                      onToggleNav={isDone ? null : () => toggle("delivery")}
                      gpsApp={gpsApp}
                      onPickGps={pickGps}
                    />
                    )}
                  </div>
                </div>

                              </div>
            );
          })()}
        </section>

        <section className="px-4 pt-4 space-y-3">
          {mission.status !== "delivered" && (
            <>
              {/* Bouton Accepter : visible quand la mission est assignée mais pas encore acceptée */}
              {mission.status === "assigned" && (
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={saving}
                  className="w-full bg-accent text-white py-4 rounded-xl font-bold text-base shadow-md disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
                >
                  <CheckIcon />
                  Accepter la mission
                </button>
              )}

              {/* Refus : la course repart au dispatch, qui peut la réassigner */}
              {mission.status === "assigned" && (
                <button
                  type="button"
                  onClick={handleRefuse}
                  disabled={saving}
                  className="w-full border border-accent/40 text-accent py-4 rounded-xl font-bold text-base disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  Refuser la mission
                </button>
              )}

              {/* Missions classiques uniquement : pour les navettes, l'enlèvement se confirme directement sur la carte du point ci-dessus */}
              {(!isNavette && !(Array.isArray(mission.stops) && mission.stops.length > 0)) && mission.status !== "assigned" && ((pickupStages.includes(mission.status) && mission.status !== "in_progress") || mission.status === "confirmee" || mission.status === "en_attente") && (
                <button
                  type="button"
                  onClick={() => { setPickupMatch(null); setStandardPickupModal(true); }}
                  disabled={saving}
                  className="w-full bg-accent text-white py-4 rounded-xl font-bold text-base shadow-md disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
                >
                  <CheckIcon />
                  Confirmer l'enlèvement
                </button>
              )}

              {!(Array.isArray(mission.stops) && mission.stops.length > 0) && (deliveryStages.includes(mission.status) || (mission.type === 'navette' && mission.picked_up_at)) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction("DELIVER");
                      fileRef.current?.click();
                    }}
                    disabled={saving}
                    className="w-full bg-accent text-white py-4 rounded-xl font-bold text-base shadow-md disabled:opacity-50 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
                  >
                    <CheckIcon />
                    Valider la livraison
                  </button>

                </>
              )}

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
                className="w-full border border-red-200 bg-red-50 text-red-700 py-3.5 rounded-xl font-bold text-sm disabled:opacity-50 active:bg-red-100 transition-colors flex items-center justify-center gap-2"
              >
                <XCircleIcon />
                Signaler un problème
              </button>

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
                label: lastStopIsArrival(mission) && i === stops.length - 1 ? "Arrivée" : `Étape ${i + 1}`,
                type: "stop",
                deliveryAddress: typeof s === 'string' ? null : (s.deliveryAddress || s.delivery_address || null),
                deliveryContactName: typeof s === 'string' ? null : (s.deliveryContactName || s.delivery_contact_name || null),
                deliveryContactPhone: typeof s === 'string' ? null : (s.deliveryContactPhone || s.delivery_contact_phone || null),
              })),
              ...(lastStopIsArrival(mission) ? [] : [{ address: mission.dropoff_address, label: "Arrivée", type: "dropoff", deliveryAddress: null, deliveryContactName: null, deliveryContactPhone: null }]),
            ];
            const totalPoints = allPoints.length;
            const pickedCount = completedStops.length;
            const deliveredCount = deliveredPickups.length;
            const activeIndex = allPoints.findIndex((_, i) => !completedStops.includes(i) && !deliveredPickups.includes(i));

            // Arrêts dont l'enlèvement est déjà fait au départ (même adresse) : pas de second enlèvement
            const normAddr = (v) => String(v || "").trim().toLowerCase();
            const samePickupIdxs = allPoints
              .map((pt, i) => (i > 0 && pt.type === "stop" && normAddr(pt.address) === normAddr(mission.pickup_address) ? i : null))
              .filter((i) => i !== null);
            const markPickedUp = (idx, recipient, description) => {
              if (!completedStops.includes(idx)) {
                const alsoIdxs = idx === 0 ? samePickupIdxs.filter((i) => !completedStops.includes(i)) : [];
                setCompletedStops(prev => [...prev, idx, ...alsoIdxs]);
                const newProgress = { ...(mission.point_progress || {}) };
                newProgress[idx] = { 
                  ...(newProgress[idx] || {}), 
                  pickedUpAt: new Date().toISOString(),
                  pickupRecipient: recipient,
                  pickupDescription: description
                };
                alsoIdxs.forEach((i) => {
                  newProgress[i] = { ...(newProgress[i] || {}), pickedUpAt: new Date().toISOString(), pickupRecipient: recipient, pickupDescription: description };
                });
                
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
                <div className="hidden">
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
                              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isDelivered ? 'text-emerald-600' : 'text-emerald-500'}`}>{isLast ? "Arrivée" : "Livraison"}</p>
                              {hasDeliveryAddr ? (
                                <>
                                  <p className={`text-sm font-bold leading-snug ${isDelivered ? 'text-emerald-700 line-through' : 'text-ink'}`}>
                                    {isDelivered ? cityOnly(point.deliveryAddress) : point.deliveryAddress}
                                  </p>
                                  {point.deliveryContactName && !isDelivered && (
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
                                  {isDelivered ? cityOnly(point.address) : point.address}
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
                                    {isLast ? "Arrivée" : "Livraison"}
                                  </button>
                                </div>
                              )}

                              {isDelivered && (
                                <div className="mt-2 space-y-1">
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
                              Récupéré auprès de
                            </label>
                            <input
                              type="text"
                              value={pickupModal.recipient}
                              onChange={(e) => setPickupModal(prev => ({ ...prev, recipient: e.target.value }))}
                              placeholder="Ex: Marie, à l'accueil"
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                              Ce que vous avez récupéré
                            </label>
                            <textarea
                              rows={2}
                              value={pickupModal.description}
                              onChange={(e) => setPickupModal(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Ex: 1 pli, 2 cartons..."
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

            </div>
          )}

          
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
