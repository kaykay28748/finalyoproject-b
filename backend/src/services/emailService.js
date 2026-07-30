// backend/src/services/emailService.js
import nodemailer from 'nodemailer';

const EMAIL_USER  = process.env.EMAIL_USER;
const EMAIL_PASS  = process.env.EMAIL_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || EMAIL_USER;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

// Postgres numeric columns come back as strings from the pg driver.
// Always parse before calling .toFixed() to avoid "toFixed is not a function".
function safeCoord(value, decimals = 6) {
  const n = parseFloat(value);
  return isNaN(n) ? '?' : n.toFixed(decimals);
}

// ── Password reset ────────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(to, token, frontendUrl = 'https://ugnavigator.onrender.com') {
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reset Your Password</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 500px; margin: 50px auto; background: white; border-radius: 24px; padding: 40px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
        h1 { font-size: 28px; font-weight: 700; color: #111; text-align: center; margin-bottom: 12px; }
        p  { font-size: 15px; color: #555; line-height: 1.5; margin-bottom: 24px; }
        .btn { display: inline-block; background: #1a6d8f; color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 15px; margin: 16px 0; }
        .token { font-family: monospace; background: #f0f0f0; padding: 8px 12px; border-radius: 8px; font-size: 12px; word-break: break-all; }
        .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Reset Your Password</h1>
        <p>We received a request to reset your TransitGuide password. Click the button below to create a new one.</p>
        <div style="text-align:center">
          <a href="${resetLink}" class="btn">Reset Password</a>
        </div>
        <p style="margin-top:16px">Or paste this link into your browser:</p>
        <p class="token">${resetLink}</p>
        <p>This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email.</p>
        <div class="footer"><p>TransitGuide — Accra, Ghana</p></div>
      </div>
    </body>
    </html>
  `;

  try {
    const info = await transporter.sendMail({
      from:    `"TransitGuide" <${EMAIL_USER}>`,
      to,
      subject: 'Reset Your TransitGuide Password',
      text:    `Reset your password: ${resetLink} (expires in 1 hour)`,
      html,
    });
    console.log('[Email] Password reset sent to:', to, '— ID:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('[Email] Password reset failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ── New report → admin notification ──────────────────────────────────────────
export async function sendReportNotification(report) {
  const issueTypeLabels = {
    blocked_ramp:   'Blocked Ramp',
    missing_curb:   'Missing Curb Cut',
    broken_surface: 'Broken / Uneven Surface',
    poor_lighting:  'Poor Lighting',
    construction:   'Construction / Road Closed',
    other:          'Other Issue',
  };
  const severityLabels = { 1: 'Mild', 2: 'Moderate', 3: 'Severe' };

  const issueLabel    = issueTypeLabels[report.issue_type] || report.issue_type;
  const severityLabel = severityLabels[report.severity]    || 'Moderate';
  const latStr        = safeCoord(report.lat);
  const lngStr        = safeCoord(report.lng);
  const mapLink       = `https://www.openstreetmap.org/?mlat=${latStr}&mlon=${lngStr}#map=18/${latStr}/${lngStr}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 500px; margin: 50px auto; background: white; border-radius: 24px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
        h1 { font-size: 24px; font-weight: 700; color: #111; margin-bottom: 20px; }
        .detail-box { background: #f8fafc; border-radius: 16px; padding: 16px; margin: 20px 0; }
        .row { display: flex; margin-bottom: 10px; font-size: 14px; }
        .label { width: 110px; font-weight: 600; color: #475569; flex-shrink: 0; }
        .value { flex: 1; color: #0f172a; }
        .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 10px; font-weight: 500; margin-top: 16px; }
        .s1 { color: #22c55e; } .s2 { color: #f59e0b; } .s3 { color: #ef4444; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚧 New Accessibility Report</h1>
        <p>A new accessibility issue has been reported on campus.</p>
        <div class="detail-box">
          <div class="row"><span class="label">Report ID:</span><span class="value">#${report.id}</span></div>
          <div class="row"><span class="label">Issue:</span><span class="value">${issueLabel}</span></div>
          <div class="row"><span class="label">Severity:</span><span class="value s${report.severity}">${severityLabel}</span></div>
          ${report.custom_description ? `<div class="row"><span class="label">Description:</span><span class="value">${report.custom_description}</span></div>` : ''}
          ${report.location_name      ? `<div class="row"><span class="label">Place:</span><span class="value">${report.location_name}</span></div>` : ''}
          <div class="row"><span class="label">Coordinates:</span><span class="value">${latStr}, ${lngStr}</span></div>
          <div class="row"><span class="label">Reported by:</span><span class="value">${report.email || 'Anonymous'}</span></div>
          <div class="row"><span class="label">Submitted:</span><span class="value">${new Date(report.created_at).toLocaleString()}</span></div>
        </div>
        <a href="${mapLink}" class="btn" target="_blank">View on Map →</a>
        <div class="footer">
          <p>TransitGuide — Accra, Ghana</p>
          <p>Log into the admin dashboard to approve or reject this report.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from:    `"TransitGuide Reports" <${EMAIL_USER}>`,
      to:      ADMIN_EMAIL,
      subject: `[TransitGuide] New Accessibility Report #${report.id} — ${issueLabel}`,
      text:    `New ${issueLabel} report #${report.id} submitted. View: ${mapLink}`,
      html,
    });
    console.log('[Email] Admin notified for report #', report.id);
    return { success: true };
  } catch (error) {
    console.error('[Email] Admin notification failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ── Report resolved → user notification ──────────────────────────────────────
export async function sendReportResolutionEmail(report, status, adminNotes = null) {
  const userEmail = report.email;
  if (!userEmail) {
    console.warn('[Email] No user email for report #', report.id, '— skipping resolution email');
    return { success: false, error: 'No user email available' };
  }

  const isApproved    = status === 'approved';
  const latStr        = safeCoord(report.lat);
  const lngStr        = safeCoord(report.lng);

  const issueTypeLabels = {
    blocked_ramp:   'Blocked Ramp',
    missing_curb:   'Missing Curb Cut',
    broken_surface: 'Broken / Uneven Surface',
    poor_lighting:  'Poor Lighting',
    construction:   'Construction / Road Closed',
    other:          'Other Issue',
  };
  const issueLabel = issueTypeLabels[report.issue_type] || report.issue_type;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
        .container { max-width: 500px; margin: 50px auto; background: white; border-radius: 24px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,.08); }
        h1 { font-size: 24px; font-weight: 700; margin-bottom: 16px; }
        .detail-box { background: #f8fafc; border-radius: 16px; padding: 16px; margin: 20px 0; font-size: 14px; }
        .detail-box p { margin: 0 0 8px; color: #334155; }
        .approved { color: #22c55e; } .rejected { color: #ef4444; }
        .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${isApproved ? '✅ Report Approved' : '📋 Report Reviewed'}</h1>
        <p>Thank you for helping improve campus accessibility.</p>
        <div class="detail-box">
          <p><strong>Report #${report.id}</strong> — ${issueLabel}</p>
          <p>Status: <strong class="${isApproved ? 'approved' : 'rejected'}">${isApproved ? 'Approved — will be factored into route planning' : 'Not accepted at this time'}</strong></p>
          ${adminNotes ? `<p><strong>Admin notes:</strong> ${adminNotes}</p>` : ''}
          <p>Location: ${latStr}, ${lngStr}</p>
        </div>
        ${isApproved
          ? '<p>This issue will now be weighted in the accessibility routing profile so other users get safer routes.</p>'
          : '<p>If you believe this was submitted in error, feel free to resubmit with additional details.</p>'
        }
        <div class="footer"><p>TransitGuide — Accra, Ghana</p></div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from:    `"TransitGuide Accessibility" <${EMAIL_USER}>`,
      to:      userEmail,
      subject: isApproved
        ? `[TransitGuide] Your accessibility report #${report.id} was approved ✅`
        : `[TransitGuide] Update on your accessibility report #${report.id}`,
      text: isApproved
        ? `Your report #${report.id} (${issueLabel}) has been approved and will be factored into route planning.${adminNotes ? ' Admin notes: ' + adminNotes : ''}`
        : `Your report #${report.id} (${issueLabel}) was reviewed but not accepted at this time.${adminNotes ? ' Admin notes: ' + adminNotes : ''}`,
      html,
    });
    console.log('[Email] Resolution email sent to', userEmail, 'for report #', report.id);
    return { success: true };
  } catch (error) {
    console.error('[Email] Resolution email failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ── SMTP health check ─────────────────────────────────────────────────────────
export async function testEmailConfig() {
  try {
    await transporter.verify();
    console.log('[Email] SMTP connection OK');
    return { success: true };
  } catch (error) {
    console.error('[Email] SMTP connection failed:', error.message);
    return { success: false, error: error.message };
  }
}