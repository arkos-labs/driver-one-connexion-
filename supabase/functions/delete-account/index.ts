// Suppression du compte du chauffeur connecté (exigée par l'App Store, règle 5.1.1(v)).
// Appelée par l'app avec le jeton de l'utilisateur : verify_jwt = true (par défaut).
// Refuse s'il reste des missions en cours, anonymise les données personnelles (les missions terminées
// restent pour la comptabilité), puis supprime le compte. Si la suppression est bloquée par des liens
// avec d'autres tables, le compte est désactivé définitivement.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: "Non authentifié" }, 401);

  const { count } = await admin
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("driver_id", user.id)
    .neq("status", "delivered")
    .neq("status", "cancelled");
  if (count && count > 0) {
    return json({ error: `Suppression impossible : ${count} mission(s) en cours.` }, 409);
  }

  // Données personnelles : on les efface avant de supprimer le compte
  await admin.from("drivers")
    .update({ name: "Compte supprimé", phone: null, iban: null, bic: null, status: "hors_service" })
    .eq("auth_id", user.id);
  await admin.from("profiles").update({ full_name: "Compte supprimé", phone: null }).eq("id", user.id);

  const { error: delError } = await admin.auth.admin.deleteUser(user.id);
  if (delError) {
    // Liens avec d'autres tables : on désactive le compte à vie et on libère l'e-mail
    await admin.auth.admin.updateUserById(user.id, {
      ban_duration: "876000h",
      email: `deleted-${user.id}@deleted.invalid`,
      user_metadata: {},
    });
  }
  return json({ ok: true });
});
