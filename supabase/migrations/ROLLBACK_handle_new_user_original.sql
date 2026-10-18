-- Version d'origine de handle_new_user() (avant le correctif du 17/10/2026), pour revenir en arrière si besoin.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_raw text := lower(coalesce(new.raw_user_meta_data ->> 'role', 'client'));
  v_role user_role;
  v_addr text := nullif(trim(new.raw_user_meta_data ->> 'adresse_facturation'), '');
  v_m text[];
begin
  v_role := case when v_raw in ('driver','courier','chauffeur') then 'driver'::user_role else 'client'::user_role end;
  insert into public.profiles (id, role, full_name, phone)
  values (new.id, v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;

  if v_role = 'client' then
    if v_addr is not null then
      v_m := regexp_match(v_addr, '^(.*),\s*(\d{5})\s+(.+)$');
    end if;

    insert into public.clients (id, company_name, siret, tax_id, contact_email, contact_name, contact_phone,
      billing_address, billing_postal_code, billing_city)
    values (new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'company_name', ''), nullif(new.raw_user_meta_data ->> 'company', ''),
               nullif(new.raw_user_meta_data ->> 'raison_sociale', ''), ''),
      nullif(new.raw_user_meta_data ->> 'siret', ''),
      nullif(new.raw_user_meta_data ->> 'tva_number', ''),
      coalesce(new.email, ''),
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'phone', ''),
      coalesce(v_m[1], v_addr, new.raw_user_meta_data ->> 'billing_address', 'À remplir'),
      coalesce(v_m[2], new.raw_user_meta_data ->> 'billing_postal_code', ''),
      coalesce(v_m[3], new.raw_user_meta_data ->> 'billing_city', ''))
    on conflict (id) do nothing;
  end if;
  return new;
end $function$;
