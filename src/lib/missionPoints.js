// Le dernier arrêt est l'arrivée quand sa livraison est la destination finale de la course :
// on n'affiche alors pas un second point « Arrivée » à la même adresse.
const norm = (v) => String(v || "").trim().toLowerCase();

export function lastStopIsArrival(mission) {
  const stops = Array.isArray(mission?.stops) ? mission.stops : [];
  if (stops.length === 0) return false;
  const last = stops[stops.length - 1];
  const lastDelivery = typeof last === "string" ? null : (last.deliveryAddress || last.delivery_address || null);
  return !!lastDelivery && norm(lastDelivery) === norm(mission.dropoff_address);
}

// Nombre total de points de la course (départ + étapes + arrivée, sans doublon)
export function countPoints(mission) {
  const stops = Array.isArray(mission?.stops) ? mission.stops : [];
  return stops.length + (lastStopIsArrival(mission) ? 1 : 2);
}

// Libellé du délai, comme sur le site : flash = Super, urgent = Urgent, standard = Standard
export function delaiLabel(v) {
  const k = String(v || "").trim().toLowerCase();
  if (k === "flash") return "Super";
  if (k === "urgent") return "Urgent";
  if (k === "standard") return "Standard";
  return v ? String(v) : "";
}

// Libellé du format du colis, comme sur le site
export function formatLabel(v) {
  const k = String(v || "").trim().toLowerCase();
  if (k === "doc") return "Doc admin";
  if (k === "pli") return "Pli";
  if (k === "colis") return "Colis";
  if (k === "petit") return "Petit colis";
  if (k === "volumineux") return "Volumineux";
  return v ? String(v) : "";
}
