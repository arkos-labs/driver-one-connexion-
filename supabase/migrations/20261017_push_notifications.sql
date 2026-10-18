-- Notifications push : téléphones des chauffeurs + déclencheur "nouvelle course assignée".
-- Purement additif : ne modifie aucune table ni aucune donnée existante.

-- 1) Un jeton Apple par téléphone, rattaché à un chauffeur
create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null default 'ios',
  updated_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on public.device_tokens(user_id);

alter table public.device_tokens enable row level security;

-- Chaque chauffeur ne voit et ne supprime que ses propres téléphones
create policy "driver reads own device tokens" on public.device_tokens
  for select using (auth.uid() = user_id);
create policy "driver deletes own device tokens" on public.device_tokens
  for delete using (auth.uid() = user_id);

-- Enregistrement d'un téléphone (si le téléphone change de compte, il est transféré)
create or replace function public.register_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.device_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), p_token, 'ios', now())
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
end $$;
revoke all on function public.register_device_token(text) from public, anon;
grant execute on function public.register_device_token(text) to authenticated;

-- 2) Secret partagé entre le déclencheur et la fonction serveur (jamais visible côté app)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.push_config (key text primary key, value text not null);
insert into private.push_config (key, value)
values ('webhook_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function public.push_get_secret()
returns text
language sql
security definer
set search_path = private
as $$ select value from private.push_config where key = 'webhook_secret' $$;
revoke all on function public.push_get_secret() from public, anon, authenticated;
grant execute on function public.push_get_secret() to service_role;

-- 3) Déclencheur : course assignée à un chauffeur -> on prévient la fonction serveur
create or replace function public.notify_driver_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  begin
    perform net.http_post(
      url := 'https://oggxhosuvbmdmpiziezp.supabase.co/functions/v1/notify-driver',
      body := jsonb_build_object('order_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', (select value from private.push_config where key = 'webhook_secret')
      )
    );
  exception when others then
    null; -- une erreur de notification ne doit jamais bloquer l'enregistrement d'une course
  end;
  return new;
end $$;

drop trigger if exists orders_notify_driver_insert on public.orders;
create trigger orders_notify_driver_insert
  after insert on public.orders
  for each row
  when (new.driver_id is not null and new.status in ('assigned', 'confirmee'))
  execute function public.notify_driver_new_order();

drop trigger if exists orders_notify_driver_update on public.orders;
create trigger orders_notify_driver_update
  after update of driver_id, status on public.orders
  for each row
  when (
    new.driver_id is not null
    and new.status in ('assigned', 'confirmee')
    and (old.driver_id is distinct from new.driver_id or old.status is distinct from new.status)
  )
  execute function public.notify_driver_new_order();
