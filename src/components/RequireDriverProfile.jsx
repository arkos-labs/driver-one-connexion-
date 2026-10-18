import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isDriverComplete, isMarkedComplete, markDriverComplete } from "../lib/driverProfile";

// Bloque l'accès aux autres sections tant que la fiche chauffeur n'est pas complète.
export default function RequireDriverProfile({ children }) {
  const [state, setState] = useState("loading"); // loading | ok | incomplete

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return alive && setState("ok"); // RequireAuth gère l'absence de session
        if (isMarkedComplete(user.id)) return alive && setState("ok");

        const { data: profile, error: pErr } = await supabase.from("profiles").select("role").eq("id", user.id).single();
        if (pErr) return alive && setState("ok"); // erreur réseau : on ne bloque pas
        if (profile?.role !== "driver" && profile?.role !== "courier") return alive && setState("ok"); // admin, etc.

        const { data: driver, error: dErr } = await supabase.from("drivers").select("name, phone, vehicle, iban, bic").eq("auth_id", user.id).maybeSingle();
        if (dErr) return alive && setState("ok");

        if (isDriverComplete(driver)) {
          markDriverComplete(user.id);
          alive && setState("ok");
        } else {
          alive && setState("incomplete");
        }
      } catch {
        alive && setState("ok");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    );
  }
  if (state === "incomplete") return <Navigate to="/onboarding" replace />;
  return children;
}
