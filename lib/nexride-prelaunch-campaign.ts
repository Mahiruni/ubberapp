export const PRELAUNCH_CAMPAIGN_ID = "nexride-prelaunch-2026";
export const PRELAUNCH_SUBJECT = "NexRide Is Launching Soon — NexRide በቅርቡ ይጀምራል!";
export const PRELAUNCH_BODY = `Dear NexRide User,

We are excited to announce that NexRide is launching soon! 🚗

Get ready for a smarter, safer, and more convenient ride experience. Thank you for being part of our journey!

ውድ የNexRide ተጠቃሚ፣

NexRide በቅርቡ ሥራ እንደሚጀምር በደስታ እናሳውቃለን!

ለዘመናዊ፣ ምቹ እና አስተማማኝ የጉዞ አገልግሎት ይዘጋጁ። ከእኛ ጋር ስለሆኑ እናመሰግናለን!

Mahir Aman\nCEO & Founder, NexRide

Better Rides. A Brighter Tomorrow.`;
export function prelaunchHtml() {
  const paragraphs = PRELAUNCH_BODY.split("\n\n").map((text) =>
    '<p style="margin:0 0 20px;line-height:1.8;font-size:15px;color:#102334">' +
    text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;") + "</p>"
  ).join("");
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F5F7F9;font-family:Arial,\'Noto Sans Ethiopic\',sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F9"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:white;border-radius:18px;overflow:hidden"><tr><td style="background:#041C30;color:white;padding:28px;font-size:25px;font-weight:700">NexRide <span style="color:#00C878">●</span></td></tr><tr><td style="padding:30px 28px">'+paragraphs+'</td></tr><tr><td style="background:#041C30;padding:16px 28px;color:#fff;font-size:12px">NexRide · Better Rides. A Brighter Tomorrow.</td></tr></table></td></tr></table></body></html>';
}
