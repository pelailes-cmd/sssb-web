# Quote inquiry email setup

The **Get a Quote** button in the header opens a short form — name, email, phone, preferred
installation date, roof type, floors, address and average monthly bill. Nothing is priced. The
details are emailed to the sales inbox and the visitor is told their inquiry arrived.

Delivery uses a Google Apps Script web app, so there is no mail provider account to open and no
database table involved. Any Google account that can receive the mail can host it.

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

## 3. Deploy it as a web app

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
reporting whether a recipient is configured and whether this deployment may send mail.

## 4. Point the website at it

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

## 5. Test it

Open the site, choose **Get a Quote**, fill every field and submit. You should see
_"Submission success, we'll get back to you right away."_ and the email should arrive within a few
seconds. Replying to that email goes straight to the customer, because their address is set as the
reply-to.

## If an inquiry says "The inquiry could not be emailed"

That message means everything worked except the send itself: the request reached Google, passed the
origin, spam and validation checks, and found a recipient. Two things cause it, and there is a
quick way to tell them apart.

**Open the web app URL in a browser.** The health check reports which:

```json
{ "recipientConfigured": true, "mailAuthorised": true, "quotaRemaining": 97 }
```

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

## What to know about this approach

**The endpoint address is public.** It is compiled into the website, as any address a browser calls
must be. The recipient mailbox is not public, and the script defends itself:

- every field is validated again on Google's side, because the browser's checks can be bypassed
- a hidden field that only automated form-fillers complete causes the submission to be discarded
- submissions that arrive within a second of the form opening are discarded, which catches scripts
  that post immediately without penalising somebody using browser autofill
- one email address may send three inquiries per hour

**Gmail has a daily send limit** — 100 messages a day on a consumer account, 1,500 on Workspace. The
protections above are there to stop that allowance being wasted. If the volume of genuine inquiries
ever approaches the limit, or if the endpoint attracts abuse, the same form can be pointed at a
Supabase Edge Function instead, which would keep the URL private and add per-address rate limiting;
the browser code would not need to change beyond the endpoint.

**Changing the script later:** after editing the code you must choose **Deploy → Manage deployments
→ edit → Version: New version** for the change to take effect. Saving alone does not update the
live web app.
