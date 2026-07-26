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
insert into public.admin_users (user_id, username)
select id, 'pelailes'
from auth.users
where email = 'pelailes@admin.sssb.test'
on conflict (user_id) do update set username = excluded.username;
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

## 6. Initialize existing content

1. Open the published site and choose **Login**.
2. Sign in with username `pelailes` and the temporary password.
3. Select **Initialize content** once. This copies only uninitialized static collections into the
   database and preserves any records already created there.

From that point, published changes appear after a database refresh and do not require a GitHub
commit. GitHub deployment remains necessary only for code and design changes.
