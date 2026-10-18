import { useState } from "react";
import { appleAvailable, signInWithApple } from "../lib/appleAuth";

// Bouton « Se connecter / S'inscrire avec Apple » (affiché seulement dans l'app iPhone).
// La suite (routage selon le profil) est gérée par la page, qui écoute la création de session.
export default function AppleButton({ label, onError, disabled }) {
  const [busy, setBusy] = useState(false);
  if (!appleAvailable()) return null;

  const handleClick = async () => {
    setBusy(true);
    onError?.("");
    try {
      await signInWithApple();
    } catch (err) {
      console.error("Apple sign-in error:", err);
      onError?.("Connexion Apple impossible : " + (err?.message || "erreur inattendue"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className="apple-btn mb-3 flex w-full items-center justify-center gap-3 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-70"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </svg>
      {busy ? "Connexion…" : label}
    </button>
  );
}
