begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username = lower(username) and length(username) between 3 and 40),
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
grant select on table public.admin_users to authenticated;

drop policy if exists "Administrators can read their own role" on public.admin_users;
create policy "Administrators can read their own role"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function private.is_owner() from public;
grant execute on function private.is_owner() to authenticated;

drop policy if exists "Administrators can read their own role" on public.admin_users;
drop policy if exists "Administrators can read permitted roles" on public.admin_users;
create policy "Administrators can read permitted roles"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) = user_id or (select private.is_owner()));

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_updated_at() from public;
grant execute on function private.touch_updated_at() to authenticated;

create table if not exists public.content_collections (
  content_type text primary key check (
    content_type in ('products', 'promotions', 'portfolio', 'services', 'documents', 'about')
  ),
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null references public.content_collections (content_type) on delete cascade,
  slug text not null check (length(slug) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  position integer not null default 0 check (position >= 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, slug)
);

create index if not exists content_items_public_order_idx
on public.content_items (content_type, is_published, position);

create unique index if not exists content_items_single_about_idx
on public.content_items (content_type)
where content_type = 'about';

drop trigger if exists content_collections_touch_updated_at on public.content_collections;
create trigger content_collections_touch_updated_at
before update on public.content_collections
for each row execute function private.touch_updated_at();

drop trigger if exists content_items_touch_updated_at on public.content_items;
create trigger content_items_touch_updated_at
before update on public.content_items
for each row execute function private.touch_updated_at();

alter table public.content_collections enable row level security;
alter table public.content_items enable row level security;

revoke all on table public.content_collections from anon, authenticated;
revoke all on table public.content_items from anon, authenticated;
grant select on table public.content_collections to anon, authenticated;
grant insert, update, delete on table public.content_collections to authenticated;
grant select on table public.content_items to anon, authenticated;
grant insert, update, delete on table public.content_items to authenticated;

drop policy if exists "Content collection state is public" on public.content_collections;
create policy "Content collection state is public"
on public.content_collections
for select
to anon, authenticated
using (true);

drop policy if exists "Administrators manage content collections" on public.content_collections;
create policy "Administrators manage content collections"
on public.content_collections
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Published content is public" on public.content_items;
create policy "Published content is public"
on public.content_items
for select
to anon, authenticated
using (is_published);

drop policy if exists "Administrators read all content" on public.content_items;
create policy "Administrators read all content"
on public.content_items
for select
to authenticated
using ((select private.is_admin()));

drop policy if exists "Administrators insert content" on public.content_items;
create policy "Administrators insert content"
on public.content_items
for insert
to authenticated
with check ((select private.is_admin()));

drop policy if exists "Administrators update content" on public.content_items;
create policy "Administrators update content"
on public.content_items
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists "Administrators delete content" on public.content_items;
create policy "Administrators delete content"
on public.content_items
for delete
to authenticated
using ((select private.is_admin()));

create or replace function public.reorder_content_items(ordered_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested_count integer := coalesce(cardinality(ordered_ids), 0);
  matched_count integer;
  matched_types integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if requested_count = 0 then
    return;
  end if;

  select count(*), count(distinct content_type)
  into matched_count, matched_types
  from public.content_items
  where id = any(ordered_ids);

  if matched_count <> requested_count or matched_types <> 1 then
    raise exception 'The reorder request must contain unique records from one content collection.';
  end if;

  update public.content_items as item
  set position = requested.position
  from (
    select id, (ordinality - 1)::integer as position
    from unnest(ordered_ids) with ordinality as entry(id, ordinality)
  ) as requested
  where item.id = requested.id;
end;
$$;

revoke all on function public.reorder_content_items(uuid[]) from public;
grant execute on function public.reorder_content_items(uuid[]) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('site-assets', 'site-assets', true, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Public reads website assets" on storage.objects;
create policy "Public reads website assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'site-assets');

drop policy if exists "Administrators upload website assets" on storage.objects;
create policy "Administrators upload website assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'site-assets' and (select private.is_admin()));

drop policy if exists "Administrators update website assets" on storage.objects;
create policy "Administrators update website assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'site-assets' and (select private.is_admin()))
with check (bucket_id = 'site-assets' and (select private.is_admin()));

drop policy if exists "Administrators delete website assets" on storage.objects;
create policy "Administrators delete website assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'site-assets' and (select private.is_admin()));

commit;

-- After creating and auto-confirming the administrator in Authentication > Users,
-- run the following statement separately to grant the account website-admin access:
--
-- insert into public.admin_users (user_id, username, role)
-- select id, 'pelailes', 'owner'
-- from auth.users
-- where email = 'pelailes@admin.sssb.test'
-- on conflict (user_id) do update
-- set username = excluded.username,
--     role = excluded.role;
