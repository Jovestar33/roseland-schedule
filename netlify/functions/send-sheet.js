const crypto = require('crypto');

function makeEditorToken(password, secret) {
  return crypto.createHmac('sha256', secret).update(`editor:${password}`).digest('hex');
}

function isAuthorizedEditor(token) {
  const APP_PASSWORD = process.env.SCHEDULE_APP_PASSWORD;
  const AUTH_SECRET = process.env.SCHEDULE_AUTH_SECRET;
  if (!APP_PASSWORD || !AUTH_SECRET || !token) return false;
  return token === makeEditorToken(APP_PASSWORD, AUTH_SECRET);
}

function buildEmailHtml({ scheduleName, scheduleDate, contactSheetUrl, callSheetUrl }) {
  const pink = '#e91e8c';
  const dateStr = scheduleDate
    ? new Date(scheduleDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : scheduleDate;

  const linkButton = (label, url) =>
    `<a href="${url}" style="display:inline-block;margin:6px 8px 6px 0;padding:10px 20px;background:${pink};color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;font-family:'DM Sans',Helvetica,Arial,sans-serif;">${label}</a>`;

  const links = [
    contactSheetUrl ? linkButton('View Contact Sheet', contactSheetUrl) : '',
    callSheetUrl ? linkButton('View Call Sheet', callSheetUrl) : '',
  ].filter(Boolean).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:'DM Sans',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);max-width:600px;width:100%;">
  <tr><td style="background:#111;padding:18px 28px;border-bottom:3px solid ${pink};">
    <span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:2px;text-transform:uppercase;">ROSELAND PICTURES</span>
  </td></tr>
  <tr><td style="padding:28px 28px 8px;">
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111;">${scheduleName}</p>
    ${dateStr ? `<p style="margin:0 0 20px;font-size:14px;color:#71717a;">${dateStr}</p>` : '<div style="height:20px;"></div>'}
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">Your documents for this shoot day are ready:</p>
    <div>${links}</div>
  </td></tr>
  <tr><td style="padding:20px 28px 28px;border-top:1px solid #e4e4e7;margin-top:20px;">
    <p style="margin:0;font-size:12px;color:#a1a1aa;">Sent via Roseland Schedule &mdash; Production Management by Roseland Pictures</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const { to, subject, callSheetUrl, contactSheetUrl, scheduleName, scheduleDate, editorToken } =
      JSON.parse(event.body || '{}');

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'RESEND_API_KEY not configured' }) };
    }

    if (!to || !Array.isArray(to) || to.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No recipients specified' }) };
    }

    const html = buildEmailHtml({ scheduleName: scheduleName || 'Schedule', scheduleDate, contactSheetUrl, callSheetUrl });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Roseland Pictures <action@roseland-pictures.com>',
        to,
        subject: subject || `Documents for ${scheduleName || 'Schedule'}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('Resend error:', result);
      return { statusCode: 502, headers, body: JSON.stringify({ error: result.message || 'Email send failed' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: result.id }) };
  } catch (err) {
    console.error('send-sheet error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
