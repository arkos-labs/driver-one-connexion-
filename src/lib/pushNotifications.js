// src/lib/pushNotifications.js
import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = "BLXgC6uU_284r6_r_N7B_X_mO5m-G_E-X-v_L_oimEgr99ARFJUi6EsQ";

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

export async function registerPushNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.warn("Push notifications not supported");
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                console.warn("Notification permission denied");
                return;
            }

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Save subscription to Supabase
        const { endpoint, keys } = subscription.toJSON();
        const { error } = await supabase.from("push_subscriptions").upsert(
            {
                user_id: user.id,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "endpoint" }
        );

        if (error) console.error("Error saving push subscription:", error);
        else console.log("Push subscription registered successfully");

    } catch (error) {
        console.error("Error registering push notifications:", error);
    }
}
