-- Sécurité : messages et courses côté chauffeur.
-- (Appliqué en production le 18/10/2026 ; les photos sont dans 20261018_storage_owner_only.sql)

-- 1) Un chauffeur ne peut pas modifier montants, paiement, client, adresses ni contacts d'une course.
--    Il peut changer le statut, les photos et les informations de livraison, lâcher sa course ou prendre une course libre.
create or replace function public.orders_protect_driver_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if not (old.driver_id = auth.uid() or (old.driver_id is null and new.driver_id = auth.uid())) then
    return new;
  end if;

  if old.driver_id is not null and new.driver_id is distinct from old.driver_id and new.driver_id is not null then
    raise exception 'Modification du chauffeur non autorisée';
  end if;

  if (new.user_id, new.price_estimate, new.amount_due, new.payment_status, new.payment_mode, new.payment_due_date,
      new.billing_status, new.invoice_sent_at, new.paid_at, new.stripe_customer_id, new.stripe_payment_method_id,
      new.stripe_invoice_id, new.tracking_code, new.source, new.client_type, new.contact_name, new.contact_email,
      new.contact_phone, new.pickup_name, new.pickup_address, new.pickup_city, new.delivery_name,
      new.dropoff_address, new.delivery_address, new.delivery_city, new.format, new.delai, new.notes, new.stops,
      new.scheduled_at, new.delivery_deadline, new.created_at, new.review_requested_at, new.adresse_facturation,
      new.siret, new.raison_sociale, new.tva_number, new.pickup_instructions, new.delivery_instructions)
     is distinct from
     (old.user_id, old.price_estimate, old.amount_due, old.payment_status, old.payment_mode, old.payment_due_date,
      old.billing_status, old.invoice_sent_at, old.paid_at, old.stripe_customer_id, old.stripe_payment_method_id,
      old.stripe_invoice_id, old.tracking_code, old.source, old.client_type, old.contact_name, old.contact_email,
      old.contact_phone, old.pickup_name, old.pickup_address, old.pickup_city, old.delivery_name,
      old.dropoff_address, old.delivery_address, old.delivery_city, old.format, old.delai, old.notes, old.stops,
      old.scheduled_at, old.delivery_deadline, old.created_at, old.review_requested_at, old.adresse_facturation,
      old.siret, old.raison_sociale, old.tva_number, old.pickup_instructions, old.delivery_instructions)
  then
    raise exception 'Modification non autorisée pour un chauffeur';
  end if;

  return new;
end $$;

drop trigger if exists orders_protect_driver_fields on public.orders;
create trigger orders_protect_driver_fields
  before update on public.orders
  for each row execute function public.orders_protect_driver_fields();

-- 2) Un chauffeur n'écrit qu'au dispatch (administrateur), ou sans destinataire précis.
drop policy if exists messages_user_insert on public.messages;
create policy messages_user_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and is_admin_message = false
    and (
      recipient_id is null
      or exists (select 1 from public.profiles p where p.id = recipient_id and p.role = 'admin')
    )
  );

-- 3) Les commandes sans compte ne sont plus acceptées : toutes les vraies commandes viennent d'un compte client
--    ou du dispatch (administrateur).
drop policy if exists "Allow anonymous inserts" on public.orders;
