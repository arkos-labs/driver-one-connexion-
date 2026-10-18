-- IBAN et BIC des chauffeurs (obligatoires à l'inscription, pour leurs paiements).
-- Additif : deux colonnes facultatives en base (l'app, elle, les rend obligatoires) sur la table drivers.
-- Qui peut les lire : seulement le chauffeur concerné et les administrateurs (règles RLS existantes de drivers).

alter table public.drivers
  add column if not exists iban text,
  add column if not exists bic text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drivers_iban_format') then
    alter table public.drivers
      add constraint drivers_iban_format check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'drivers_bic_format') then
    alter table public.drivers
      add constraint drivers_bic_format check (bic is null or bic ~ '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$');
  end if;
end $$;
