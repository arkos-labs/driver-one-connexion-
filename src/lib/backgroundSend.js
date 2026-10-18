// Garde l'app active quelques secondes après qu'on la quitte, le temps que les envois en cours arrivent au serveur.
// iOS accorde 30 secondes maximum : au-delà, la file d'attente (pendingDelivery / pendingPhotos) reprend l'envoi.
import { Capacitor } from "@capacitor/core";
import { BackgroundTask } from "@capawesome/capacitor-background-task";

let inFlight = 0;
let taskId = null;

// À encadrer autour de chaque envoi réseau
export function withBackgroundSend(fn) {
  return async (...args) => {
    inFlight++;
    try {
      return await fn(...args);
    } finally {
      inFlight--;
    }
  };
}

// À appeler une fois au démarrage de l'app (sur iPhone uniquement)
export function setupBackgroundSend() {
  if (!Capacitor.isNativePlatform()) return;
  BackgroundTask.beforeExit(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const done = inFlight === 0 || Date.now() - startedAt > 25000;
      if (done) {
        clearInterval(timer);
        if (taskId) BackgroundTask.finish({ taskId });
      }
    }, 300);
  }).then((id) => {
    taskId = id;
  });
}
