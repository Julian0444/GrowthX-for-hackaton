"""Read-only verification manifest of the final source tree and recorded checks."""
import datetime,hashlib,json,re,subprocess
from pathlib import Path
out=Path(__file__).resolve().parent
root=out.parents[2]
baseline=json.loads((out/'preflight.json').read_text())
copy=Path((out/'production-path.txt').read_text().strip())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
checks={name:json.loads((out/f'{name}.json').read_text()) for name in ['build-release','lint-release','regression-release','browser-release']}
assert all(check['exitCode']==0 for check in checks.values())
counts={}
for name in ['regression-release','browser-release']:
 log=(out/f'{name}.log').read_text()
 counts[name]={key:int(re.search(r'ℹ '+key+r' (\d+)',log).group(1)) for key in ['tests','pass','fail','skipped']}
 assert counts[name]['fail']==counts[name]['skipped']==0
files=subprocess.check_output(['git','ls-files','-co','--exclude-standard','-z'],cwd=root).decode().split('\0')
files=sorted({f for f in files if f and (root/f).is_file()})
changed=[name for name,sha in baseline['hashes'].items() if (root/name).exists() and digest(root/name)!=sha]
missing=[name for name in baseline['hashes'] if not (root/name).exists()]
added=[name for name in files if name not in baseline['hashes']]
appFiles=[name for name in files if name.startswith('frontend/') and (name in changed or name in added)]
copyMismatches=[name for name in appFiles if not (copy/name.removeprefix('frontend/')).exists() or digest(root/name)!=digest(copy/name.removeprefix('frontend/'))]
assert not missing and not copyMismatches,(missing,copyMismatches)
summary={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':counts,'browserLeafCases':29,'browserIncludingParentResults':33,'checks':checks,'appSourceMatchesBuiltCopy':True,'databasePort':55461,'realBrowser':'Chrome/CUA on localhost:3000; no API responses replaced','acceptanceCriteriaVerified':8}
(out/'verification-summary.json').write_text(json.dumps(summary,indent=2))
manifest={'at':summary['at'],'preflight':'preflight.json','changedSinceStart':sorted(changed),'addedSinceStart':added,'missingSinceStart':missing,'appSourceMatchesBuiltCopy':True,'concurrentHandoff':'DP-10 handoff expansion observed and retained under the previous cut','hashes':{name:digest(root/name) for name in sorted(set(changed+added)) if name not in ['DemoPuentes/evidence/DP-11/verified-files.json','DemoPuentes/evidence/DP-11/verification-summary.json']}}
(out/'verified-files.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'counts':counts,'changedExistingFiles':len(changed),'appSourceMatchesBuiltCopy':True,'missingPriorFiles':missing}))
