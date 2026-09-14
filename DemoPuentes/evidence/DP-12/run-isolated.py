"""Source-identical copy and isolated PostgreSQL 55472; never load provider keys."""
import hashlib, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path
OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
if sys.argv[1] in ['prepare','prepare-webpack']:
    work=Path(tempfile.mkdtemp(prefix='growthx-dp12-'));copy=work/'frontend'
    shutil.copytree(ROOT/'frontend',copy,ignore=shutil.ignore_patterns('node_modules','.next*','.env*','*.tsbuildinfo'))
    subprocess.run(['cp','-cR',str(ROOT/'frontend/node_modules'),str(copy/'node_modules')],check=True)
    for ticket in ['DP-05','DP-06','DP-07','DP-08','DP-09','DP-11','DP-12']:(work/'DemoPuentes/evidence'/ticket).mkdir(parents=True,exist_ok=True)
    (OUT/('webpack-path.txt' if sys.argv[1]=='prepare-webpack' else 'production-path.txt')).write_text(str(copy)+'\n');print(copy);sys.exit(0)
copy=Path((OUT/('webpack-path.txt' if 'webpack' in sys.argv[1] else 'production-path.txt')).read_text().strip())
if sys.argv[1]=='sync':
    for name in ['app','components','lib','tests','scripts','worker']:
        shutil.copytree(ROOT/'frontend'/name,copy/name,dirs_exist_ok=True)
    shutil.copy2(ROOT/'frontend/package.json',copy/'package.json')
    print('Source synchronized to owned build directory');sys.exit(0)
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG','SHELL'] if k in os.environ}
env['PATH']='/opt/homebrew/opt/node@25/bin:'+env.get('PATH','')
env.update({'NEXT_TELEMETRY_DISABLED':'1','GROWTHX_ADMIN_DATABASE_URL':'postgres://growthx:growthx@127.0.0.1:55472/growthx','GROWTHX_DATABASE_URL':'postgres://growthx_app:growthx_app_dev@127.0.0.1:55472/growthx','GROWTHX_WORKER_DATABASE_URL':'postgres://growthx_worker:growthx_worker_dev@127.0.0.1:55472/growthx','GROWTHX_QUEUE_DATABASE_URL':'postgres://growthx_queue:growthx_queue_dev@127.0.0.1:55472/growthx','GROWTHX_E2E_SCREENSHOT_DIR':str(OUT/'screenshots'),'DP04_PRODUCTION_DIR':str(copy),'DP05_PRODUCTION_DIR':str(copy),'DP06_PRODUCTION_DIR':str(copy),'DP09_EVIDENCE_DIR':str(OUT),'DP10_EVIDENCE_DIR':str(OUT),'DP11_EVIDENCE_DIR':str(OUT)})
name=sys.argv[1];command=sys.argv[2:];start=time.monotonic()
if name.startswith('real'):
    for key in ['GROWTHX_ADMIN_DATABASE_URL','GROWTHX_DATABASE_URL','GROWTHX_WORKER_DATABASE_URL','GROWTHX_QUEUE_DATABASE_URL']:env[key]=env[key].rsplit('/',1)[0]+'/growthx_dp12_real'

with (OUT/f'{name}.log').open('w') as log: result=subprocess.run(command,cwd=copy,env=env,stdout=log,stderr=subprocess.STDOUT)
report={'command':command,'cwd':str(copy),'databasePort':55472,'databaseName':'growthx_dp12_real' if name.startswith('real') else 'growthx','providerKeysLoaded':False,'exitCode':result.returncode,'durationSeconds':round(time.monotonic()-start,2)}
(OUT/f'{name}.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));print('\n'.join((OUT/f'{name}.log').read_text().splitlines()[-25:]));sys.exit(result.returncode)
