// Préférence GPS du chauffeur (stockée sur l'appareil) et ouverture de l'application choisie.

export const GPS_APPS = [
  { id: "waze", label: "Waze" },
  { id: "google", label: "Google Maps" },
  { id: "apple", label: "Plans (Apple)" },
];

const KEY = "gps_app";

export function getGpsApp() {
  try {
    const v = localStorage.getItem(KEY);
    return GPS_APPS.some((a) => a.id === v) ? v : null;
  } catch {
    return null;
  }
}

export function setGpsApp(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // stockage indisponible : la préférence ne sera pas conservée
  }
}

export function gpsLabel(id) {
  return GPS_APPS.find((a) => a.id === id)?.label || "GPS";
}

function urls(app, address) {
  const q = encodeURIComponent(address);
  switch (app) {
    case "waze":
      return {
        app: `waze://?q=${q}&navigate=yes`,
        web: `https://waze.com/ul?q=${q}&navigate=yes`,
      };
    case "google":
      return {
        app: `comgooglemaps://?daddr=${q}&directionsmode=driving`,
        web: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
      };
    default:
      return {
        app: `maps://?daddr=${q}&dirflg=d`,
        web: `https://maps.apple.com/?daddr=${q}&dirflg=d`,
      };
  }
}

// Ouvre directement l'application GPS (celle choisie, ou celle passée en paramètre).
// Si l'appli ne s'ouvre pas, on bascule sur le lien web.
export function openGps(address, app = getGpsApp() || "apple") {
  if (!address) return;
  const { app: appUrl, web } = urls(app, address);

  let left = false;
  const onHide = () => {
    if (document.visibilityState === "hidden") left = true;
  };
  document.addEventListener("visibilitychange", onHide);

  window.location.href = appUrl;

  setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!left && document.visibilityState === "visible") {
      window.location.href = web;
    }
  }, 900);
}
