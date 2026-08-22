/**
 * Quote inquiry mailer for the Smart Save Solar website.
 *
 * Deployed as a Google Apps Script web app, this receives the short quote form and emails it to
 * the sales inbox. Deployment instructions are in EMAIL_SETUP.md.
 *
 * The recipient address lives in Script Properties rather than in this file, so it is never
 * published in the website bundle. Every field is validated again here: the browser's checks are
 * for the visitor's benefit, not a guarantee, because the endpoint can be called directly.
 */

/** Maximum characters accepted for any single field. */
var MAX_FIELD = 500;
/**
 * Deliberately low. This only catches scripts that POST the moment the page loads; the hidden
 * field below is the real filter. A visitor using browser autofill can genuinely complete the form
 * in a couple of seconds, and silently discarding one of those would lose a real customer.
 */
var MIN_ELAPSED_MS = 1000;
/** Submissions accepted from one email address per hour. */
var MAX_PER_EMAIL_PER_HOUR = 3;

var ROOF_LABELS = {
  metal: 'Corrugated metal / G.I. sheet',
  concrete: 'Concrete deck',
  tile: 'Clay or concrete tile',
  shingle: 'Asphalt shingle',
  other: 'Other',
};

/**
 * Writes to the execution log. New projects run on V8, where `console` exists, but a project left
 * on the older runtime only has `Logger`, and an unguarded `console` call there would itself throw.
 */
function logLine(message) {
  if (typeof console !== 'undefined' && console.log) console.log(message);
  else Logger.log(message);
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/**
 * Health check: open the web app URL in a browser to see it.
 *
 * It reports whether a recipient is configured and whether this deployment is actually allowed to
 * send mail, which is the difference between "set the property" and "re-authorise the script" —
 * the two things that go wrong after a first deployment. No address is included, since the page is
 * public.
 */
function doGet() {
  var recipient = resolveRecipient();
  var mailAuthorised = false;
  var quotaRemaining = null;

  try {
    // Reading the quota needs the same permission as sending, so it fails in exactly the case
    // where sending would fail for want of authorisation.
    quotaRemaining = MailApp.getRemainingDailyQuota();
    mailAuthorised = true;
  } catch (quotaError) {
    mailAuthorised = false;
  }

  return json({
    ok: true,
    service: 'quote-inquiry',
    recipientConfigured: !recipient.error,
    recipientProblem: recipient.error || null,
    mailAuthorised: mailAuthorised,
    quotaRemaining: quotaRemaining,
  });
}

function text(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD);
}

function positiveNumber(value) {
  var parsed = parseFloat(String(value).replace(/[^\d.]/g, ''));
  return isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validate(payload) {
  var fullName = text(payload.fullName);
  var email = text(payload.email);
  var phone = text(payload.phone);
  var installationDate = text(payload.installationDate);
  var roofType = text(payload.roofType);
  var address = text(payload.address);
  var floors = positiveNumber(payload.floors);
  var monthlyBill = positiveNumber(payload.monthlyBill);

  if (fullName.length < 2) return { error: 'A full name is required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'A valid email is required.' };
  if (!/^\+?[\d\s()-]{7,20}$/.test(phone)) return { error: 'A valid phone number is required.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installationDate)) {
    return { error: 'A preferred installation date is required.' };
  }
  if (!ROOF_LABELS[roofType]) return { error: 'A valid roof type is required.' };
  if (floors === null || floors > 60) return { error: 'A number of floors is required.' };
  if (address.length < 5) return { error: 'An installation address is required.' };
  if (monthlyBill === null) return { error: 'An average monthly bill is required.' };

  return {
    inquiry: {
      fullName: fullName,
      email: email,
      phone: phone,
      installationDate: installationDate,
      roofType: ROOF_LABELS[roofType],
      floors: String(Math.round(floors)),
      address: address,
      monthlyBill: monthlyBill,
    },
  };
}

function withinRateLimit(email) {
  var cache = CacheService.getScriptCache();
  var key = 'inq_' + Utilities.base64EncodeWebSafe(email.toLowerCase()).slice(0, 40);
  var count = parseInt(cache.get(key) || '0', 10);
  if (count >= MAX_PER_EMAIL_PER_HOUR) return false;
  cache.put(key, String(count + 1), 3600);
  return true;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmail(inquiry) {
  var peso = '₱' + Number(inquiry.monthlyBill).toLocaleString('en-PH');
  var rows = [
    ['Full name', inquiry.fullName],
    ['Email', inquiry.email],
    ['Phone', inquiry.phone],
    ['Preferred installation date', inquiry.installationDate],
    ['Roof type', inquiry.roofType],
    ['Number of floors', inquiry.floors],
    ['Address', inquiry.address],
    ['Average monthly bill', peso],
  ];

  var plain = rows
    .map(function (row) {
      return row[0] + ': ' + row[1];
    })
    .join('\n');

  var html =
    '<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    rows
      .map(function (row) {
        return (
          '<tr>' +
          '<td style="padding:6px 14px 6px 0;color:#60778a;white-space:nowrap">' +
          escapeHtml(row[0]) +
          '</td>' +
          '<td style="padding:6px 0;font-weight:600;color:#0a2035">' +
          escapeHtml(row[1]) +
          '</td>' +
          '</tr>'
        );
      })
      .join('') +
    '</table>';

  return { plain: plain, html: html };
}

/**
 * Works out where to send, and says why if it cannot.
 *
 * A stray space or a name pasted in place of an address is a common mistake, and it surfaces as a
 * failure at send time rather than at configuration time, so it is checked here instead.
 */
function resolveRecipient() {
  var configured = PropertiesService.getScriptProperties().getProperty('RECIPIENT_EMAIL');
  var address = configured ? String(configured).trim() : '';

  if (!address) {
    try {
      address = Session.getEffectiveUser().getEmail();
    } catch (lookupError) {
      return {
        error:
          'No RECIPIENT_EMAIL is set and the owner address could not be read. Add a ' +
          'RECIPIENT_EMAIL script property.',
      };
    }
  }

  if (!address) {
    return { error: 'The inquiry mailbox is not configured. Add a RECIPIENT_EMAIL property.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
    return {
      error: 'The RECIPIENT_EMAIL property is not a valid email address: "' + address + '".',
    };
  }

  return { address: address };
}

/**
 * Sends the notification, falling back to a plain message if the richer one is refused.
 *
 * The formatted version sets a sender name, a reply-to and an HTML body. If any of those is what
 * the account objects to, the plain three-argument form usually still goes through — and an
 * inquiry that arrives looking basic is far better than one that never arrives.
 */
function deliver(recipient, inquiry) {
  var body = buildEmail(inquiry);
  var subject = 'New quote request - ' + inquiry.fullName;

  try {
    MailApp.sendEmail({
      to: recipient,
      // Replying to the notification reaches the customer directly.
      replyTo: inquiry.email,
      subject: subject,
      body: body.plain,
      htmlBody: body.html,
      name: 'Smart Save Solar website',
    });
    return { ok: true };
  } catch (richError) {
    logLine('Formatted send failed, trying plain: ' + richError);
    try {
      MailApp.sendEmail(recipient, subject, body.plain);
      return { ok: true };
    } catch (plainError) {
      return { ok: false, reason: String(plainError) };
    }
  }
}

/**
 * Run this from the Apps Script editor to diagnose delivery.
 *
 * Running it here, rather than through the website, does two useful things: it prompts for any
 * permission the script has not been granted yet, which is the usual reason sending fails after a
 * fresh deployment; and it reports the exact error rather than the tidied-up message a visitor
 * sees. Select `testMailer` in the toolbar and press Run, then read the execution log.
 */
function testMailer() {
  var recipient = resolveRecipient();
  if (recipient.error) {
    throw new Error(recipient.error);
  }

  logLine('Sending a test message to ' + recipient.address);
  MailApp.sendEmail({
    to: recipient.address,
    subject: 'Smart Save Solar website - mailer test',
    body: 'If you are reading this, the quote inquiry mailer can send email.',
    name: 'Smart Save Solar website',
  });
  logLine('Sent. Remaining quota today: ' + MailApp.getRemainingDailyQuota());
  return 'Sent to ' + recipient.address;
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (parseError) {
    return json({ ok: false, error: 'A valid request is required.' });
  }

  // A filled honeypot, or a form completed impossibly fast, is not a person. Answer as though it
  // succeeded so an automated caller learns nothing, but send nothing.
  if (text(payload.website) !== '') return json({ ok: true });
  if (Number(payload.elapsedMs) < MIN_ELAPSED_MS) return json({ ok: true });

  var checked = validate(payload);
  if (checked.error) return json({ ok: false, error: checked.error });

  if (!withinRateLimit(checked.inquiry.email)) {
    return json({
      ok: false,
      error: 'Several requests were already sent. Please try again later.',
    });
  }

  var recipient = resolveRecipient();
  if (recipient.error) {
    logLine('Recipient unusable: ' + recipient.error);
    return json({ ok: false, error: recipient.error, detail: recipient.error });
  }

  var sent = deliver(recipient.address, checked.inquiry);
  if (!sent.ok) {
    // The reason is logged for the operator and returned as `detail`, which the website does not
    // display. Losing an inquiry to a message nobody can act on is the failure worth avoiding.
    logLine('Send failed: ' + sent.reason);
    return json({
      ok: false,
      error: 'The inquiry could not be emailed. Please try again.',
      detail: sent.reason,
    });
  }

  return json({ ok: true });
}
