import { supabase } from "./supabase";
import { requestNotificationPermission } from "./notifications";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function ensurePushSubscription(userId) {
  if (!userId) return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (!VAPID_PUBLIC_KEY) {
    console.warn("VITE_VAPID_PUBLIC_KEY manquant");
    return null;
  }

  const permissionOk = await requestNotificationPermission();
  if (!permissionOk) return null;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Récupère ou crée la subscription
    let subscription = await registration.pushManager.getSubscription();

    // Si subscription expirée ou invalide → en recrée une
    if (subscription) {
      try {
        // Test rapide : si l'endpoint est toujours valide
        const json = subscription.toJSON();
        if (!json.endpoint) throw new Error("endpoint vide");
      } catch {
        await subscription.unsubscribe();
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = subscription.toJSON();
    const { endpoint, keys } = json;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      console.error("Subscription incomplète", json);
      return null;
    }

    // Sauvegarde en DB (upsert sur endpoint)
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) console.error("Erreur upsert push_subscription:", error);

    return subscription;
  } catch (err) {
    console.error("ensurePushSubscription error:", err);
    return null;
  }
}

export async function removePushSubscription() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  } catch (err) {
    console.error("removePushSubscription error:", err);
  }
}
