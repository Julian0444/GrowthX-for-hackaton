import os, subprocess, sys, time, json
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
name=sys.argv[1]
cwd=Path(os.environ.get('DP07_CHECK_CWD', '/tmp/growthx-dp07-production'))
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG','SHELL'] if k in os.environ}
env.update({
'NEXT_TELEMETRY_DISABLED':'1',
'GROWTHX_ADMIN_DATABASE_URL':'postgres://growthx:growthx@127.0.0.1:55447/growthx',
'GROWTHX_DATABASE_URL':'postgres://growthx_app:growthx_app_dev@127.0.0.1:55447/growthx',
'GROWTHX_WORKER_DATABASE_URL':'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55447/growthx',
'GROWTHX_QUEUE_DATABASE_URL':'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55447/growthx',
'GROWTHX_E2E_SCREENSHOT_DIR':str(repo/'DemoPuentes/evidence/DP-07/screenshots'),
})
env['PATH']='/opt/homebrew/opt/node@25/bin:'+env.get('PATH','')
env['DP05_PRODUCTION_DIR'] = str(cwd)
env['DP06_PRODUCTION_DIR'] = str(cwd)
for key in ['DP07_REAL_SMOKE','DP07_PRODUCTION_DIR']:
 if key in os.environ: env[key]=os.environ[key]
start=time.monotonic()
log=repo/'DemoPuentes/evidence/DP-07'/f'{name}.log'
with log.open('w') as output: result=subprocess.run(sys.argv[2:],cwd=cwd,env=env,stdout=output,stderr=subprocess.STDOUT)
meta={'command':sys.argv[2:],'cwd':str(cwd),'exit_code':result.returncode,'duration_seconds':round(time.monotonic()-start,2),'database':'isolated PostgreSQL port 55447'}
log.with_suffix('.json').write_text(json.dumps(meta,indent=2))
print(json.dumps(meta))
print('\n'.join(log.read_text().splitlines()[-20:]))
sys.exit(result.returncode)
