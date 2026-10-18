import ThemedLogo from "./ThemedLogo.jsx";

// Écran plein écran pendant un envoi (logo qui tourne) puis confirmation animée (coche).
export default function ActionOverlay({ mode, label, title, subtitle }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-paper/90 px-8 text-center backdrop-blur-md" role="status" aria-live="polite">
      {mode === "success" ? (
        <>
          <div className="oc-pop flex h-28 w-28 items-center justify-center rounded-full bg-accent shadow-lg shadow-accent/30">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline className="oc-draw" points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="oc-rise mt-7 text-2xl font-bold tracking-tight text-ink">{title || "Livraison validée"}</h2>
          {subtitle && <p className="oc-rise mt-2 max-w-[18rem] text-sm text-muted" style={{ animationDelay: "120ms" }}>{subtitle}</p>}
        </>
      ) : (
        <>
          <ThemedLogo alt="" className="oc-logo-spin h-32 w-32" />
          <p className="mt-8 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-label">{label || "Envoi en cours…"}</p>
          <p className="mt-3 max-w-[16rem] text-sm text-muted">Ne fermez pas l'application pendant l'envoi.</p>
        </>
      )}
    </div>
  );
}
