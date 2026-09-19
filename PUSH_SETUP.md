# Push notifications (Android + iPhone) via Web Push

Ce projet est une PWA (React/Vite). Les notifs “app fermée” passent par **Web Push** (Android + iOS Safari 16.4+).

## 1) Générer les clés VAPID
```bash
npx web-push generate-vapid-keys
```

Dans `.env` (frontend):
```
VITE_VAPID_PUBLIC_KEY=...PUBLIC_KEY...
```

Dans Supabase (Project Settings > Functions > Secrets):
```
VAPID_PUBLIC_KEY=...PUBLIC_KEY...
VAPID_PRIVATE_KEY=...PRIVATE_KEY...
VAPID_SUBJECT=mailto:contact@votredomaine.tld
```

## 2) Table Supabase
Exécute ce SQL dans Supabase (SQL Editor):
```sql
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text unique not null,
  p256dh text,
  auth text,
  updated_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

create policy "user can manage own subscriptions"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## 3) Edge Function (Supabase) pour envoyer la push
Crée une fonction `send-mission-push`:
```ts
// supabase/functions/send-mission-push/index.ts
import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { user_id, title, body, url } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!
  );

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (error) return new Response(JSON.stringify(error), { status: 500 });

  const payload = JSON.stringify({
    title: title || "Nouvelle course",
    body: body || "Une nouvelle mission est disponible.",
    url: url || "/missions",
  });

  const results = await Promise.all(
    (data || []).map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      ).catch((e) => ({ error: String(e) }))
    )
  );

  return new Response(JSON.stringify({ ok: true, results }));
});
```

Déploiement:
```bash
supabase functions deploy send-mission-push
```

## 4) Déclenchement
Le plus simple: **appelle la fonction quand tu crées une course** (côté admin/dispatch). 
Tu peux aussi ajouter un Webhook DB (Supabase Dashboard > Database > Webhooks) sur `orders` (INSERT) vers cette fonction.

---

✅ Code client déjà intégré dans `MissionMonitor` + `sw.js`.
