import os, subprocess, sys, time, json
from pathlib import Path
repo=Path(__file__).resolve().parents[3]
name=sys.argv[1]
cwd=Path(os.environ.get('DP02_CHECK_CWD', str(repo/'frontend')))
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG','SHELL'] if k in os.environ}
env.update({
'NEXT_TELEMETRY_DISABLED':'1',
'GROWTHX_ADMIN_DATABASE_URL':'postgres://growthx:growthx@127.0.0.1:55442/growthx',
'GROWTHX_DATABASE_URL':'postgres://growthx_app:growthx_app_dev@127.0.0.1:55442/growthx',
'GROWTHX_WORKER_DATABASE_URL':'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55442/growthx',
'GROWTHX_QUEUE_DATABASE_URL':'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55442/growthx',
'GROWTHX_E2E_SCREENSHOT_DIR':str(repo/'DemoPuentes/evidence/DP-02/screenshots'),
})
start=time.monotonic()
log=repo/'DemoPuentes/evidence/DP-02'/f'{name}.log'
with log.open('w') as output: result=subprocess.run(sys.argv[2:],cwd=cwd,env=env,stdout=output,stderr=subprocess.STDOUT)
meta={'command':sys.argv[2:],'cwd':str(cwd),'exit_code':result.returncode,'duration_seconds':round(time.monotonic()-start,2),'database':'isolated PostgreSQL port 55442'}
log.with_suffix('.json').write_text(json.dumps(meta,indent=2))
print(json.dumps(meta))
print('\n'.join(log.read_text().splitlines()[-20:]))
sys.exit(result.returncode)
