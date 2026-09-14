"""Read-only row audit of pre-existing business data; no credentials or raw payloads."""
import collections,datetime,json,subprocess,sys
from pathlib import Path
out=Path(__file__).resolve().parent
names=['profiles','runs','snapshots','snapshot_narratives','decisions','campaign_drafts','sources','claims','claim_revisions','edition_revisions','organizer_revisions','participation_revisions','catalog_loads']
def hashes(table):
 sql=f"select md5(to_jsonb(t)::text) from growthx.{table} t order by 1"
 return subprocess.check_output(['docker','exec','growthx-postgres','psql','-U','growthx','-d','growthx','-At','-c',sql],text=True).splitlines()
current={name:hashes(name) for name in names}
if sys.argv[1]=='before':
 (out/'local-before.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rowHashes':current},indent=2))
 print(json.dumps({name:len(rows) for name,rows in current.items()}))
else:
 previous=json.loads((out/'local-before.json').read_text())['rowHashes']
 report={name:{'before':len(previous[name]),'after':len(current[name]),'previousRowsMissingOrChanged':sum((collections.Counter(previous[name])-collections.Counter(current[name])).values())} for name in names}
 (out/'local-preservation.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tables':report},indent=2));print(json.dumps(report))
 if any(r['previousRowsMissingOrChanged'] for r in report.values()):sys.exit(1)
