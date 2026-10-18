// Ne garde que « code postal + ville » d'une adresse (pour les courses terminées).
// Exemple : « 59 Rue de Rivoli, 75001 Paris » -> « 75001 Paris ».
export function cityOnly(address, fallbackCity = "", fallbackPostal = "") {
  const text = String(address || "");
  const m = text.match(/\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*)/);
  if (m) return `${m[1]} ${m[2].trim().replace(/[\s,-]+$/, "")}`;
  const fromFields = [fallbackPostal, fallbackCity].filter(Boolean).join(" ").trim();
  return fromFields || "—";
}
