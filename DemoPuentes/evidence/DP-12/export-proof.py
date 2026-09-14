"""Read-only proof of the demo snapshot and preservation; no session tokens."""
from pathlib import Path
import subprocess,json,datetime,hashlib
out=Path(__file__).resolve().parent
run='fe244e95-4e5c-4f34-9c0c-a974e6667029'
def query(sql):return json.loads(subprocess.check_output(['docker','exec','growthx-postgres','psql','-U','growthx','-d','growthx','-At','-c',sql],text=True))
r=query(f"select json_build_object('id',id,'state',state,'createdAt',created_at,'result',result) from growthx.runs where id='{run}'")
b=r['result']['bundle'];snapshot=b['snapshot']
proof={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':run,'createdAt':r['createdAt'],'state':r['state'],'snapshotId':snapshot['id'],'profile':b['profile'],'bundleSha256':hashlib.sha256(json.dumps(b,sort_keys=True).encode()).hexdigest(),'editionRevisionIds':snapshot['editionRevisionIds'],'editions':[{'id':e['id'],'editionId':e['editionId'],'name':e['name'],'url':e['canonicalUrl'],'location':e.get('publicLocation'),'coordinates':e.get('coordinates')} for e in b['editions']],'sources':[{'id':s['id'],'url':s.get('url'),'fetchedAt':s.get('fetchedAt')} for s in b['sources']],'reading':snapshot.get('decisionReading'),'narrative':r['result'].get('narrative')}
proof['decisions']=query(f"select json_agg(payload) from growthx.decisions where snapshot_id='{snapshot['id']}'")
(out/'local-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
print(json.dumps({'runId':run,'snapshot':snapshot['id'],'alternatives':len(snapshot['alternatives']),'sources':len(b['sources']),'decisions':len(proof['decisions'] or []),'narrativeStatus':proof['narrative'].get('status') if proof['narrative'] else None,'narrativeMotive':proof['narrative'].get('motive') if proof['narrative'] else None}))
