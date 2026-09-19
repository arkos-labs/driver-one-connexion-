import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function RequireAuth({ children }) {
  const [state, setState] = useState("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(session ? "authenticated" : "unauthenticated");
    });
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-ink border-t-transparent" />
      </div>
    );
  }

  if (state === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return children;
}
