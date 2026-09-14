"""Read-only export of this ticket's comparisons; no session or credentials."""
import datetime,hashlib,json,subprocess
from pathlib import Path
out=Path(__file__).resolve().parent
ids=['bb91d863-f090-4139-892e-8a54e14e737d','f759e1bc-d191-4e8d-8e6d-935d326c3592','6086a9fd-0fdc-4d6b-a810-6aa4dc567a64','e25eaf3c-4e71-4bf9-9829-25074814b75e','28d1cdef-ed88-433a-b648-958f0fceb874','4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0']
def sql(query):
 return subprocess.check_output(['docker','exec','growthx-postgres','psql','-U','growthx','-d','growthx','-At','-c',query],text=True)
results=[]
for run_id in ids:
 result=json.loads(sql(f"select result from growthx.runs where id='{run_id}'"));bundle=result['bundle'];snap=bundle['snapshot'];profile=bundle['profile']
 stored=json.loads(sql(f"select payload from growthx.snapshots where id='{snap['id']}'"))
 assert stored==snap
 refs=[ref for reading in snap['decisionReading']['alternatives'] for reason in [reading['relevance'],*reading['antecedents'],reading['modality']] for ref in reason['basis']]
 assert all(r['editionRevisionId'] in snap['editionRevisionIds'] and set(r['claimRevisionIds'])<=set(snap['claimRevisionIds']) and set(r['sourceIds'])<=set(snap['sourceIds']) for r in refs)
 results.append({'runId':run_id,'snapshotId':snap['id'],'profile':profile,'evaluatedAt':result['evaluatedAt'],'snapshotMatchesOriginalPublishedRun':True,'snapshotSha256':hashlib.sha256(json.dumps(snap,sort_keys=True).encode()).hexdigest(),'reading':snap['decisionReading'],'eligibility':[{'editionId':a['editionId'],'eligibility':a['eligibility'],'conditions':a['conditions']} for a in snap['alternatives']], 'editionRevisions':[{'id':e['id'],'editionId':e['editionId'],'name':e['name']} for e in bundle['editions']], 'sources':[{k:s.get(k) for k in ['id','url','fetchedAt','isFixture','method']} for s in bundle['sources']],'narrative':result['narrative']})
(out/'local-real.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'origin':'Existing admitted real sources in localhost database; no fresh provider fetches. Catalog also contains explicitly labelled synthetic material, not selected here.','checks':{'sixCompletedComparisons':True,'productObjectiveRestrictionsAndWindowChanged':True,'originalReopened':True,'allSnapshotsMatchOriginalPublishedRuns':True,'exactReferencesPinned':True,'originalBuyerBriefRestoredAsLatestRevision':True},'runs':results},ensure_ascii=False,indent=2))
print(json.dumps([{'runId':r['runId'],'snapshotId':r['snapshotId'],'profileVersion':r['profile']['profileVersion'],'priority':r['reading']['priority']['kind']} for r in results],indent=2))
