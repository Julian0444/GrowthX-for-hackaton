"""Create a disposable source/build copy; never load .env or alter shared services."""
import json, pathlib, shutil, subprocess, tempfile
repo = pathlib.Path(__file__).resolve().parents[3]
evidence = pathlib.Path(__file__).resolve().parent
copy = pathlib.Path(tempfile.mkdtemp(prefix='growthx-dp08-production-'))
shutil.copytree(repo/'frontend', copy, dirs_exist_ok=True,
                ignore=shutil.ignore_patterns('node_modules', '.next', '.env*', 'tsconfig.tsbuildinfo'))
subprocess.run(['cp', '-cR', str(repo/'frontend/node_modules'), str(copy/'node_modules')], check=True)
adaptations = []
for relative, old, new, note in [
    ('tests/integration/relationships.test.ts', "includes(':55446/')", "includes(':55448/')", 'DP06 test DB guard redirected only in disposable copy'),
    ('tests/e2e/relationships.spec.ts', '/partial sample of published projects.*never a count or percentage of attendees/s', '/partial sample of published projects[\\s\\S]*never a count or percentage of attendees/', 'Equivalent test regex for current TS target; shared DP06 file preserved'),
]:
    target = copy/relative
    if target.exists() and old in target.read_text():
        target.write_text(target.read_text().replace(old, new))
        adaptations.append({'path': relative, 'change': note})
(evidence/'copy-adaptations.json').write_text(json.dumps(adaptations, indent=2)+'\n')
(evidence/'production-path.txt').write_text(str(copy)+'\n')
print(copy)
