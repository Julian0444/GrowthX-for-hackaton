from pathlib import Path
import subprocess, sys
# The concurrent DP-08 integration test explicitly refuses any DB except its
# owner's cluster. Do not redirect that test to shared/foreign services.
excluded = {'tests/integration/location-resolution.test.ts'}
files = sorted(str(p) for p in Path('tests').rglob('*.test.ts') if str(p) not in excluded)
print('DP-06 regression scope:',len(files),'files. Excluded concurrent DP-08 owned-DB test:',sorted(excluded),flush=True)
sys.exit(subprocess.run(['node','--test',*files]).returncode)
