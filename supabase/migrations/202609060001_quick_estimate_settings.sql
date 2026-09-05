begin;

-- Rates behind the estimate shown after the short inquiry form is submitted.
--
-- These are deliberately separate from `quote_settings`, which drives the detailed quotation
-- builder. That one prices a specified system from an itemised rate card; this one turns a single
-- average monthly bill into one figure. Sharing a table would force every change to one to be
-- reasoned about against the other.
--
-- Security model matches the rest of the pricing schema: nothing is granted to `anon`, no policy
-- names `anon`, and the website never reads this table. The `quick-estimate` Edge Function reads
-- it with the service role and returns only the finished figures the customer is shown.

create table if not exists public.quick_estimate_settings (
  id text primary key default 'default' check (id = 'default'),

  -- Electricity tariffs used to turn a peso bill into kilowatt-hours. Public utility rates rather
  -- than company pricing, but they live here so the admin can follow a tariff change without a
  -- redeploy.
  residential_rate_per_kwh numeric(10, 4) not null default 13.59
    check (residential_rate_per_kwh > 0),
  commercial_rate_per_kwh numeric(10, 4) not null default 12.44
    check (commercial_rate_per_kwh > 0),
  industrial_rate_per_kwh numeric(10, 4) not null default 10.98
    check (industrial_rate_per_kwh > 0),

  -- Engineering assumptions used to size the system.
  peak_sun_hours numeric(6, 3) not null default 4 check (peak_sun_hours > 0),
  days_per_month numeric(6, 2) not null default 30 check (days_per_month > 0),
  panel_watts numeric(10, 2) not null default 620 check (panel_watts > 0),

  -- Company pricing. Never leaves the server.
  price_per_kw numeric(14, 2) not null default 41000 check (price_per_kw > 0),
  battery_cost numeric(14, 2) not null default 90000 check (battery_cost >= 0),

  -- An estimate quoted to the peso reads as a firm price. Rounding keeps it honest about what it
  -- is.
  rounding_step integer not null default 1000 check (rounding_step between 1 and 1000000),

  updated_at timestamptz not null default now()
);

drop trigger if exists quick_estimate_settings_touch_updated_at on public.quick_estimate_settings;
create trigger quick_estimate_settings_touch_updated_at
before update on public.quick_estimate_settings
for each row execute function private.touch_updated_at();

alter table public.quick_estimate_settings enable row level security;

revoke all on table public.quick_estimate_settings from anon, authenticated;
grant select, insert, update on table public.quick_estimate_settings to authenticated;

-- Owner-only, like the rest of the rate card. A content editor manages the website but must not be
-- able to read or rewrite what the company charges, and gating that in the admin sidebar alone
-- would leave the REST API open to any signed-in coworker.
drop policy if exists "Owners manage quick estimate settings" on public.quick_estimate_settings;
create policy "Owners manage quick estimate settings"
on public.quick_estimate_settings
for all
to authenticated
using ((select private.is_owner()))
with check ((select private.is_owner()));

-- The single row the Edge Function reads. Every column has a default, so the figures the client
-- supplied are in place the moment this migration runs.
insert into public.quick_estimate_settings (id)
values ('default')
on conflict (id) do nothing;

commit;
