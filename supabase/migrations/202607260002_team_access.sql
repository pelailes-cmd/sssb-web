begin;

alter table public.admin_users
add column if not exists role text not null default 'editor'
check (role in ('owner', 'editor'));

update public.admin_users
set role = 'owner'
where username = 'pelailes';

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

commit;
