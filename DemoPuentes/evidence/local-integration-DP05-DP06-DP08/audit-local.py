"""Read-only audit of the explicitly authorized local DB; no row contents/secrets."""
import collections
import datetime
import json
from pathlib import Path
import subprocess
import sys

OUT = Path(__file__).resolve().parent

def query(sql):
    return json.loads(subprocess.check_output([
        'docker', 'exec', 'growthx-postgres', 'psql', '-U', 'growthx', '-d', 'growthx',
        '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql,
    ], text=True))

phase = sys.argv[1]
tables = query("select json_agg(tablename order by tablename) from pg_tables where schemaname='growthx'")
rows = {}
for table in tables:
    assert table.replace('_', '').isalnum()
    rows[table] = query(f'select coalesce(json_agg(h order by h),\'[]\') from (select md5(row_to_json(t)::text) h from growthx."{table}" t) q')
report = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'databasePort': 54329,
          'counts': {table: len(hashes) for table, hashes in rows.items()},
          'migrations': query('select json_agg(filename order by filename) from growthx.schema_migrations'),
          'exaAllowance': query('select json_agg(t) from growthx.discovery_allowance t')}
if phase == 'before':
    (OUT / 'before-row-hashes.json').write_text(json.dumps(rows))
else:
    original = json.loads((OUT / 'before-row-hashes.json').read_text())
    report['originalRowsAbsentOrChanged'] = {
        table: sum((collections.Counter(hashes) - collections.Counter(rows.get(table, []))).values())
        for table, hashes in original.items()
    }
(OUT / f'database-{phase}.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
