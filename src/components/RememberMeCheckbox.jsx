import { useState } from "react";
import { getRemember, setRemember } from "../lib/rememberMe";

// Case « Rester connecté » (cochée par défaut). Le choix est appliqué dès qu'on la modifie.
export default function RememberMeCheckbox() {
  const [checked, setChecked] = useState(() => getRemember());

  const toggle = (e) => {
    setChecked(e.target.checked);
    setRemember(e.target.checked);
  };

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl py-1 text-sm text-muted">
      <input type="checkbox" checked={checked} onChange={toggle} className="peer sr-only" />
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-line bg-paper transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        )}
      </span>
      <span className="font-semibold text-ink">Rester connecté</span>
    </label>
  );
}
