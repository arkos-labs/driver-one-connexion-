import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import OnlineSwitch from "../components/OnlineSwitch.jsx";

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
    case "accepted":
      return "Étape 1 : En route vers Enlèvement";
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
  const [pendingAction, setPendingAction] = useState(null); // "DELIVER" | "PROOF"

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const fileRef = useRef(null);
  const missionRef = useRef(null);

  useEffect(() => {
    fetchMission();
  }, [id]);

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
          console.log("Mission update:", payload);

          if (payload.eventType === 'DELETE') {
            setModalMessage("Cette course a été retirée par l'administrateur.");
            setShowModal(true);
          }
          else if (payload.eventType === 'UPDATE') {
            const newMission = payload.new;

            // Check for status cancelled
            if (newMission.status === 'cancelled') {
              setModalMessage("La course a été annulée par l'administrateur.");
              setShowModal(true);
              return;
            }

            // Check for reassignment (driver change)
            const prev = missionRef.current;
            if (prev && newMission.driver_id && newMission.driver_id !== prev.driver_id) {
              setModalMessage("Cette course a été réassignée à un autre chauffeur.");
              setShowModal(true);
              return;
            }

            // If just normal update, refresh data
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

    if (!error) {
      await fetchMission();
    }
    setSaving(false);
  };

  const savePhoto = (dataUrl, name) => {
    // TODO: Implement actual photo upload to Supabase Storage
    console.log("Saving photo (simulated):", name);
    // For now we just log it. We don't have a photos column in orders table structure seen earlier.
  };

  const completeDelivery = async () => {
    const now = new Date().toISOString();
    await updateOrder({
      status: "delivered",
      updated_at: now
    });
    navigate("/missions");
  };

  const handleAccept = async () => {
    const now = new Date().toISOString();
    await updateOrder({
      status: "accepted",
      updated_at: now
    });
  };

  const handlePickup = async () => {
    const now = new Date().toISOString();
    await updateOrder({
      status: "picked_up",
      updated_at: now,
      picked_up_at: now
    });
  };

  // Extraction des instructions depuis les notes (format: "Enlèvement: ... | Livraison: ..." ou "Instructions: ... / ...")
  const { pickupInstructions, deliveryInstructions } = useMemo(() => {
    if (!mission?.notes) return { pickupInstructions: null, deliveryInstructions: null };

    let p = null;
    let d = null;

    const notes = mission.notes;

    // Format 1: "Enlèvement: ... | Livraison: ..." (OU sans le pipe)
    if (notes.toLowerCase().includes('enlèvement:') || notes.toLowerCase().includes('livraison:')) {
      const parts = notes.includes('|') ? notes.split('|') : [notes];
      parts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed.toLowerCase().includes('enlèvement:')) {
          // Extraction plus robuste : on prend tout jusqu'à "Livraison:" ou la fin (si pas de pipe)
          const pMatch = trimmed.match(/enlèvement:\s*(.*?)(?=livraison:|$)/i);
          if (pMatch) p = pMatch[1].trim();
        }
        if (trimmed.toLowerCase().includes('livraison:')) {
          const dMatch = trimmed.match(/livraison:\s*(.*)/i);
          if (dMatch) d = dMatch[1].trim();
        }
      });
    }
    // Format 2: "Instructions: ... / ..." (Format Guest/Client)
    else if (notes.toLowerCase().includes('instructions:')) {
      // On prend tout jusqu'au prochain champ identifié (Email Client, Phone, Billing) ou la fin
      const match = notes.match(/Instructions:\s*(.*?)(?=Email Client:|Phone:|Billing:|Email:|$)/i)
        || notes.match(/Instructions:\s*(.*)/i); // Fallback plus gourmand

      if (match) {
        const full = match[1].trim();
        // On nettoie un éventuel point final traînant avant le champ suivant
        const cleanFull = full.replace(/\.$/, "");

        if (cleanFull.includes('/')) {
          const split = cleanFull.split('/');
          p = split[0]?.trim();
          d = split[1]?.trim();
        } else {
          p = cleanFull;
        }
      }
    }

    // Filtre phone/dimensions/etc.
    const filter = (text) => {
      const t = text?.trim();
      if (!t || t === "." || t === "—" || t.endsWith(":")) return null;
      const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
      const genericPhoneRegex = /\b\d{6,}\b/g;
      if (phoneRegex.test(t) || genericPhoneRegex.test(t)) return null;
      if (t.startsWith("Dimensions") || t.startsWith("Dims")) return null;
      return t;
    };

    return { pickupInstructions: filter(p), deliveryInstructions: filter(d) };
  }, [mission?.notes]);

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

  // Derived Values for UI
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
            <div className="text-sm font-semibold text-slate-900">Valider la photo</div>
            <img src={pendingPhoto.dataUrl} alt="Preuve" className="mt-3 h-64 w-full rounded-2xl object-cover" />
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
                onClick={() => {
                  const action = pendingAction;
                  const photo = pendingPhoto;
                  setPendingPhoto(null);
                  setPendingAction(null);
                  if (photo) savePhoto(photo.dataUrl, photo.name);
                  if (action === "DELIVER") {
                    completeDelivery();
                  }
                }}
              >
                Valider la photo
              </button>
              <button
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
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

      <header className="relative sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/missions" className="text-[#1d283a]">←</Link>
          <h1 className="text-lg font-bold tracking-tight uppercase">Mission</h1>
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

        <section className="px-4 mb-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Historique</h2>
            </div>
            <div className="space-y-1">
              <div className="flex items-start gap-3">
                <span className="text-gray-400">⭡</span>
                <div className="flex-1">
                  <p className="text-xs text-gray-500">Enlèvement</p>
                  <p className="text-sm font-medium">{formatDateTime(mission.picked_up_at)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-gray-400">⭣</span>
                <div className="flex-1 border-t border-gray-50 pt-3">
                  <p className="text-xs text-gray-500">Livraison</p>
                  <p className="text-sm font-medium text-gray-300">
                    {mission.status === 'delivered' ? formatDateTime(mission.updated_at) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 space-y-3">
          <details className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100" open={mission.status === "assigned" || mission.status === "accepted"}>
            <summary className="list-none cursor-pointer">
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

          <details className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100" open={mission.status !== "assigned" && mission.status !== "accepted"}>
            <summary className="list-none cursor-pointer">
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

          <details className="bg-white rounded-xl p-3 shadow-sm border border-gray-100" open>
            <summary className="list-none cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">📦</span>
                <h3 className="font-bold uppercase text-xs tracking-wider">Colis & Service</h3>
              </div>
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Véhicule</p>
                  <p className="text-sm font-semibold capitalize">{mission.vehicle_type || "Standard"}</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Formule</p>
                  <p className="text-sm font-semibold capitalize text-red-500">{mission.service_level || "Standard"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Type de colis</p>
                  <p className="text-sm font-semibold capitalize">{mission.package_type || "Colis"}</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Poids</p>
                  <p className="text-sm font-semibold">{mission.weight ? `${mission.weight} kg` : "—"}</p>
                </div>
              </div>
              {mission.package_description && (
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Nature du contenu</p>
                  <p className="text-sm font-semibold">{mission.package_description}</p>
                </div>
              )}
            </div>
          </details>
        </section>

        <section className="p-4 py-3 space-y-2">
          {mission.status !== "delivered" && (
            <>
              {mission.status === "assigned" && (
                <button
                  type="button"
                  onClick={handleAccept}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-sm"
                >
                  Accepter la mission
                </button>
              )}

              {mission.status === "accepted" && (
                <button
                  type="button"
                  onClick={handlePickup}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm"
                >
                  Confirmer l'Enlèvement
                </button>
              )}

              {mission.status === "picked_up" && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingAction("DELIVER");
                    fileRef.current?.click();
                  }}
                  className="w-full bg-emerald-500 text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20"
                >
                  Valider la Livraison
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setPendingAction("PROOF");
                  fileRef.current?.click();
                }}
                className="w-full bg-[#1d283a] text-white py-3 rounded-xl font-bold text-sm"
              >
                Prendre une Photo (preuve)
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
                  reader.onload = () => {
                    const dataUrl = String(reader.result || "");
                    setPendingPhoto({ dataUrl, name: file.name });
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }}
              />
            </>
          )}

          <Link to="/missions" className="w-full py-1 text-gray-500 font-semibold text-xs flex items-center justify-center gap-1">
            ← Retour à la liste
          </Link>
        </section>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 app-nav">
        <div className="flex items-center justify-around h-16">
          <Link className="flex flex-col items-center justify-center gap-0.5 text-[#1d283a]" to="/missions">
            <span>📋</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Mission</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/map">
            <span>🕓</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Historique</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/chat">
            <span>💬</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Tchat</span>
          </Link>
          <Link className="flex flex-col items-center justify-center gap-0.5 text-gray-400" to="/profile">
            <span>👤</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Profil</span>
          </Link>
        </div>
        <div className="h-5 bg-white" />
      </nav>

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
