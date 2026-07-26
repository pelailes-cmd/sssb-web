# Supabase administrator setup

The public website remains hosted by GitHub Pages. Supabase provides authentication, managed
content, and uploads. The browser receives only a publishable key; database row-level security is
the authority that permits or rejects every write.

## 1. Create the project

1. Create a free project at <https://supabase.com/dashboard>.
2. Choose a nearby region and save the database password in a password manager.
3. Do not copy a `service_role`, secret, or database password into this repository.

## 2. Install the database schema

1. Open **SQL Editor** in the Supabase dashboard.
2. Copy the complete contents of
   `supabase/migrations/202607260001_admin_cms.sql` into a new query.
3. Run the query once. It creates the content tables, administrator authorization rules, and the
   public `site-assets` bucket.

## 3. Create the seed administrator

1. Open **Authentication → Users** and choose **Add user**.
2. Use `pelailes@admin.sssb.test` as the internal email alias.
3. Enter the temporary seed password supplied separately. Never add that password to source code.
4. Enable **Auto Confirm User**, then create the user.
5. Return to **SQL Editor** and run:

```sql
insert into public.admin_users (user_id, username, role)
select id, 'pelailes', 'owner'
from auth.users
where email = 'pelailes@admin.sssb.test'
on conflict (user_id) do update
set username = excluded.username,
    role = excluded.role;
```

6. In the Email authentication provider settings, disable public user signups. The administrator
   created above can still sign in.
7. After the first login, use **Admin → Security** to replace the temporary password with a unique
   password of at least 12 characters.

## 4. Connect local development

Create `.env.local` from `.env.example` and enter only:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The `.env.local` file is ignored by Git and must remain local.

## 5. Connect GitHub Pages

In `pelailes-cmd/sssb-web`, open **Settings → Secrets and variables → Actions → Variables**. Add
these repository variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the values shown under the Supabase project's API settings. Do not add the `service_role` key.
Run the **Deploy testing site to GitHub Pages** workflow again after saving the variables.

## 6. Import existing content

1. Open the published site and choose **Login**.
2. Sign in with username `pelailes` and the temporary password.
3. Select **Import missing items** when the dashboard offers it. This merges the original verified
   products, promotion, services, and About Us content without replacing additions or edits that
   are already in the database.

From that point, published changes appear after a database refresh and do not require a GitHub
commit. GitHub deployment remains necessary only for code and design changes.

## 7. Enable coworker accounts on an existing project

1. In **SQL Editor**, run the complete contents of
   `supabase/migrations/202607260002_team_access.sql`. This promotes `pelailes` to the protected
   owner role and adds the owner-only team authorization policy.
2. Open **Edge Functions** in the Supabase dashboard.
3. Choose **Deploy a new function -> Via Editor** and name it `manage-team-user`.
4. Replace the editor contents with the complete contents of
   `supabase/functions/manage-team-user/index.ts`.
5. Keep JWT verification enabled and select **Deploy function**. Supabase supplies its server-only
   service-role environment value to hosted Edge Functions automatically; never copy that value
   into the website or GitHub variables.
6. Sign out of the website and sign back in so the updated owner role is loaded.
7. Open **Team access** in the administrator sidebar. The owner can create coworker usernames,
   issue or reset temporary passwords, and remove coworker access.

Coworkers receive the `editor` role. They can manage website content and change their own password,
but they cannot create or remove accounts. Each coworker should replace their temporary password
under **Security** after signing in for the first time.
