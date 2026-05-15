import { Resend } from "resend";

const resendClient = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { toEmail, fromName, holidayName, holidayEmoji, holidayDestination } = req.body;

  if (!toEmail || !fromName || !holidayName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await resendClient.emails.send({
      from: "allbooked <noreply@in.allbooked.app>",
      to: toEmail,
      subject: `${fromName} has shared a holiday with you on allbooked`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f9ff;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
    
    <div style="background:#0ea5e9;padding:28px 32px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">✈️</div>
      <div style="font-size:22px;font-weight:700;color:#ffffff;font-family:Georgia,serif;">
        <span style="color:#bae6fd;">all</span>booked
      </div>
    </div>

    <div style="padding:32px;">
      <p style="font-size:16px;color:#0f172a;margin:0 0 8px;font-weight:600;">
        ${fromName} has shared a holiday with you
      </p>
      <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6;">
        You've been invited to view trip details on allbooked.
      </p>

      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:22px;margin-bottom:6px;">${holidayEmoji || "✈️"}</div>
        <div style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:4px;">${holidayName}</div>
        ${holidayDestination ? `<div style="font-size:13px;color:#64748b;">📍 ${holidayDestination}</div>` : ""}
      </div>

      <p style="font-size:14px;color:#64748b;margin:0 0 20px;line-height:1.6;">
        To view the full holiday details, download allbooked and create a free account using this email address.
      </p>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="https://apps.apple.com/app/allbooked/id6744030076" 
           style="display:inline-block;background:#0ea5e9;color:#ffffff;font-size:15px;font-weight:600;padding:13px 32px;border-radius:10px;text-decoration:none;">
          Download allbooked →
        </a>
      </div>

      <p style="font-size:12px;color:#94a3b8;margin:0;text-align:center;line-height:1.6;">
        allbooked is a free holiday organiser — keep all your bookings, 
        payments and itineraries in one place.
      </p>
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#cbd5e1;margin:0;">
        © 2025 allbooked · <a href="https://allbooked.app/privacy" style="color:#cbd5e1;">Privacy Policy</a>
      </p>
    </div>
  </div>
</body>
</html>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Invite email error:", err);
    return res.status(500).json({ error: err.message });
  }
}
