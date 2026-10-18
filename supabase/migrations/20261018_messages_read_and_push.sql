-- Messagerie : accusé de lecture (« Lu »), compteur de non-lus et notification push des messages de l'administrateur.
-- Additif : une colonne facultative, une fonction et un déclencheur. Les messages existants ne sont pas modifiés.

-- 1) Date de lecture d'un message (vide = pas encore lu)
alter table public.messages add column if not exists read_at timestamptz;
create index if not exists messages_unread_idx on public.messages (recipient_id) where read_at is null;

-- 2) Le chauffeur marque comme lus les messages qui lui sont adressés (et seulement eux)
create or replace function public.mark_messages_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.messages set read_at = now()
  where recipient_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_messages_read() from public, anon;
grant execute on function public.mark_messages_read() to authenticated;

-- 3) Message de l'administrateur à un chauffeur -> on prévient la fonction serveur (notification push)
create or replace function public.notify_driver_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  begin
    perform net.http_post(
      url := 'https://oggxhosuvbmdmpiziezp.supabase.co/functions/v1/notify-message',
      body := jsonb_build_object('message_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-secret', (select value from private.push_config where key = 'webhook_secret')
      )
    );
  exception when others then
    null; -- une erreur de notification ne doit jamais bloquer l'envoi d'un message
  end;
  return new;
end $$;

drop trigger if exists messages_notify_driver on public.messages;
create trigger messages_notify_driver
  after insert on public.messages
  for each row
  when (new.is_admin_message = true and new.recipient_id is not null)
  execute function public.notify_driver_new_message();
