/**
 * Quote inquiry mailer for the Smart Save Solar website.
 *
 * Deployed as a Google Apps Script web app, this receives the short quote form and emails it to
 * the sales inbox. Deployment instructions are in EMAIL_SETUP.md.
 *
 * The recipient address lives in Script Properties rather than in this file, so it is never
 * published in the website bundle. Every field is validated again here: the browser's checks are
 * for the visitor's benefit, not a guarantee, because the endpoint can be called directly.
 *
 * It also fetches the estimate the customer is shown. The company's rates are not held here
 * either: this asks the `quick-estimate` Edge Function, which reads them from the administrator's
 * settings and answers with finished figures. See `requestEstimate` below.
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

/** Decides which electricity tariff the estimate is worked out from. */
var PROPERTY_LABELS = {
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
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

  // A live probe against the pricing service with a token bill, so a missing property or a
  // mistyped secret shows up here rather than as a silently figure-less inquiry. Only whether it
  // worked is reported: this page is public, so no amount and no endpoint appear in the answer.
  var probe = requestEstimate('residential', 10000);
  if (probe.error) logLine('Estimate probe failed (' + probe.error + '): ' + probe.detail);

  return json({
    ok: true,
    service: 'quote-inquiry',
    recipientConfigured: !recipient.error,
    recipientProblem: recipient.error || null,
    mailAuthorised: mailAuthorised,
    quotaRemaining: quotaRemaining,
    estimateConfigured: !probe.error,
    estimateProblem: probe.error || null,
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
  var propertyType = text(payload.propertyType);
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
  if (!PROPERTY_LABELS[propertyType]) return { error: 'A valid property type is required.' };
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
      // The key drives the estimate; the label is what the sales team reads.
      propertyType: propertyType,
      propertyTypeLabel: PROPERTY_LABELS[propertyType],
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

function peso(amount) {
  return '₱' + Number(amount).toLocaleString('en-PH');
}

function plainTable(rows) {
  return rows
    .map(function (row) {
      return row[0] + ': ' + row[1];
    })
    .join('\n');
}

function htmlTable(rows) {
  return (
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
    '</table>'
  );
}

/**
 * What the customer was shown, and the working behind it.
 *
 * A follow-up call should start from the number already on the customer's screen, so the figure is
 * repeated here even though sales could recompute it. When the estimate could not be produced the
 * reason is stated plainly: the customer saw no figure, and the caller needs to know that.
 */
function estimateRows(estimate, problem) {
  if (!estimate) {
    return [['Estimate shown to the customer', 'None - ' + (problem || 'unavailable')]];
  }
  return [
    ['Estimated monthly usage', estimate.monthlyKwh + ' kWh'],
    ['Estimated system size', estimate.systemSizeKw + ' kW'],
    ['Solar panels', estimate.panelCount],
    ['Estimated cost shown to the customer', peso(estimate.estimatedTotal)],
  ];
}

function buildEmail(inquiry, estimate, estimateProblem) {
  var details = [
    ['Full name', inquiry.fullName],
    ['Email', inquiry.email],
    ['Phone', inquiry.phone],
    ['Preferred installation date', inquiry.installationDate],
    ['Property type', inquiry.propertyTypeLabel],
    ['Roof type', inquiry.roofType],
    ['Number of floors', inquiry.floors],
    ['Address', inquiry.address],
    ['Average monthly bill', peso(inquiry.monthlyBill)],
  ];
  var figures = estimateRows(estimate, estimateProblem);

  return {
    plain: plainTable(details) + '\n\nEstimate\n' + plainTable(figures),
    html:
      htmlTable(details) +
      '<p style="margin:22px 0 8px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;' +
      'letter-spacing:.08em;text-transform:uppercase;color:#60778a">Estimate</p>' +
      htmlTable(figures),
  };
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
 * Asks the pricing service for the figure to show the customer.
 *
 * The rates are edited by the administrator in Supabase and the arithmetic runs in the
 * `quick-estimate` Edge Function. Nothing here knows what the company charges: this sends a
 * property type and a bill, and receives back only the finished figures. That endpoint refuses
 * browsers and requires the shared secret, so the only route to a priced answer is through this
 * script — behind the honeypot, the timing check and the per-address rate limit.
 *
 * Every failure is reported rather than thrown. An inquiry that arrives without a figure is worth
 * far more than one that is lost because the pricing service was briefly unavailable.
 */
function requestEstimate(propertyType, monthlyBill) {
  var properties = PropertiesService.getScriptProperties();
  var endpoint = String(properties.getProperty('ESTIMATE_ENDPOINT') || '').trim();
  var secret = String(properties.getProperty('ESTIMATE_SHARED_SECRET') || '').trim();

  if (!endpoint || !secret) {
    var missing = [];
    if (!endpoint) missing.push('ESTIMATE_ENDPOINT');
    if (!secret) missing.push('ESTIMATE_SHARED_SECRET');
    // Named rather than generic. This reason is what the sales email and the public health check
    // both report, and knowing which property to add is the whole of the fix. The names are in the
    // repository already, so spelling them out reveals nothing.
    return {
      error: 'not configured (add ' + missing.join(' and ') + ')',
      detail: 'Script Properties missing: ' + missing.join(', '),
    };
  }

  var response;
  try {
    // UrlFetchApp has no timeout setting; `muteHttpExceptions` is what keeps a refusal from
    // aborting the whole execution before the email is sent.
    response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-estimate-secret': secret },
      payload: JSON.stringify({ propertyType: propertyType, monthlyBill: monthlyBill }),
      muteHttpExceptions: true,
    });
  } catch (fetchError) {
    var reason = String(fetchError);
    // Fetching an external URL is a permission this project did not need until the estimate was
    // added, so a deployment authorised before then cannot do it at all. That failure arrives here
    // looking like any other, and calling it "unreachable" sends the operator hunting a URL that
    // was right all along. Run `testEstimate` from the editor to grant it.
    if (/permission|authoriz|authoris|scope/i.test(reason)) {
      return { error: 'not authorised to fetch', detail: reason };
    }
    return { error: 'unreachable', detail: reason };
  }

  var status = response.getResponseCode();
  var parsed = null;
  try {
    parsed = JSON.parse(response.getContentText());
  } catch (parseError) {
    return { error: 'unreadable reply', detail: 'HTTP ' + status };
  }

  if (status !== 200 || !parsed || !parsed.estimate) {
    return {
      error: 'refused',
      detail: 'HTTP ' + status + ' ' + ((parsed && parsed.error) || ''),
    };
  }

  return { estimate: parsed.estimate };
}

/**
 * Sends the notification, falling back to a plain message if the richer one is refused.
 *
 * The formatted version sets a sender name, a reply-to and an HTML body. If any of those is what
 * the account objects to, the plain three-argument form usually still goes through — and an
 * inquiry that arrives looking basic is far better than one that never arrives.
 */
function deliver(recipient, inquiry, estimate, estimateProblem) {
  var body = buildEmail(inquiry, estimate, estimateProblem);
  var subject = 'New estimate request - ' + inquiry.fullName;

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

/**
 * Run this from the Apps Script editor to diagnose the estimate link.
 *
 * Like `testMailer`, running it here rather than through the website does two useful things. It
 * prompts for any permission the script has not been granted yet — fetching an external URL is one
 * this project did not need until the estimate was added, so a project authorised before then will
 * fail every attempt until it is granted. And it reports the exact error rather than the category
 * the sales email shows. Select `testEstimate` in the toolbar and press Run, then read the log.
 */
function testEstimate() {
  var endpoint = String(
    PropertiesService.getScriptProperties().getProperty('ESTIMATE_ENDPOINT') || '',
  ).trim();
  if (!endpoint) {
    throw new Error('ESTIMATE_ENDPOINT is not set. See EMAIL_SETUP.md section 3c.');
  }
  logLine('ESTIMATE_ENDPOINT is ' + endpoint);

  // Deliberately unguarded, and deliberately before anything else.
  //
  // `requestEstimate` catches every failure so that a pricing problem can never cost an inquiry.
  // That is right for a submission and wrong here: catching the authorisation error is precisely
  // what stops Apps Script offering the consent screen for a permission the project has not been
  // granted. Fetching an external URL is such a permission — this project did not need one until
  // the estimate was added, so a script authorised before then has to ask for it. Letting this
  // call throw is what makes the prompt appear.
  //
  // The reply is discarded. It carries no secret, so the service will refuse it, and that is fine:
  // being refused still proves the call was allowed to leave.
  UrlFetchApp.fetch(endpoint, { method: 'post', payload: '{}', muteHttpExceptions: true });

  var result = requestEstimate('residential', 10000);
  if (result.error) {
    throw new Error(result.error + ' - ' + result.detail);
  }

  logLine('The estimate service answered: ' + JSON.stringify(result.estimate));
  return 'The estimate service is reachable.';
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

  // Priced before sending so the sales team and the customer see the same figure. A failure here
  // is recorded and carried into the email, never raised: the inquiry still has to arrive.
  var priced = requestEstimate(checked.inquiry.propertyType, checked.inquiry.monthlyBill);
  if (priced.error) {
    logLine('Estimate unavailable (' + priced.error + '): ' + priced.detail);
  }

  // The email is internal, so it carries the exact reason rather than the category the public
  // health check reports. Reading it there beats digging through the execution log.
  var problem = priced.error ? priced.error + (priced.detail ? ' - ' + priced.detail : '') : null;

  var sent = deliver(recipient.address, checked.inquiry, priced.estimate || null, problem);
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

  // The figure reaches the browser only after the inquiry is safely in the inbox, and only as
  // computed here. The website never works one out for itself.
  return json({ ok: true, estimate: priced.estimate || null });
}
