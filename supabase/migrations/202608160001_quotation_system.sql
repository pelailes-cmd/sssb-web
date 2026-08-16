begin;

-- Pricing configuration and generated quotations.
--
-- Security model: none of the tables in this migration grant anything to `anon`, and none of
-- them carry a policy `to anon`. Unauthenticated visitors therefore cannot read pricing rates,
-- multipliers, fee percentages or stored quotations through PostgREST even by calling the API
-- directly. The public website never reads these tables; it posts its answers to the
-- `quotation-estimate` Edge Function, which prices the request with the service role and
-- returns only generic category labels and rounded amounts.

create table if not exists public.quote_settings (
  id text primary key default 'default' check (id = 'default'),
  currency_code text not null default 'PHP' check (length(currency_code) between 3 and 8),
  currency_symbol text not null default '₱' check (length(currency_symbol) between 1 and 4),
  quotation_prefix text not null default 'SSS' check (quotation_prefix ~ '^[A-Z][A-Z0-9]{1,7}$'),
  validity_days integer not null default 30 check (validity_days between 1 and 365),
  rounding_step integer not null default 100 check (rounding_step between 1 and 10000),
  minimum_total numeric(14, 2) not null default 0 check (minimum_total >= 0),
  residential_multiplier numeric(6, 3) not null default 1 check (residential_multiplier > 0),
  commercial_multiplier numeric(6, 3) not null default 1 check (commercial_multiplier > 0),
  complexity_multipliers jsonb not null default
    '{"standard": 1, "moderate": 1.15, "complex": 1.35}'::jsonb
    check (jsonb_typeof(complexity_multipliers) = 'object'),
  location_multipliers jsonb not null default
    '{"pili": 1, "lipa": 1.05, "other": 1.12}'::jsonb
    check (jsonb_typeof(location_multipliers) = 'object'),
  -- Used only to size a system when the client does not state a capacity. These are engineering
  -- assumptions rather than prices, but they stay server-side with everything else.
  sizing_assumptions jsonb not null default
    '{"tariff_per_kwh": 12, "peak_sun_hours": 4.5, "performance_ratio": 0.8, "offset_target": 0.7, "battery_day_fraction": 0.35}'::jsonb
    check (jsonb_typeof(sizing_assumptions) = 'object'),
  client_notes text[] not null default array[
    'The estimate covers supply and installation of the scope listed above.',
    'Permits, utility applications, and civil works are quoted separately when required.'
  ],
  disclaimer text not null default
    'This quotation is an initial estimate based on the information provided by the client and is subject to site assessment, engineering evaluation, final design, material availability, project requirements, and other applicable conditions. The final project cost may vary after detailed assessment and confirmation.',
  updated_at timestamptz not null default now()
);

-- One row per client-visible line item. `basis` is a fixed enumeration rather than a stored
-- expression: it keeps the pricing rules configurable without ever evaluating admin-supplied
-- text as code on the server.
create table if not exists public.quote_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,48}$'),
  label text not null check (length(label) between 2 and 80),
  sector text not null default 'both' check (sector in ('residential', 'commercial', 'both')),
  basis text not null default 'fixed' check (
    basis in (
      'fixed',
      'per_kw',
      'per_kwh',
      'per_sqm',
      'per_floor',
      'per_kw_load',
      'percent_of_subtotal'
    )
  ),
  rate numeric(14, 4) not null default 0 check (rate >= 0),
  min_amount numeric(14, 2) check (min_amount >= 0),
  max_amount numeric(14, 2) check (max_amount >= 0),
  applies_when text not null default 'always' check (
    applies_when in ('always', 'with_pv', 'with_battery', 'with_backup', 'commercial_only')
  ),
  position integer not null default 0 check (position >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_categories_order_idx
on public.quote_categories (is_active, position);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique,
  public_token uuid not null unique default gen_random_uuid(),
  sector text not null check (sector in ('residential', 'commercial')),
  status text not null default 'generated' check (
    status in ('draft', 'generated', 'sent', 'under_review', 'approved', 'rejected', 'expired')
  ),
  client_name text not null check (length(client_name) between 1 and 160),
  client_contact text not null check (length(client_contact) between 1 and 160),
  client_email text check (length(client_email) <= 160),
  project_name text check (length(project_name) <= 160),
  project_location text not null check (length(project_location) between 1 and 200),
  service_area text not null default 'other' check (service_area in ('pili', 'lipa', 'other')),
  -- Salted digest of the requesting address, used only to rate-limit anonymous submissions.
  client_fingerprint text,
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  system_size_kwp numeric(10, 2) not null default 0 check (system_size_kwp >= 0),
  battery_kwh numeric(10, 2) not null default 0 check (battery_kwh >= 0),
  estimated_total numeric(14, 2) not null default 0 check (estimated_total >= 0),
  currency_code text not null default 'PHP',
  valid_until date,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added after the table was first written; kept separate so re-running the file is still safe.
alter table public.quotations add column if not exists client_fingerprint text;

create index if not exists quotations_recent_idx on public.quotations (created_at desc);
create index if not exists quotations_status_idx on public.quotations (status, created_at desc);
create index if not exists quotations_rate_limit_idx
on public.quotations (client_fingerprint, created_at desc);
create index if not exists quotations_contact_idx
on public.quotations (client_contact, created_at desc);

-- Reference-number allocation. No role is granted anything on this table; it is reachable only
-- through the security-definer function below, so a quotation number can never be minted or
-- guessed from the browser.
create table if not exists public.quotation_counters (
  year integer primary key,
  last_value bigint not null default 0 check (last_value >= 0)
);

drop trigger if exists quote_settings_touch_updated_at on public.quote_settings;
create trigger quote_settings_touch_updated_at
before update on public.quote_settings
for each row execute function private.touch_updated_at();

drop trigger if exists quote_categories_touch_updated_at on public.quote_categories;
create trigger quote_categories_touch_updated_at
before update on public.quote_categories
for each row execute function private.touch_updated_at();

drop trigger if exists quotations_touch_updated_at on public.quotations;
create trigger quotations_touch_updated_at
before update on public.quotations
for each row execute function private.touch_updated_at();

alter table public.quote_settings enable row level security;
alter table public.quote_categories enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_counters enable row level security;

revoke all on table public.quote_settings from anon, authenticated;
revoke all on table public.quote_categories from anon, authenticated;
revoke all on table public.quotations from anon, authenticated;
revoke all on table public.quotation_counters from anon, authenticated;

grant select, insert, update on table public.quote_settings to authenticated;
grant select, insert, update, delete on table public.quote_categories to authenticated;
grant select, update, delete on table public.quotations to authenticated;

-- Pricing is owner-only, matching the sidebar. Content editors manage the website but must not be
-- able to read or rewrite the rate card, and gating this in the UI alone would leave the REST API
-- open to any signed-in coworker.
drop policy if exists "Administrators manage quotation settings" on public.quote_settings;
drop policy if exists "Owners manage quotation settings" on public.quote_settings;
create policy "Owners manage quotation settings"
on public.quote_settings
for all
to authenticated
using ((select private.is_owner()))
with check ((select private.is_owner()));

drop policy if exists "Administrators manage quotation categories" on public.quote_categories;
drop policy if exists "Owners manage quotation categories" on public.quote_categories;
create policy "Owners manage quotation categories"
on public.quote_categories
for all
to authenticated
using ((select private.is_owner()))
with check ((select private.is_owner()));

drop policy if exists "Administrators read quotations" on public.quotations;
create policy "Administrators read quotations"
on public.quotations
for select
to authenticated
using ((select private.is_admin()));

drop policy if exists "Administrators update quotations" on public.quotations;
create policy "Administrators update quotations"
on public.quotations
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Administrators delete quotations" on public.quotations;
create policy "Administrators delete quotations"
on public.quotations
for delete
to authenticated
using ((select private.is_admin()));

-- Allocates the next reference number atomically. Granted to service_role only, so the public
-- Edge Function can mint numbers while browsers cannot: PostgREST rejects the call for both
-- anon and authenticated on the EXECUTE privilege alone.
create or replace function public.issue_quotation_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_year integer := extract(year from (now() at time zone 'Asia/Manila'))::integer;
  configured_prefix text;
  next_value bigint;
begin
  select nullif(btrim(settings.quotation_prefix), '')
  into configured_prefix
  from public.quote_settings as settings
  where settings.id = 'default';

  insert into public.quotation_counters as counter (year, last_value)
  values (target_year, 1)
  on conflict (year) do update
  set last_value = counter.last_value + 1
  returning counter.last_value into next_value;

  return coalesce(configured_prefix, 'SSS')
    || '-'
    || target_year::text
    || '-'
    || lpad(next_value::text, 4, '0');
end;
$$;

-- `from public` alone is not enough: Supabase's default privileges can grant EXECUTE to anon and
-- authenticated at creation time, and those role grants survive a revoke aimed at PUBLIC. Without
-- the explicit revoke below, any visitor holding the publishable key could burn reference numbers
-- through /rest/v1/rpc and read the configured prefix and running count back out.
revoke all on function public.issue_quotation_number() from public;
revoke all on function public.issue_quotation_number() from anon, authenticated;
grant execute on function public.issue_quotation_number() to service_role;

insert into public.quote_settings (id)
values ('default')
on conflict (id) do nothing;

-- Starting rates are placeholders so the calculator is usable immediately. They are NOT verified
-- company pricing: an administrator must confirm every value in the pricing console before the
-- estimates are shared with clients.
insert into public.quote_categories (key, label, sector, basis, rate, min_amount, applies_when, position)
values
  ('pv_modules', 'PV Modules', 'both', 'per_kw', 14000, null, 'with_pv', 10),
  ('hybrid_inverter', 'Hybrid Inverter', 'both', 'per_kw', 11000, null, 'with_pv', 20),
  ('battery_storage', 'Battery Energy Storage', 'both', 'per_kwh', 18000, null, 'with_battery', 30),
  ('mounting_system', 'Mounting System', 'both', 'per_kw', 4500, null, 'with_pv', 40),
  ('protection_devices', 'Protection and Breakers', 'both', 'per_kw', 2800, 6000, 'always', 50),
  ('cables_wiring', 'Cables and Wiring', 'both', 'per_kw', 3200, 6000, 'always', 60),
  ('consumables', 'Materials and Consumables', 'both', 'per_kw', 1800, 4000, 'always', 70),
  ('installation_labor', 'Installation / Labor', 'both', 'per_kw', 8500, 15000, 'always', 80),
  ('backup_changeover', 'Backup and Changeover Provision', 'both', 'fixed', 18000, null, 'with_backup', 90),
  ('testing_commissioning', 'Testing and Commissioning', 'both', 'fixed', 6000, null, 'always', 100),
  ('transport_logistics', 'Transportation / Logistics', 'both', 'fixed', 5000, null, 'always', 110),
  ('site_preparation', 'Site Preparation and Civil Works', 'commercial', 'per_sqm', 45, null, 'commercial_only', 120),
  ('distribution_upgrade', 'Distribution and Riser Provision', 'commercial', 'per_floor', 12000, null, 'commercial_only', 130),
  ('design_documentation', 'Design and Documentation', 'commercial', 'percent_of_subtotal', 2.5, 12000, 'commercial_only', 140),
  ('engineering_fee', 'Engineering Fee', 'both', 'percent_of_subtotal', 3.5, 8000, 'always', 150),
  ('project_management', 'Administration / Project Management', 'both', 'percent_of_subtotal', 4, 8000, 'always', 160)
on conflict (key) do nothing;

commit;

-- Optional: stamp an explicit service-area list onto content that predates the availability
-- filter. Items without an `availability` key are treated as available in every service area,
-- so this is only needed when a record should be restricted.
--
-- update public.content_items
-- set data = data || jsonb_build_object('availability', to_jsonb(array['pili']))
-- where content_type in ('products', 'services', 'promotions')
--   and slug = 'the-record-slug';
