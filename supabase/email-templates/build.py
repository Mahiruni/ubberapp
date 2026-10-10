"""Rebuild NexRide's Supabase templates and safe, non-delivering previews."""
from pathlib import Path
from html import escape
import json, re, shutil

ROOT = Path(__file__).resolve().parent
SITE = 'https://ubberapp.vercel.app'
LOGO = SITE + '/brand/nexride-email-mark.png'
EMAILS = [
    dict(key='confirmation', slug='confirm-sign-up', label='Email confirmation', subject='Welcome to NexRide. Confirm your email.', preheader='One quick confirmation. Your next journey starts here.', eyebrow='WELCOME TO NEXRIDE', title='Your next journey<br>starts here.', intro='A smarter way to move is one step away. Confirm your email address to finish creating your NexRide account.', cta='Confirm my email', note='If you did not create a NexRide account, you can safely ignore this email.', detail='YOUR ACCOUNT, READY TO MOVE', instruction='Confirm your email'),
    dict(key='recovery', slug='reset-password', label='Password reset', subject='Reset your NexRide password securely', preheader='Choose a new password and get back to what moves you.', eyebrow='ACCOUNT RECOVERY', title='A fresh start.<br>A secure account.', intro='We received a request to reset your NexRide password. Choose a new password using the secure link below.', cta='Reset my password', note='Did not request a reset? Ignore this email. Your current password will stay the same.', detail='A SIMPLE STEP TO GET BACK IN', instruction='Choose a new password'),
    dict(key='magic_link', slug='magic-link-or-otp', label='Magic-link sign-in', subject='Your secure sign-in link for NexRide', preheader='Your account is one tap away. No password needed.', eyebrow='SECURE SIGN-IN', title='One tap.<br>You’re on your way.', intro='Use your personal sign-in link to open NexRide. No password to remember, just a secure way back to your account.', cta='Sign in to NexRide', note='If you did not request this sign-in link, you can safely ignore this email.', detail='YOUR DIRECT ROUTE TO NEXRIDE', instruction='Open your account'),
    dict(key='invite', slug='invite-user', label='Account invitation', subject='You’re invited to join NexRide', preheader='Your invitation is here. Take the next step with NexRide.', eyebrow='YOUR INVITATION', title='Good journeys<br>start together.', intro='You have been invited to create a NexRide account. Accept your invitation to continue with your account setup.', cta='Accept my invitation', note='Not expecting this invitation? You can ignore this email. An account will not be activated by this email alone.', detail='THERE’S A PLACE FOR YOU HERE', instruction='Accept your invitation'),
    dict(key='email_change', slug='change-email-address', label='Email-address change', subject='Confirm your NexRide email change', preheader='Review and confirm the email change for your NexRide account.', eyebrow='ACCOUNT UPDATE', title='New email.<br>Same NexRide.', intro='A change to the email address on your NexRide account was requested. Confirm the change to continue.', cta='Confirm email change', note='Did not request this change? Do not confirm it. Open NexRide directly and review your account security.', detail='KEEPING YOUR ACCOUNT CONNECTED', instruction='Confirm the email change'),
    dict(key='reauthentication', slug='reauthentication', label='Reauthentication', subject='Your NexRide verification code', preheader='Use this one-time code to confirm it is you.', eyebrow='IDENTITY CHECK', title='A little check.<br>A lot of protection.', intro='Before you continue with a sensitive account action, enter this verification code in the NexRide screen that requested it.', cta=None, note='Never share this code. NexRide will never ask you to send it to another person. If you did not request it, ignore this email.', detail='EXTRA CARE FOR YOUR ACCOUNT', instruction='Enter your verification code'),
]

def template(e):
    email_detail = ''
    if e['key'] == 'email_change':
        email_detail = '<p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#555367;overflow-wrap:anywhere;word-break:break-word;">New email address<br><strong style="color:#19172a;">{{ .NewEmail }}</strong></p>'
    if e['cta']:
        action = f'''<table role="presentation" cellspacing="0" cellpadding="0" border="0" class="action" style="margin:0 0 28px;"><tr><td bgcolor="#5145e5" style="border-radius:12px;text-align:center;mso-padding-alt:17px 28px;"><a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:17px 28px;border:1px solid #5145e5;border-radius:12px;font-size:16px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;mso-text-raise:1px;">{e['cta']}&nbsp; &#8594;</a></td></tr></table>'''
        fallback = '<p style="margin:24px 0 0;font-size:12px;line-height:19px;color:#646176;">Button not opening? Copy and paste this secure link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color:#4337c9;text-decoration:underline;overflow-wrap:anywhere;word-break:break-all;">{{ .ConfirmationURL }}</a></p>'
        validity = 'This personal link can only be used once. If it has expired, request a new one in NexRide.'
    else:
        action = '''<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;"><tr><td bgcolor="#efedff" style="padding:22px 12px;border:1px solid #dad5ff;border-radius:12px;text-align:center;"><span style="font-family:Consolas,'Courier New',monospace;font-size:38px;line-height:48px;letter-spacing:7px;font-weight:700;color:#28217f;white-space:nowrap;">{{ .Token }}</span></td></tr></table><p style="margin:0 0 28px;text-align:center;font-size:13px;line-height:20px;color:#646176;">Enter this code in NexRide to continue.</p>'''
        fallback = ''
        validity = 'This code is for one-time use. If it has expired, request a new code in NexRide.'
    return f'''<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>{escape(e['subject'])}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>body,table,td,a{{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}table,td{{mso-table-lspace:0pt;mso-table-rspace:0pt;}}table{{border-collapse:collapse;}}img{{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}}a[x-apple-data-detectors]{{color:inherit!important;text-decoration:none!important;}}@media only screen and (max-width:620px){{.outer{{padding:16px 12px!important;}}.pad{{padding-left:24px!important;padding-right:24px!important;}}.hero-title{{font-size:36px!important;line-height:40px!important;}}.action{{width:100%!important;}}.action a{{display:block!important;text-align:center!important;padding-left:16px!important;padding-right:16px!important;}}.fine{{padding-left:20px!important;padding-right:20px!important;}}}}</style></head>
<body style="margin:0;padding:0;width:100%;background-color:#f3f2f8;font-family:Arial,Helvetica,sans-serif;color:#19172a;">
<div style="display:none;font-size:1px;color:#f3f2f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">{escape(e['preheader'])}{'&#8199;&#847; '*20}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f2f8"><tr><td align="center" class="outer" style="padding:40px 20px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
<tr><td class="pad" bgcolor="#28217f" style="padding:30px 40px 26px;border-radius:24px 24px 0 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="44" valign="middle"><img src="{LOGO}" width="38" height="38" alt="NexRide mark" style="display:block;width:38px;height:38px;"></td><td valign="middle" style="font-size:26px;line-height:34px;letter-spacing:-1px;font-weight:800;color:#ffffff;">NexRide<span style="color:#c5f000;">.</span></td></tr></table>
<p style="margin:34px 0 14px;font-size:11px;line-height:16px;letter-spacing:2px;font-weight:700;color:#d0caff;">{e['eyebrow']}</p>
<h1 class="hero-title" style="margin:0;font-size:46px;line-height:50px;letter-spacing:-1.6px;font-weight:800;color:#ffffff;">{e['title']}</h1>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:30px;"><tr><td width="14" height="14" style="font-size:0;line-height:0;border-radius:7px;background-color:#c5f000;">&nbsp;</td><td height="14" style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td height="2" bgcolor="#7168cb" style="font-size:0;line-height:0;">&nbsp;</td></tr></table></td><td width="14" height="14" style="font-size:0;line-height:0;border:2px solid #c5f000;border-radius:9px;">&nbsp;</td></tr></table>
<p style="margin:12px 0 0;font-size:10px;line-height:16px;letter-spacing:1.3px;font-weight:700;color:#dfdbff;">{e['detail']}</p></td></tr>
<tr><td height="5" bgcolor="#c5f000" style="height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="pad" bgcolor="#ffffff" style="padding:34px 40px 32px;border-left:1px solid #e4e2ee;border-right:1px solid #e4e2ee;">
<p style="margin:0 0 24px;font-size:17px;line-height:28px;color:#555367;">{e['intro']}</p>
{email_detail}{action}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="3" bgcolor="#5145e5" style="width:3px;">&nbsp;</td><td bgcolor="#f7f6fc" style="padding:16px 18px;"><p style="margin:0 0 6px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:.5px;color:#28217f;">FOR YOUR SECURITY</p><p style="margin:0;font-size:13px;line-height:21px;color:#555367;">{e['note']}</p></td></tr></table>
<p style="margin:20px 0 0;font-size:12px;line-height:19px;color:#646176;">{validity}</p>{fallback}
</td></tr>
<tr><td class="pad" bgcolor="#efedff" style="padding:22px 40px;border:1px solid #e4e2ee;border-top:0;border-radius:0 0 24px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="middle" style="font-size:15px;line-height:22px;font-weight:800;color:#28217f;">Move with confidence.</td><td align="right" valign="middle" style="font-size:10px;line-height:16px;letter-spacing:1px;font-weight:700;color:#4337c9;">NEXRIDE</td></tr></table></td></tr>
<tr><td class="fine" align="center" style="padding:22px 24px 0;"><p style="margin:0;font-size:11px;line-height:18px;color:#646176;">This is an account email from NexRide.<br>Need to review your account? Open <a href="{SITE}" style="color:#4337c9;text-decoration:underline;">NexRide</a> directly.</p><p style="margin:10px 0 0;font-size:10px;line-height:16px;letter-spacing:1px;color:#646176;">NEXRIDE &middot; YOUR WAY FORWARD</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>'''

def plain(e):
    title = re.sub('<br>', ' ', e['title'])
    body = f"NEXRIDE\n{title}\n\n{e['intro']}\n\n"
    if e['key'] == 'email_change': body += 'New email address: {{ .NewEmail }}\n\n'
    body += (e['cta'] + ':\n{{ .ConfirmationURL }}\n\n') if e['cta'] else 'Verification code: {{ .Token }}\nEnter this code in NexRide to continue.\n\n'
    body += f"FOR YOUR SECURITY\n{e['note']}\n\nThis {'link' if e['cta'] else 'code'} is for one-time use. If it has expired, request a new one in NexRide.\n\nMove with confidence.\nNexRide | {SITE}\nThis is an account email from NexRide.\n"
    return body

def main():
    for directory in ['html','text','previews','previews/images-blocked','assets','screenshots']:
        (ROOT/directory).mkdir(parents=True, exist_ok=True)
    mark = ROOT.parent/'nexride-email-mark.png'
    if mark.exists(): shutil.copyfile(mark, ROOT/'assets/nexride-email-mark.png')
    payload, manifest = {}, []
    for e in EMAILS:
        content = template(e)
        (ROOT/'html'/f"{e['key']}.html").write_text(content, encoding='utf-8')
        (ROOT/'text'/f"{e['key']}.txt").write_text(plain(e), encoding='utf-8')
        payload[f"mailer_subjects_{e['key']}"] = e['subject']
        payload[f"mailer_templates_{e['key']}_content"] = content
        manifest.append({k:e[k] for k in ['key','slug','label','subject','preheader','instruction']})
        sample_link = 'https://eyyvvwecpyctttiueban.supabase.co/auth/v1/verify?token=' + 'sample-not-a-real-token-'*4 + '&type=email&redirect_to=https%3A%2F%2Fubberapp.vercel.app%2Frider%2Fsign-in%3Fconfirmed%3D1'
        preview = content.replace(LOGO, '../assets/nexride-email-mark.png').replace('href="{{ .ConfirmationURL }}"', 'href="#preview-only"').replace('{{ .ConfirmationURL }}', escape(sample_link)).replace('{{ .Token }}', '482619').replace('{{ .NewEmail }}', 'you@example.invalid')
        (ROOT/'previews'/f"{e['key']}.html").write_text(preview, encoding='utf-8')
        blocked = re.sub(r'<img\b[^>]*>', '', preview)
        (ROOT/'previews'/'images-blocked'/f"{e['key']}.html").write_text(blocked, encoding='utf-8')
    (ROOT/'supabase-auth-config.json').write_text(json.dumps(payload,indent=2,ensure_ascii=False),encoding='utf-8')
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    cards = ''.join(f'''<a class="card" href="previews/{e['key']}.html"><small>0{i+1} / ACCOUNT EMAIL</small><h2>{e['label']}</h2><p>{e['subject']}</p><span>Open email preview ↗</span></a>''' for i,e in enumerate(EMAILS))
    (ROOT/'index.html').write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NexRide | Email design collection</title><style>*{{box-sizing:border-box}}body{{margin:0;background:#f3f2f8;color:#19172a;font:16px/1.6 Arial,sans-serif}}header{{background:#28217f;color:white;padding:50px max(24px,calc((100vw - 1100px)/2));border-bottom:6px solid #c5f000}}header b{{font-size:28px}}h1{{font-size:clamp(38px,6vw,64px);line-height:1.08;letter-spacing:-2px;margin:40px 0 18px}}header p{{color:#dfdbff;max-width:620px}}main{{max-width:1148px;margin:auto;padding:32px 24px}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}}.card{{background:white;padding:30px;border:1px solid #e4e2ee;border-radius:18px;text-decoration:none;color:inherit}}.card small{{color:#5145e5;letter-spacing:1px;font-size:10px;font-weight:bold}}.card h2{{font-size:24px;line-height:1.2;letter-spacing:-.7px;margin:24px 0 12px}}.card p{{color:#646176;font-size:14px;min-height:46px}}.card span{{font-size:13px;color:#4337c9;font-weight:bold}}aside{{padding:22px 26px;border-left:4px solid #5145e5;background:#efedff;margin-bottom:28px;font-size:14px}}footer{{padding:30px 0;color:#646176;font-size:12px}}</style><header><b>NexRide<span style="color:#c5f000">.</span></b><h1>Every detail.<br>A better first impression.</h1><p>Six account emails. One confident identity. Violet, indigo and lime, with clear actions and security at the heart.</p></header><main><aside><b>Design previews</b><br>These previews use sample data and inactive verification links. No emails are sent. Production templates preserve Supabase’s verification variables.</aside><div class="grid">{cards}</div><footer>Responsive HTML + plain text · Desktop and mobile previews · NexRide authentication collection</footer></main></html>''',encoding='utf-8')
    print(f'Built {len(EMAILS)} HTML templates, {len(EMAILS)} plain-text versions and {len(EMAILS)} safe previews.')

if __name__ == '__main__': main()
