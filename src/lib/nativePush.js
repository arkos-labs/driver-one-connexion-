// Notifications push natives (Apple APNs) : enregistre le téléphone du chauffeur pour qu'il soit
// prévenu d'une nouvelle course même quand l'app est fermée.
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "./supabase";

let listening = false;
let currentUserId = null;
let lastToken = null;

async function saveToken(token) {
  lastToken = token;
  if (!currentUserId) return;
  const { error } = await supabase.rpc("register_device_token", { p_token: token });
  if (error) console.warn("Enregistrement du jeton push impossible :", error.message);
}

export async function registerNativePush(userId) {
  if (!Capacitor.isNativePlatform()) return;
  currentUserId = userId;

  try {
    if (!listening) {
      listening = true;
      await PushNotifications.addListener("registration", (t) => saveToken(t.value));
      await PushNotifications.addListener("registrationError", (e) => console.warn("Push : enregistrement refusé", e));
      // Toucher une notification ouvre l'écran concerné (Chat pour un message, Missions pour une course)
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const type = action?.notification?.data?.type;
        window.dispatchEvent(new CustomEvent("oc-open-path", { detail: { path: type === "message" ? "/chat" : "/missions" } }));
      });
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.register();
  } catch (e) {
    console.warn("Push natif indisponible :", e);
  }
}

// À la déconnexion : le téléphone ne doit plus recevoir les courses de ce chauffeur.
export async function unregisterNativePush() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (lastToken) await supabase.from("device_tokens").delete().eq("token", lastToken);
    await PushNotifications.removeAllListeners();
  } catch {
    // rien à nettoyer
  }
  listening = false;
  currentUserId = null;
}
