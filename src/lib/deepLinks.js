// Liens ouverts depuis un e-mail (driverone://reset-password#...) : on récupère la session de réinitialisation
// et on affiche l'écran « Nouveau mot de passe » dans l'app.
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

export const APP_LINK_SCHEME = "driverone://";

// Adresse que Supabase doit rouvrir (à autoriser dans Authentication > URL Configuration)
export const RESET_REDIRECT_URL = `${APP_LINK_SCHEME}reset-password`;

async function processLink(url, navigate) {
  if (!url || !url.startsWith(APP_LINK_SCHEME)) return;
  const parsed = new URL(url);
  if (parsed.host !== "reset-password") return;

  // Les informations arrivent après le # (ou après le ? selon le mode)
  const params = new URLSearchParams(parsed.hash.replace(/^#/, "") || parsed.search.replace(/^\?/, ""));

  // On affiche tout de suite l'écran, qui attend la session
  navigate("/reset-password", { replace: true });

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const code = params.get("code");
  if (params.get("error") || params.get("error_code")) {
    window.dispatchEvent(new CustomEvent("oc-recovery", { detail: { error: params.get("error_description") || "expired" } }));
    return;
  }
  try {
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) throw error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else {
      throw new Error("lien incomplet");
    }
    window.dispatchEvent(new CustomEvent("oc-recovery", { detail: { ok: true } }));
  } catch (e) {
    window.dispatchEvent(new CustomEvent("oc-recovery", { detail: { error: String(e?.message || e) } }));
  }
}

// À appeler une fois (dans le routeur) : traite le lien qui a ouvert l'app, puis ceux qui arrivent ensuite.
let launchHandled = false; // le lien qui a lancé l'app ne doit être traité qu'une seule fois
let lastUrl = "";
let lastAt = 0;

export async function listenForAppLinks(navigate) {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle = null;
  const once = (url) => {
    // même lien reçu deux fois de suite en quelques secondes : on l'ignore
    const now = Date.now();
    if (url === lastUrl && now - lastAt < 5000) return Promise.resolve();
    lastUrl = url;
    lastAt = now;
    return processLink(url, navigate);
  };
  try {
    if (!launchHandled) {
      launchHandled = true;
      const launch = await CapApp.getLaunchUrl();
      if (launch?.url) await once(launch.url);
    }
    handle = await CapApp.addListener("appUrlOpen", ({ url }) => once(url));
  } catch (e) {
    console.warn("Liens de l'app indisponibles :", e);
  }
  return () => handle?.remove();
}
