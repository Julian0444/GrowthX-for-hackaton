import datetime,hashlib,json
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
isolated=Path('/tmp/growthx-dp07-production')
paths='''lib/contracts/comparison.ts
lib/contracts/evaluation.ts
lib/contracts/evaluation-validation.ts
lib/server/evaluations/decision-reading.ts
lib/server/evaluations/compare.ts
lib/server/evaluations/eligibility.ts
lib/server/evaluations/model-adapter.ts
lib/server/evaluations/snapshot-store.ts
lib/server/evaluations/service.ts
lib/server/evaluations/wire.ts
lib/api/atlas-client.ts
lib/api/opportunity-adapter.ts
components/research-dashboard/comparison-panel.tsx
components/research-dashboard/comparison-reading.tsx
components/research-dashboard/comparison-reading.css
components/research-dashboard/comparison-brief-editor.tsx
components/research-dashboard/comparison-differences.tsx
components/research-dashboard/research-dashboard.tsx
tests/fixtures/comparison.ts
tests/fixtures/sf-map.ts
tests/acceptance/explicable-comparison.test.ts
tests/integration/explicable-comparison.test.ts
tests/integration/evaluation-snapshot.test.ts
tests/e2e/explicable-comparison.spec.ts
tests/e2e/sf-street-map.spec.ts
package.json'''.splitlines()
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
files={str(Path('frontend')/p):{'sha256':sha(repo/'frontend'/p),'sameAsIsolatedVerification':sha(repo/'frontend'/p)==sha(isolated/p)} for p in paths}
before=json.loads((repo/'DemoPuentes/evidence/DP-07/preflight.json').read_text())['hashes']
shared={p:{'sha256':sha(repo/p),'unchangedSincePreflight':sha(repo/p)==before[p]} for p in ['DemoPuentes/PuentesHandoff.md','DemoPuentes/implementation-plan.md']}
result={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'note':'Touched DP-07 paths; shared files also contain pre-existing/concurrent work. Hashes identify the tested cut, not attribution of their complete git diff.','files':files,'sharedDocuments':shared}
(repo/'DemoPuentes/evidence/DP-07/verified-files.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'files':len(files),'sameAsIsolatedVerification':all(f['sameAsIsolatedVerification'] for f in files.values()),'sharedDocumentsUnchanged':all(f['unchangedSincePreflight'] for f in shared.values())}))
assert all(f['sameAsIsolatedVerification'] for f in files.values())
assert all(f['unchangedSincePreflight'] for f in shared.values())
