// Chiffre affiché sur l'icône de l'app (écran d'accueil de l'iPhone) : un seul nombre est possible.
import { Badge } from "@capawesome/capacitor-badge";
import { Capacitor } from "@capacitor/core";

export async function setAppBadge(count) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { display } = await Badge.checkPermissions();
    if (display !== "granted") return;
    await Badge.set({ count: Math.max(0, Number(count) || 0) });
  } catch {
    // pastille indisponible : sans conséquence
  }
}
