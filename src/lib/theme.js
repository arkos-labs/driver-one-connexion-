// Thème de l'app : « auto » passe en sombre entre le coucher et le lever du soleil (Paris),
// ou le chauffeur force « clair » / « sombre ». Le choix est gardé sur l'appareil.

const KEY = "theme_mode";
export const THEME_MODES = [
  { id: "auto", label: "Automatique" },
  { id: "light", label: "Clair" },
  { id: "dark", label: "Sombre" },
];

// Paris : la société travaille en Île-de-France, pas besoin de demander la position.
const LAT = 48.8566;
const LON = 2.3522;

export function getThemeMode() {
  try {
    const v = localStorage.getItem(KEY);
    return THEME_MODES.some((m) => m.id === v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setThemeMode(mode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // préférence non conservée si le stockage est indisponible
  }
  applyTheme();
}

// Heures de lever et de coucher du soleil (en millisecondes UTC) pour le jour de `date`.
export function sunTimes(date = new Date()) {
  const rad = Math.PI / 180;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const dayOfYear = Math.floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / 86400000);
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);

  const eqTime =
    229.18 *
    (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const cosHa = Math.cos(90.833 * rad) / (Math.cos(LAT * rad) * Math.cos(decl)) - Math.tan(LAT * rad) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosHa))) / rad;

  const base = Date.UTC(y, m, d);
  return {
    sunrise: base + (720 - 4 * (LON + ha) - eqTime) * 60000,
    sunset: base + (720 - 4 * (LON - ha) - eqTime) * 60000,
  };
}

export function isNight(date = new Date()) {
  const { sunrise, sunset } = sunTimes(date);
  const t = date.getTime();
  return t < sunrise || t >= sunset;
}

export function isDarkNow() {
  const mode = getThemeMode();
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return isNight();
}

export function applyTheme() {
  const dark = isDarkNow();
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0C0D0E" : "#F4F2EE");
  return dark;
}

// À appeler une fois au démarrage : applique le thème puis le réévalue régulièrement.
export function initTheme() {
  applyTheme();
  setInterval(applyTheme, 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") applyTheme();
  });
}

export function formatClock(ms) {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}
