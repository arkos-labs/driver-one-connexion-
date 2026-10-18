// File d'attente de la validation de livraison : si l'app se ferme pendant l'envoi
// (batterie vide, appli fermée), la validation est renvoyée à la prochaine ouverture.
const key = (orderId) => `oc-pending-delivery-${orderId}`;

export function savePendingDelivery(orderId, patch) {
  try {
    localStorage.setItem(key(orderId), JSON.stringify({ patch, savedAt: Date.now() }));
  } catch (e) {
    console.error("pendingDelivery save:", e);
  }
}

export function loadPendingDelivery(orderId) {
  try {
    const raw = localStorage.getItem(key(orderId));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearPendingDelivery(orderId) {
  try {
    localStorage.removeItem(key(orderId));
  } catch (e) {
    // rien à faire : la clé sera ignorée car la commande est déjà livrée
  }
}
