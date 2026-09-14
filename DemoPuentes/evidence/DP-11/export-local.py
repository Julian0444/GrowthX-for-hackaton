"""Read only the DP-11 real runs, decision revisions and immutable bundle metadata."""
import datetime,hashlib,json,subprocess
from pathlib import Path
out=Path(__file__).resolve().parent
def sql(query):
 return json.loads(subprocess.check_output(['docker','exec','growthx-postgres','psql','-U','growthx','-d','growthx','-At','-c',query],text=True))
run_ids=['4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0','683695df-b761-432c-9839-fb2a11f6a8f8','ea8b3034-a82e-4342-a89e-e1c6d1f0f0da']
runs=sql("select coalesce(json_agg(json_build_object('id',id,'state',state,'result',result)), '[]') from growthx.runs where id in ("+','.join("'"+i+"'" for i in run_ids)+")")
decisions=sql("select coalesce(json_agg(json_build_object('identity',decision_id,'payload',payload) order by decided_at), '[]') from growthx.decisions where snapshot_id in (select id from growthx.snapshots where run_id in ('4a4ecf39-ffe5-4112-af4a-ffa6f5a916b0','683695df-b761-432c-9839-fb2a11f6a8f8'))")
campaigns=sql("select coalesce(json_agg(json_build_object('decisionRevisionId',decision_revision_id,'payload',payload)), '[]') from growthx.campaign_drafts where decision_id='af10470d-6902-4faf-a87a-75aa511265c4'")
report={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runs':runs,'decisions':decisions,'campaigns':campaigns}
(out/'local-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
summary=[]
for run in runs:
 bundle=run.get('result',{}).get('bundle')
 if bundle:summary.append({'runId':run['id'],'snapshotId':bundle['snapshot']['id'],'bundleSha256':hashlib.sha256(json.dumps(bundle,sort_keys=True).encode()).hexdigest(),'editionRevisionIds':bundle['snapshot']['editionRevisionIds'],'sourceIds':[s['id'] for s in bundle['sources']]})
(out/'local-snapshots.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({'runStates':[{ 'id':r['id'],'state':r['state']} for r in runs],'decisionRevisions':len(decisions),'campaignRevisions':len(campaigns)}))
