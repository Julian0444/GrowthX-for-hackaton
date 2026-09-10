import os, sys, subprocess, time, json
from pathlib import Path
root=Path('/tmp/growthx-review-20260910')
wd=root/'verification-workspace'
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG','SHELL'] if k in os.environ}
env.update({
'NEXT_TELEMETRY_DISABLED':'1',
'GROWTHX_ADMIN_DATABASE_URL':'postgres://growthx:growthx@127.0.0.1:55439/growthx',
'GROWTHX_DATABASE_URL':'postgres://growthx_app:growthx_app_dev@127.0.0.1:55439/growthx',
'GROWTHX_WORKER_DATABASE_URL':'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55439/growthx',
'GROWTHX_QUEUE_DATABASE_URL':'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55439/growthx',
'GROWTHX_E2E_SCREENSHOT_DIR':str(root/'screenshots'),
})
name=sys.argv[1]
command=sys.argv[2:]
started=time.time()
with (root/(name+'.log')).open('w') as f:
    result=subprocess.run(command,cwd=wd,env=env,stdout=f,stderr=subprocess.STDOUT)
meta={'name':name,'command':command,'exit_code':result.returncode,'duration_s':round(time.time()-started,2),'started_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(started))}
(root/(name+'.json')).write_text(json.dumps(meta,indent=2))
print(json.dumps(meta))
print('Log:',root/(name+'.log'))
sys.exit(result.returncode)
