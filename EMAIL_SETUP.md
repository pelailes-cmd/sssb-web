# Estimate request setup

The **Get an Estimate** button in the header, and the matching button in every main section, opens a
short form — name, email, phone, preferred installation date, property type, roof type, floors,
address and average monthly bill.

Two things happen when it is submitted. The details are emailed to the sales inbox, and the visitor
is shown an estimated cost worked out from their bill. Both are handled on the server: the browser
never sees a rate, a price per kW or the battery cost, and never works a figure out for itself.

- **Delivery** uses a Google Apps Script web app, so there is no mail provider account to open. Any
  Google account that can receive the mail can host it.
- **Pricing** uses the `quick-estimate` Supabase Edge Function, reading rates the administrator
  edits under **Pricing → Estimate rates** in the admin dashboard.

Sections 1, 2, 4 and 5 set up the email. Section 3 sets up the estimate; skip it and the form still
works and the inquiry still arrives, but the visitor is shown no figure.

## 1. Create the script

1. Open <https://script.google.com> signed in as the account that should own the mailer, and choose
   **New project**.
2. The new project opens with a file called `Code.gs` containing an empty `myFunction`. Select all
   of it, delete it, and paste the whole of `google-apps-script/quote-inquiry.gs` in its place.

   Leave the file named `Code.gs`. Apps Script merges every `.gs` file in a project into one shared
   scope and never looks at the file names — it only needs `doPost` and `doGet` to exist somewhere
   in the project. `quote-inquiry.gs` is simply the name the code is stored under in this
   repository. Renaming the file to match changes nothing either way.

3. Rename the **project** — the "Untitled project" title at the top left — to something you will
   recognise later, such as `Smart Save Solar quote inquiries`. This one is worth doing, because it
   is what appears in your Apps Script project list.

## 2. Set the recipient

1. In the script editor open **Project Settings** (the gear icon).
2. Under **Script Properties**, choose **Add script property**.
3. Name it `RECIPIENT_EMAIL` and set the value to the sales or admin inbox, for example
   `sales@yourcompany.com`.

Keeping the address here rather than in the website means it is never published in the site's
JavaScript, so it cannot be scraped from the page.

If the property is missing, the script falls back to the Google account that owns it.

### Sending to more than one person

`RECIPIENT_EMAIL` accepts a list. Everybody on it receives every notification:

```
sales@yourcompany.com, admin@yourcompany.com, owner@yourcompany.com
```

Commas, semicolons, spaces and line breaks all separate addresses, so paste them however is
convenient. The same mailbox listed twice is only sent to once.

### Sending orders and estimate requests to different people

Two optional properties route by kind. Set either, both, or neither:

| Property                   | Receives                     |
| -------------------------- | ---------------------------- |
| `ESTIMATE_RECIPIENT_EMAIL` | estimate requests only       |
| `ORDER_RECIPIENT_EMAIL`    | orders from the shop only    |
| `RECIPIENT_EMAIL`          | whatever is not routed above |

Each of these takes a list too, so orders can go to two people and estimate requests to someone
else. `RECIPIENT_EMAIL` still has to be set as the fallback.

**Keep the lists short.** Gmail's daily allowance counts _recipients_, not messages — three people
on every notification spends the allowance three times as fast, against 100 a day on a consumer
account. The script refuses more than five on one notification rather than draining the quota
quietly. For a larger team, make a Google Group and use the group's address: it fans the message
out on Google's side and costs one recipient.

One bad address stops the whole send rather than delivering to the rest, so a typo is loud instead
of silently losing one person from the list. The health check below reports how many recipients are
configured for each kind; run `testMailer` from the editor to see the actual addresses in the log.

## 3. Connect the estimate

The figures are computed in Supabase, not in the script and not in the browser. This section wires
the two together.

### 3a. Create the settings table

In the Supabase dashboard open **SQL Editor**, paste the whole of
`supabase/migrations/202609060001_quick_estimate_settings.sql` and run it. It creates one row
holding the rates, owner-only, readable by nothing that is not signed in as the owner.

The starting values are the ones the business supplied: ₱13.59, ₱12.44 and ₱10.98 per kWh for
residential, commercial and industrial, 4 peak sun hours, 620 W panels, ₱41,000 per kW and a ₱90,000
battery. Change them any time under **Pricing → Estimate rates** in the admin dashboard — the change
applies to the next submission, with no redeployment.

### 3b. Deploy the pricing function

1. In the Supabase dashboard open **Edge Functions** and create a function named `quick-estimate`.
2. Paste the whole of `supabase/functions/quick-estimate/index.ts` as its `index.ts`.
3. **Turn JWT verification off.** The caller is the Apps Script mailer, which holds no Supabase
   session. The shared secret below is what protects the endpoint instead.
4. Deploy it.

### 3c. Set the shared secret

Choose a random string of **at least 16 characters** — anything long and unguessable will do. The
function refuses to run with a shorter one rather than leaving pricing open.

1. In Supabase, under **Edge Functions → Secrets**, add `ESTIMATE_SHARED_SECRET` with that value.
2. Back in the Apps Script **Project Settings → Script Properties**, add two more properties:
   - `ESTIMATE_SHARED_SECRET` — the same value, character for character.
   - `ESTIMATE_ENDPOINT` — the function URL, which looks like
     `https://<your-project>.supabase.co/functions/v1/quick-estimate`.

This secret is why the pricing endpoint cannot be called from a browser or by anyone who finds the
URL. Because the estimate rises in a straight line with the bill, an endpoint anyone could call
would give up the price per kW and the battery cost after two requests. Going through the mailer
puts the hidden field, the timing check and the three-per-hour limit in front of it, and every
attempt lands in the sales inbox.

## 4. Deploy it as a web app

1. Choose **Deploy → New deployment**.
2. Set the type to **Web app**.
3. **Execute as:** _Me_. The script needs your permission to send mail.
4. **Who has access:** _Anyone_. This is required — website visitors are not signed in to Google.
5. Select **Deploy**, then grant the permissions Google asks for. The warning screen is expected
   for a personal script: choose **Advanced → Go to (project name)**.
6. Copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy…/exec`.

   This is not the same as the link in your browser's address bar while editing, and not the Drive
   share link for the project. Only the deployment URL has `/macros/s/` in it and ends in `/exec`.
   Opening either of the others gives a Google Drive page reading "Sorry, the file cannot be opened
   at this time", because Drive cannot display a script file. If you lose it, it is under
   **Deploy → Manage deployments**, next to the active Web app deployment.

You can confirm it is live by opening that URL in a browser. It prints a small status object
reporting whether a recipient is configured, whether this deployment may send mail, and whether the
pricing service answered.

## 5. Point the website at it

**For the live site**, add a repository variable in GitHub:

- **Settings → Secrets and variables → Actions → Variables → New repository variable**
- Name: `VITE_QUOTE_INQUIRY_ENDPOINT`
- Value: the web app URL

**For local development**, add the same line to your `.env`:

```
VITE_QUOTE_INQUIRY_ENDPOINT=https://script.google.com/macros/s/AKfy…/exec
```

Until this is set, the form still opens but the submit button is disabled and the visitor is asked
to phone instead, so nobody fills the form in and loses their answers.

## 6. Test it

Open the site, choose **Get an Estimate**, fill every field and submit. You should see
_"Submission success, we'll get back to you right away."_ followed by the estimated cost, the system
size and the number of panels. The email should arrive within a few seconds carrying the same
figures. Replying to that email goes straight to the customer, because their address is set as the
reply-to.

## 7. Orders from the shop

The product catalogue has a cart. **Order Now** at the end of checkout posts to the same web app,
so there is nothing else to configure — if estimate requests arrive, orders will too.

An order email arrives as **New order SSS-260913-4KQ – Juan dela Cruz** and carries the customer's
details, the delivery address and landmark, the mode of payment, any voucher code, every line with
its branch and quantity, and the total. The reference at the top is what the customer sees on
screen, so either side can quote it on the phone.

Three things are worth knowing:

- **No payment is taken.** The website has no payment provider. The customer is told plainly that
  sales will contact them to arrange payment, and the email says the same so nobody assumes money
  has already moved.
- **The total is recomputed here**, from the lines in the request, rather than trusted from the
  browser. A cart edited in someone's own storage cannot change the figure sales reads.
- **A voucher is carried, not applied.** The code is passed through for sales to confirm; the total
  is the undiscounted one, and the checkout form says so.

Orders share the hidden field, the timing check and the three-per-hour limit with estimate
requests, and the same mailbox.

Prices and branch stock are not set here. They live with each product in the admin dashboard —
see `SUPABASE_SETUP.md` section 12. A product with no price is listed as "Price on request" and
cannot be added to the cart, so the shop stays quiet until somebody prices it.

## If an inquiry says "The inquiry could not be emailed"

That message means everything worked except the send itself: the request reached Google, passed the
origin, spam and validation checks, and found a recipient. Two things cause it, and there is a
quick way to tell them apart.

**Open the web app URL in a browser.** The health check reports which:

```json
{
  "recipientConfigured": true,
  "estimateRecipients": 2,
  "orderRecipients": 1,
  "mailAuthorised": true,
  "quotaRemaining": 97,
  "estimateConfigured": true
}
```

The two counts are how you confirm a list or a routing change took: they are numbers rather than
addresses because this page is public.

- `"mailAuthorised": false` — the deployment has not been granted permission to send mail. This is
  the usual cause on a first deployment, and it happens when the project was deployed before the
  code was pasted in, so Google never asked for the mail permission.
- `"recipientConfigured": false` — `recipientProblem` says what is wrong with `RECIPIENT_EMAIL`,
  usually a stray space or a name typed where an address belongs.

**Then run the mailer directly.** In the script editor choose `testMailer` from the function list
beside **Run**, and press Run. This is the fastest fix for the authorisation case: it prompts for
any missing permission there and then. If something else is wrong it reports the exact error in the
execution log, rather than the tidied-up message a visitor sees.

Once `testMailer` sends you an email, go to **Deploy → Manage deployments → edit → Version: New
version** so the live web app picks up the permission, and try the form again.

If you would rather read the failure directly, every send error is written to the execution log:
open **Executions** in the left sidebar and look at the most recent `doPost` entry.

## If the inquiry arrives but shows no estimated cost

The email says `Estimate shown to the customer: None`, followed by the reason and the underlying
error. The health check reports the same reason as `estimateProblem`, without the detail, because
that page is public:

- `not authorised to fetch` — **the most likely reason the first time.** Calling an external URL is
  a permission this project did not need until the estimate was added, so a script authorised
  before then cannot do it, however correct the URL and secret are. In the script editor choose
  `testEstimate` from the function list beside **Run** and press Run: it makes one deliberately
  unguarded call, which is what lets Google offer the consent screen. Choose **Review permissions →
  Advanced → Go to (project name) → Allow**, run it once more to confirm it now answers, then go to
  **Deploy → Manage deployments → edit → Version: New version**.

  If no consent screen appears and the same error comes straight back, the editor is holding a
  stale list of the permissions this script needs. Revoke the project at
  <https://myaccount.google.com/permissions>, reload the editor tab, and run `testEstimate` again —
  you will be asked for every permission from scratch, mail included.

- `not configured (add …)` — the named Script Property is missing. Expect this if section 3 has not
  been done. Adding a property takes effect immediately; only a change to the script's **code**
  needs a new deployment version. See section 3c.
- `refused` — the endpoint answered but would not price the request. Almost always the two copies of
  the secret differ, or JWT verification is still switched on for the function.
- `unreachable` — the URL in `ESTIMATE_ENDPOINT` is malformed or its host does not resolve. It
  should read `https://<your-project>.supabase.co/functions/v1/quick-estimate`, with no spaces and
  nothing after `quick-estimate`.

Running `testEstimate` is the quickest way to tell these apart whatever the cause: it reports the
exact error in the execution log rather than the category, and prompts for the permission if that is
what is missing.

Nothing here loses an inquiry. The email is sent either way, and the customer is told their request
arrived; they simply see no figure.

## What to know about this approach

**The endpoint address is public.** It is compiled into the website, as any address a browser calls
must be. The recipient mailbox is not public, the rates are not public, and the script defends
itself:

- every field is validated again on Google's side, because the browser's checks can be bypassed
- a hidden field that only automated form-fillers complete causes the submission to be discarded
- submissions that arrive within a second of the form opening are discarded, which catches scripts
  that post immediately without penalising somebody using browser autofill
- one email address may send three inquiries per hour

**What the estimate does and does not give away.** The visitor is shown a total, a system size and a
panel count — never a rate, a per-kW price or the battery cost, and never the arithmetic. What
cannot be prevented is inference: because the total rises in a straight line with the bill, somebody
who submits two different bills and compares the answers can work out the price per kW and the
battery cost. The rate limit above is what makes that costly rather than free, and every attempt
arrives in the sales inbox as a named inquiry.

**Gmail has a daily send limit** — 100 messages a day on a consumer account, 1,500 on Workspace. The
protections above are there to stop that allowance being wasted.

**Changing the script later:** after editing the code you must choose **Deploy → Manage deployments
→ edit → Version: New version** for the change to take effect. Saving alone does not update the
live web app.
