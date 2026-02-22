const KEY = "oc_driver_missions";

export function loadMissions() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveMissions(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function updateMission(list, id, patch) {
  const now = new Date().toISOString();
  const next = list.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now } : m));
  saveMissions(next);
  return next;
}
