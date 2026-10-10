"""Validate the auth contract and email structure without delivering email."""
from html.parser import HTMLParser
from pathlib import Path
import json, re
from build import EMAILS, ROOT, SITE, LOGO

class Email(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.images=[]; self.tables=[]; self.tags=[]
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs); self.tags.append(tag)
        if tag=='a': self.links.append(attrs.get('href',''))
        if tag=='img': self.images.append(attrs)
        if tag=='table': self.tables.append(attrs)

def contrast(a,b):
    def lum(h):
        values=[int(h[i:i+2],16)/255 for i in (1,3,5)]
        values=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
        return sum(v*c for v,c in zip(values,[.2126,.7152,.0722]))
    hi,lo=sorted([lum(a),lum(b)],reverse=True)
    return round((hi+.05)/(lo+.05),2)

report={'templates':[], 'contrast':{}, 'inbox_delivery_tested':False,
        'native_email_client_rendering_tested':False}
payload=json.loads((ROOT/'supabase-auth-config.json').read_text(encoding='utf-8'))
for e in EMAILS:
    content=(ROOT/'html'/f"{e['key']}.html").read_text(encoding='utf-8')
    text=(ROOT/'text'/f"{e['key']}.txt").read_text(encoding='utf-8')
    parser=Email(); parser.feed(content)
    assert not set(parser.tags)&{'script','iframe','form','video','svg'}, e['key']
    assert all(t.get('role')=='presentation' for t in parser.tables), e['key']
    assert all(i.get('src')==LOGO and i.get('alt') and i.get('width') and i.get('height') for i in parser.images)
    assert set(parser.links)<= {SITE,'{{ .ConfirmationURL }}'}
    assert 'localhost' not in content and '127.0.0.1' not in content
    assert len(content.encode('utf-8'))<95000
    assert e['preheader'] in content and '<h1 ' in content
    assert payload[f"mailer_subjects_{e['key']}"]==e['subject']
    assert payload[f"mailer_templates_{e['key']}_content"]==content
    expected = {'Token'} if e['key']=='reauthentication' else {'ConfirmationURL'}
    if e['key']=='email_change': expected.add('NewEmail')
    assert set(re.findall(r'{{\s*\.(\w+)\s*}}',content))==expected
    assert set(re.findall(r'{{\s*\.(\w+)\s*}}',text))==expected
    assert ('{{ .ConfirmationURL }}' in parser.links)==(e['key']!='reauthentication')
    report['templates'].append({'key':e['key'],'bytes':len(content.encode()),'variables':sorted(expected),'status':'passed'})
for foreground,background in [('#ffffff','#5145e5'),('#ffffff','#28217f'),('#555367','#ffffff'),('#555367','#f7f6fc'),('#646176','#f3f2f8'),('#4337c9','#ffffff'),('#d0caff','#28217f'),('#28217f','#efedff')]:
    ratio=contrast(foreground,background)
    assert ratio>=4.5,(foreground,background,ratio)
    report['contrast'][foreground+' on '+background]=ratio
(ROOT/'verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASS: all six auth contracts, token-bearing links, plain-text variants, HTML structures, size budgets and text contrast checks.')
