import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { listenForAppLinks } from "../lib/deepLinks";

// Écoute les liens qui rouvrent l'app (ex. e-mail « mot de passe oublié »). N'affiche rien.
export default function DeepLinkHandler() {
  const navigate = useNavigate();
  // `navigate` change à chaque changement d'écran : on le garde dans une référence pour n'écouter qu'une fois
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    listenForAppLinks((...args) => navigateRef.current(...args)).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);
  // Ouverture d'un écran demandée par une notification touchée
  useEffect(() => {
    const open = (e) => navigateRef.current(e.detail?.path || "/missions");
    window.addEventListener("oc-open-path", open);
    return () => window.removeEventListener("oc-open-path", open);
  }, []);

  return null;
}
