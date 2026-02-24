// ─────────────────────────────────────────────────────────────────
// lib/telegram.js  –  Notifications Telegram pour One Connexion
// ─────────────────────────────────────────────────────────────────

const send = async (text) => {
    const botToken = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.VITE_TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn("⚠️ Telegram non configuré (VITE_TELEGRAM_BOT_TOKEN ou VITE_TELEGRAM_CHAT_ID manquant).");
        return;
    }

    try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        });
        if (!res.ok) console.error("Telegram error:", await res.text());
    } catch (e) {
        console.error("Telegram fetch error:", e);
    }
};

// ─── Helpers ──────────────────────────────────────────────────────
const fmt = (label, value) => value ? `<b>${label} :</b> ${value}\n` : "";
const hr = () => "─────────────────────\n";

const orderBlock = (o) =>
    hr() +
    fmt("📍 Enlèvement", o.pickup_address || o.pickup) +
    fmt("🏁 Livraison", o.delivery_address || o.delivery) +
    (o.pickup_city && o.delivery_city ? fmt("🗺️  Trajet", `${o.pickup_city} → ${o.delivery_city}`) : "") +
    fmt("🚗 Véhicule", o.vehicle_type ? o.vehicle_type.charAt(0).toUpperCase() + o.vehicle_type.slice(1) : null) +
    fmt("⚡ Formule", o.service_level ? o.service_level.toUpperCase() : null) +
    fmt("💰 Prix HT", o.price_ht ? `${Number(o.price_ht).toFixed(2)} €` : null) +
    fmt("🕐 Enlèvement", o.scheduled_at ? new Date(o.scheduled_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null) +
    fmt("⏰ Deadline", o.delivery_deadline ? new Date(o.delivery_deadline).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null) +
    hr();

// ─────────────────────────────────────────────────────────────────
// ÉTAPE 1 — Nouvelle commande (client ou admin)
// ─────────────────────────────────────────────────────────────────
export const notifyNewOrder = (order, clientName = "Client") => send(
    `📦 <b>NOUVELLE COMMANDE</b>\n\n` +
    fmt("👤 Client", clientName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    orderBlock(order) +
    `➡️ En attente d'acceptation admin`
);

// ─────────────────────────────────────────────────────────────────
// ÉTAPE 2 — Commande acceptée par l'admin
// ─────────────────────────────────────────────────────────────────
export const notifyOrderAccepted = (order, clientName = "Client") => send(
    `✅ <b>COMMANDE ACCEPTÉE</b>\n\n` +
    fmt("👤 Client", clientName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    orderBlock(order) +
    `➡️ En attente d'assignation chauffeur`
);

// ─────────────────────────────────────────────────────────────────
// ÉTAPE 3 — Mission assignée à un chauffeur
// ─────────────────────────────────────────────────────────────────
export const notifyOrderAssigned = (order, driverName = "Chauffeur") => send(
    `🚴 <b>MISSION ASSIGNÉE</b>\n\n` +
    fmt("👷 Chauffeur", driverName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    orderBlock(order) +
    `➡️ Mission transmise au chauffeur`
);

// ─────────────────────────────────────────────────────────────────
// ÉTAPE 4 — Chauffeur accepte la mission
// ─────────────────────────────────────────────────────────────────
export const notifyDriverAccepted = (order, driverName = "Chauffeur") => send(
    `👍 <b>CHAUFFEUR EN ROUTE</b>\n\n` +
    fmt("👷 Chauffeur", driverName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    fmt("📍 Vers", order.pickup_address) +
    fmt("📞 Contact enlèvement", order.pickup_phone) +
    hr() +
    `➡️ Le chauffeur se dirige vers le point d'enlèvement`
);

// ─────────────────────────────────────────────────────────────────
// ÉTAPE 5 — Colis enlevé (picked_up)
// ─────────────────────────────────────────────────────────────────
export const notifyPickupDone = (order, driverName = "Chauffeur") => send(
    `🔵 <b>COLIS ENLEVÉ — EN LIVRAISON</b>\n\n` +
    fmt("👷 Chauffeur", driverName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    fmt("📍 Enlèvement", order.pickup_address) +
    fmt("🏁 Destination", order.delivery_address) +
    fmt("⏰ Deadline", order.delivery_deadline ? new Date(order.delivery_deadline).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null) +
    hr() +
    `➡️ Le colis est en cours de livraison`
);

// ─────────────────────────────────────────────────────────────────
// ÉTAPE 6 — Livraison terminée
// ─────────────────────────────────────────────────────────────────
export const notifyDelivered = (order, driverName = "Chauffeur") => send(
    `✅ <b>LIVRAISON TERMINÉE !</b>\n\n` +
    fmt("👷 Chauffeur", driverName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    fmt("📍 Livré à", order.delivery_address) +
    fmt("💰 Montant HT", order.price_ht ? `${Number(order.price_ht).toFixed(2)} €` : null) +
    hr() +
    `🎉 Mission accomplie avec succès`
);

// ─────────────────────────────────────────────────────────────────
// Chauffeur refuse ou enlève la mission
// ─────────────────────────────────────────────────────────────────
export const notifyDriverDeclined = (order, driverName = "Chauffeur") => send(
    `✋ <b>MISSION REFUSÉE / ENLEVÉE</b>\n\n` +
    fmt("👷 Chauffeur", driverName) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    orderBlock(order) +
    `⚠️ Le chauffeur a retiré ou refusé la mission. Elle est de nouveau disponible.`
);

// ─────────────────────────────────────────────────────────────────
// Annulation
// ─────────────────────────────────────────────────────────────────
export const notifyOrderCancelled = (order, byWhom = "Admin") => send(
    `❌ <b>COMMANDE ANNULÉE</b>\n\n` +
    fmt("👤 Annulée par", byWhom) +
    fmt("🆔 Référence", order.id?.slice(0, 8).toUpperCase()) +
    fmt("📍 Trajet", order.pickup_address && order.delivery_address ? `${order.pickup_address} → ${order.delivery_address}` : null) +
    fmt("💰 Montant HT", order.price_ht ? `${Number(order.price_ht).toFixed(2)} €` : null) +
    hr()
);

export const sendTelegramMessage = send;
