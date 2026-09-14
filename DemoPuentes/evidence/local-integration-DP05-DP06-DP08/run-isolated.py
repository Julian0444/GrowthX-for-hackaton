"""Run checks against a source-identical copy and port 55449, without provider keys."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
if sys.argv[1] == 'prepare':
    work = Path(tempfile.mkdtemp(prefix='growthx-local-integration-'))
    copy = work / 'frontend'
    shutil.copytree(ROOT / 'frontend', copy, ignore=shutil.ignore_patterns('node_modules', '.next', '.env*', '*.tsbuildinfo'))
    subprocess.run(['cp', '-cR', str(ROOT / 'frontend/node_modules'), str(copy / 'node_modules')], check=True)
    for ticket in ['DP-05', 'DP-06', 'DP-08']:
        (work / 'DemoPuentes/evidence' / ticket).mkdir(parents=True)
    (OUT / 'production-path.txt').write_text(str(copy) + '\n')
    print(copy)
    sys.exit(0)

copy = Path((OUT / 'production-path.txt').read_text().strip())
env = {k: os.environ[k] for k in ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SHELL'] if k in os.environ}
env['PATH'] = '/opt/homebrew/opt/node@25/bin:' + env.get('PATH', '')
env.update({
    'NEXT_TELEMETRY_DISABLED': '1',
    'GROWTHX_ADMIN_DATABASE_URL': 'postgres://growthx:growthx@127.0.0.1:55449/growthx',
    'GROWTHX_DATABASE_URL': 'postgres://growthx_app:growthx_app_dev@127.0.0.1:55449/growthx',
    'GROWTHX_WORKER_DATABASE_URL': 'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55449/growthx',
    'GROWTHX_QUEUE_DATABASE_URL': 'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55449/growthx',
    'GROWTHX_E2E_SCREENSHOT_DIR': str(OUT / 'controlled-screenshots'),
    'DP05_PRODUCTION_DIR': str(copy),
    'DP06_PRODUCTION_DIR': str(copy),
})
name = sys.argv[1]
command = sys.argv[2:]
start = time.monotonic()
with (OUT / f'{name}.log').open('w') as log:
    result = subprocess.run(command, cwd=copy, env=env, stdout=log, stderr=subprocess.STDOUT)
report = {'command': command, 'cwd': str(copy), 'databasePort': 55449, 'providerKeysLoaded': False,
          'exitCode': result.returncode, 'durationSeconds': round(time.monotonic() - start, 2)}
(OUT / f'{name}.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
print('\n'.join((OUT / f'{name}.log').read_text().splitlines()[-20:]))
sys.exit(result.returncode)
