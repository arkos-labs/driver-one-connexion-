// « Rester connecté » : coché (par défaut), la session est gardée sur l'iPhone et survit à la fermeture de l'app.
// Décoché, elle n'est gardée que tant que l'app est ouverte : il faut se reconnecter au prochain lancement.
const KEY = "oc_remember_me";

export function getRemember() {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

export function setRemember(value) {
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    // préférence non conservée si le stockage est indisponible
  }
}

// Stockage de la session choisi par le client Supabase selon la préférence
export const sessionStorageAdapter = {
  getItem(key) {
    try {
      return (getRemember() ? localStorage : sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const keep = getRemember();
      (keep ? localStorage : sessionStorage).setItem(key, value);
      (keep ? sessionStorage : localStorage).removeItem(key); // jamais la session dans les deux
    } catch {
      // stockage indisponible
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // stockage indisponible
    }
  },
};
