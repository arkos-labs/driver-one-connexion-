import { useEffect, useState } from "react";

// Bandeau affiché quand le téléphone n'a plus de réseau : les envois sont gardés et repartiront.
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[95] bg-accent px-4 pb-2 text-center text-xs font-bold text-white" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}>
      Pas de connexion. Vos envois sont gardés et partiront dès que le réseau revient.
    </div>
  );
}
