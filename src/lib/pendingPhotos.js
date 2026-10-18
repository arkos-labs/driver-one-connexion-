// File d'attente des photos (enlèvement / livraison) : la photo reste sur le téléphone
// tant qu'elle n'est pas envoyée, et repart à la prochaine ouverture de la mission.
const DB_NAME = "oc-driver-outbox";
const STORE = "photos";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        tx.oncomplete = () => {
          db.close();
          resolve(req?.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

// kind : "pickup" ou "delivery" ; dataUrl : la photo ; name : nom de fichier
// extra : infos de livraison à rattacher avec la photo (destinataire, service, commentaire)
export function savePendingPhoto(orderId, kind, dataUrl, name, extra = {}) {
  const id = `${orderId}:${kind}:${Date.now()}`;
  return run("readwrite", (s) => s.put({ id, orderId, kind, dataUrl, name, extra })).then(() => id);
}

export function listPendingPhotos(orderId) {
  return run("readonly", (s) => s.getAll()).then((all) =>
    (all || []).filter((p) => p.orderId === orderId)
  );
}

export function clearPendingPhoto(id) {
  return run("readwrite", (s) => s.delete(id));
}
