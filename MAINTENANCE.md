# Maintaining the site

The website is a static build served by GitHub Pages from `smartsavesolar.lifestyle`. There is no
server to patch and nothing to restart. What there is to look after falls into four places, and the
first question to ask about any change is which one it belongs to.

## Where a change belongs

| What you want to change                                                      | Where                                                          | Takes effect                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Products, promotions, services, portfolio, documents, media, About Us        | Admin dashboard → **Content**                                  | Next page load                                             |
| Product prices and branch stock                                              | Admin dashboard → **Content → Products**                       | Next page load                                             |
| Estimate rates — tariffs, peak sun hours, price per kW, battery, panel watts | Admin dashboard → **Pricing → Estimate rates** (owner only)    | Next submission                                            |
| Quotation rate card for the detailed estimator                               | Admin dashboard → **Pricing** (owner only)                     | Next submission                                            |
| Which locations a record is offered in                                       | The record's **Location availability** tick boxes              | Next page load                                             |
| Coworker accounts and passwords                                              | Admin dashboard → **Team access** (owner only)                 | Immediately                                                |
| Layout, wording outside the CMS, new sections, colours                       | This repository                                                | Merge to `main`, then the deploy                           |
| Who order and estimate emails go to                                          | Apps Script → **Project Settings → Script Properties**         | Immediately                                                |
| The order and estimate email wording or rules                                | `google-apps-script/quote-inquiry.gs`, pasted into Apps Script | After **Deploy → Manage deployments → edit → New version** |
| Database tables, Edge Functions, secrets                                     | Supabase dashboard                                             | Immediately                                                |
| DNS, domain renewal                                                          | Namecheap                                                      | Minutes to a day                                           |

Most weeks nothing in this repository needs to change. Content, prices, stock and rates are all
administrator settings, on purpose — none of them needs a developer or a deployment.

## Routine checks

**Monthly.** Open the Apps Script web app URL in a browser. It prints a short status object:

```json
{
  "recipientConfigured": true,
  "mailAuthorised": true,
  "quotaRemaining": 97,
  "estimateConfigured": true
}
```

Anything `false` there means a form is quietly failing. `EMAIL_SETUP.md` explains each one.

**Monthly.** Send yourself a test estimate request and a test order. They are the two paths that can
break without anybody noticing, because a visitor who gets no reply simply goes elsewhere.

**Quarterly.** Check that product prices and stock still match reality. Stock counts here are typed
by hand; nothing syncs them.

**Yearly, and set a reminder.** The domain renews at Namecheap. Turn on auto-renew — if
`smartsavesolar.lifestyle` lapses the whole site goes dark, and the GitHub Pages certificate goes
with it.

## Things that bite if ignored

**Supabase inactivity.** Free-tier projects are paused after a period with no activity. If that
happens the admin login stops working and the site falls back to its last cached content, so
visitors still see a working site while you cannot edit it. Signing in to the Supabase dashboard
resumes it. Check your plan's current policy — this is the single most likely cause of "the admin
suddenly will not let me in".

**Gmail send limits.** Orders and estimate requests both go through one Google account: 100 messages
a day on a consumer account, 1,500 on Workspace. The hidden field, the timing check and the
three-per-hour-per-address limit exist to stop that allowance being wasted, but a genuinely busy
month is worth watching. `quotaRemaining` on the health check is the number to look at.

**Content backups.** Everything an administrator edits lives in Supabase, not in this repository.
Losing the project loses the content. Export `content_items` from the Supabase dashboard
occasionally, or at least before any bulk edit.

**Apps Script deployments.** Editing the script is not enough. A code change only reaches visitors
after **Deploy → Manage deployments → edit → Version: New version**. Adding or changing a _Script
Property_ does take effect immediately.

## Changing the code

Anything in this repository goes through the same loop:

```bash
npm install          # first time, or after dependencies change
npm run dev          # http://127.0.0.1:5173
```

Before merging:

```bash
npm run lint
npm run typecheck    # tsc -b; `npx tsc --noEmit` does nothing here, the root config is references-only
npm test
npm run build
npm run audit:browser   # needs `npm run dev` running in another terminal
```

The GitHub Actions workflow runs lint and the tests on every push to `main`, then builds and
deploys. A red workflow means nothing reached the site, so the previous version stays up.

**Deploying is merging.** There is no separate publish step for the website itself. Merging to
`main` triggers the deploy, which takes a couple of minutes.

Two things are _not_ deployed by that workflow and have to be pasted by hand when they change:
the Apps Script mailer, and anything under `supabase/` (migrations and Edge Functions). If a change
touches those, the setup docs say exactly what to paste where.

## Dependencies

`npm outdated` shows drift; `npm audit` shows advisories. Neither needs chasing weekly, but do not
let a year go by. Update in small batches and run the full check list above — the test suite covers
the pricing arithmetic, the order rules and the mailer, so a bad upgrade tends to surface there
rather than in front of a customer.

Note that `sharp` is a build-time dependency used by `scripts/process-assets.mjs` to resize images.
It never reaches the browser, so an advisory against it affects whoever runs the build, not
visitors.

## Where the rest is written down

- `EMAIL_SETUP.md` — the Apps Script mailer, the estimate service it calls, orders, and what each
  failure message means.
- `SUPABASE_SETUP.md` — database schema, administrator accounts, Edge Functions, pricing console,
  and how to price products and report branch stock.
- `CONTENT_AUDIT.md` — what source material the site was built from.

## Open items

These are known and deliberate, not faults:

- `public/robots.txt` still reads `Disallow: /`, so no search engine indexes the site. It is a
  one-line change when the content is ready to be found.
- Products with no price set are listed as "Price on request" and cannot be added to the cart.
- The footer's **Get a free quote now!** explains that the detailed estimator is under construction;
  the estimator itself still exists and is switched off rather than removed.
