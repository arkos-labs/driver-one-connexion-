// Envoie une notification push Apple (APNs) au chauffeur auquel une course vient d'être assignée.
// Appelée uniquement par le déclencheur SQL (secret partagé). verify_jwt = false.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const KEY_P8 = Deno.env.get("APNS_KEY_P8")!;
const KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID")!;

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Jeton d'authentification Apple (valable 1 h), signé avec la clé .p8
async function apnsJwt(): Promise<string> {
  const pem = KEY_P8.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}

// "59 Rue de Rivoli, 75001 Paris" -> "75001 Paris" (aucune adresse précise sur l'écran verrouillé)
const place = (addr?: string | null) => {
  const m = String(addr ?? "").match(/\b(\d{5})\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*)/);
  return m ? `${m[1]} ${m[2].trim()}` : "";
};

// Chiffre affiché sur l'icône de l'app : messages non lus + courses en cours du chauffeur
async function badgeFor(userId: string): Promise<number> {
  const [msgs, orders] = await Promise.all([
    supabase.from("messages").select("id", { count: "exact", head: true })
      .eq("recipient_id", userId).eq("is_admin_message", true).is("read_at", null),
    supabase.from("orders").select("id", { count: "exact", head: true })
      .eq("driver_id", userId).not("status", "in", '("delivered","cancelled","livree","annulee")'),
  ]);
  return (msgs.count ?? 0) + (orders.count ?? 0);
}

async function sendToToken(token: string, jwt: string, payload: unknown, orderId: string) {
  // Production d'abord (App Store / TestFlight), puis sandbox (builds Xcode)
  for (const host of ["api.push.apple.com", "api.sandbox.push.apple.com"]) {
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-collapse-id": orderId,
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 300),
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, host };
    const reason = (await res.json().catch(() => ({})))?.reason ?? String(res.status);
    if (reason === "BadDeviceToken" && host === "api.push.apple.com") continue; // essayer le sandbox
    return { ok: false, reason, host };
  }
  return { ok: false, reason: "BadDeviceToken", host: "both" };
}

Deno.serve(async (req) => {
  // Seul le déclencheur SQL connaît le secret
  const { data: secret } = await supabase.rpc("push_get_secret");
  if (!secret || req.headers.get("x-push-secret") !== secret) return new Response("forbidden", { status: 403 });

  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return new Response("missing order_id", { status: 400 });

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, driver_id, pickup_address, dropoff_address, delivery_address")
    .eq("id", order_id)
    .single();
  if (!order?.driver_id || !["assigned", "confirmee"].includes(order.status)) return new Response("skipped");

  const { data: tokens } = await supabase.from("device_tokens").select("token").eq("user_id", order.driver_id);
  if (!tokens?.length) return new Response("no device");

  const badge = await badgeFor(order.driver_id);
  const from = place(order.pickup_address);
  const to = place(order.dropoff_address ?? order.delivery_address);
  const payload = {
    aps: {
      alert: { title: "Nouvelle course", body: from && to ? `${from} → ${to}` : "Une course vous a été assignée" },
      sound: "default",
      badge,
      "mutable-content": 1, // permet d'ajouter le logo à la notification
    },
    order_id: order.id,
  };

  const jwt = await apnsJwt();
  const results = [];
  for (const { token } of tokens) {
    const r = await sendToToken(token, jwt, payload, order.id);
    results.push(r);
    // téléphone désinscrit ou jeton invalide : on le retire
    if (!r.ok && ["Unregistered", "BadDeviceToken", "DeviceTokenNotForTopic"].includes(r.reason ?? "")) {
      await supabase.from("device_tokens").delete().eq("token", token);
    }
  }
  return new Response(JSON.stringify(results), { headers: { "content-type": "application/json" } });
});
