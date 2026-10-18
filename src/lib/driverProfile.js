// Informations obligatoires d'un chauffeur : prénom, nom, téléphone, modèle et immatriculation du véhicule.
import { supabase } from "./supabase";

// Même règle que la base de données (profiles.phone_format)
const PHONE_RE = /^\+?[0-9\s\-()]{9,}$/;
// Immatriculation : lettres, chiffres, tirets et espaces (AA-123-BB, AA 123 BB, 1234 AB 56…)
const PLATE_RE = /^[A-Z0-9][A-Z0-9 -]{3,11}[A-Z0-9]$/;

// IBAN : sans espaces, en majuscules ; BIC : en majuscules
export function normalizeIban(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}
export function formatIban(value) {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}
export function normalizeBic(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, "");
}
// Contrôle de validité d'un IBAN (format + clé de contrôle modulo 97)
export function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of digits) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}
export function isValidBic(value) {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normalizeBic(value));
}
// FR76 •••• •••• •••• •••• •••• 123 : n'affiche que le début et la fin
export function maskIban(value) {
  const iban = normalizeIban(value);
  if (iban.length < 8) return iban;
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

export function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function splitName(full) {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function joinName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

export function splitVehicle(vehicle) {
  const [model = "", plate = ""] = String(vehicle || "").split(" — ");
  return { model: model.trim(), plate: plate.trim() };
}

export function joinVehicle(model, plate) {
  return `${String(model || "").trim()} — ${normalizePlate(plate)}`;
}

// Retourne un message d'erreur, ou null si tout est correct
export function validateDriverInfo({ firstName, lastName, phone, model, plate, iban, bic }) {
  if (!String(firstName || "").trim()) return "Le prénom est obligatoire.";
  if (!String(lastName || "").trim()) return "Le nom est obligatoire.";
  if (!PHONE_RE.test(String(phone || "").trim())) return "Le numéro de téléphone est invalide (9 chiffres minimum).";
  if (!String(model || "").trim()) return "Le modèle du véhicule est obligatoire.";
  if (!PLATE_RE.test(normalizePlate(plate))) return "L'immatriculation est invalide (ex : AA-123-BB).";
  if (!isValidIban(iban)) return "L'IBAN est invalide : vérifiez les caractères (ex : FR76 3000 6000 0112 3456 7890 189).";
  if (!isValidBic(bic)) return "Le BIC est invalide (8 ou 11 caractères, ex : BNPAFRPP).";
  return null;
}

// Un chauffeur est « complet » quand sa fiche contient tout ce qu'il faut
export function isDriverComplete(driver) {
  if (!driver) return false;
  const { firstName, lastName } = splitName(driver.name);
  const { model, plate } = splitVehicle(driver.vehicle);
  return !validateDriverInfo({ firstName, lastName, phone: driver.phone, model, plate, iban: driver.iban, bic: driver.bic });
}

// Enregistre le profil et la fiche chauffeur
export async function saveDriverInfo(userId, { firstName, lastName, phone, model, plate, iban, bic }) {
  const name = joinName(firstName, lastName);
  const vehicle = joinVehicle(model, plate);
  const cleanPhone = String(phone).trim();
  const bank = { iban: normalizeIban(iban), bic: normalizeBic(bic) };

  const { data: updatedProfile, error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: name, phone: cleanPhone })
    .eq("id", userId)
    .select("id");
  if (profileError) throw profileError;
  if (!updatedProfile?.length) {
    const { error } = await supabase.from("profiles").insert({ id: userId, role: "driver", full_name: name, phone: cleanPhone });
    if (error) throw error;
  }

  const { data: updatedDriver, error: driverError } = await supabase
    .from("drivers")
    .update({ name, phone: cleanPhone, vehicle, ...bank })
    .eq("auth_id", userId)
    .select("id");
  if (driverError) throw driverError;
  if (!updatedDriver?.length) {
    // hors_service tant qu'un administrateur n'a pas validé le compte
    const { error } = await supabase.from("drivers").insert({ auth_id: userId, name, phone: cleanPhone, vehicle, ...bank, status: "hors_service" });
    if (error) throw error;
  }
}

// Mémorise le résultat pour ne pas interroger la base à chaque changement d'onglet
let completeUserId = null;
export function markDriverComplete(userId) {
  completeUserId = userId;
}
export function isMarkedComplete(userId) {
  return completeUserId === userId;
}
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") completeUserId = null;
});
