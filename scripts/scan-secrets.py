"""Read-only scan. Never print credential values. Public client keys are classified separately."""
from pathlib import Path
import re,json,subprocess,base64,sys
roots=[Path(x) for x in sys.argv[1:]] or [Path('.')]
secret_patterns={'private_key':r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----','supabase_secret':r'sb_secret_[A-Za-z0-9_-]{16,}','github_token':r'gh[pousr]_[A-Za-z0-9]{25,}','aws_access_key':r'AKIA[A-Z0-9]{16}','literal_password':r'''(?im)(?:password|smtp_pass|api_secret|hmac_key)\s*[:=]\s*["']([^"'\n]{10,})["']'''}
findings=[];public=[];files=0
for root in roots:
 try: paths=subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines()
 except: paths=[str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()]
 for name in paths:
  if any(x in Path(name).parts for x in ['node_modules','.git','build','.gradle']):continue
  p=root/name
  if not p.is_file() or p.stat().st_size>3000000:continue
  try:s=p.read_text()
  except:continue
  files+=1
  for kind,pat in secret_patterns.items():
   for m in re.finditer(pat,s):
    if kind=='literal_password' and any(v in m.group(0) for v in ['Deno.env','getProperty','process.env','example','getenv','crypto.']):continue
    findings.append({'repo':root.name,'path':name,'kind':kind,'classification':'test_fixture' if ('_test.' in name or '/test/' in name or name.startswith('tests/')) else 'requires_review','line':s.count('\n',0,m.start())+1})
  for token in set(re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',s)):
   try:claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
   except:continue
   row={'repo':root.name,'path':name,'kind':'jwt_'+str(claims.get('role','unknown'))}
   (public if claims.get('role')=='anon' else findings).append(row)
print(json.dumps({'files_scanned':files,'findings':findings,'public_client_jwts':public},indent=2))
