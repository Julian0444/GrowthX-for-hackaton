import json,difflib,re
from pathlib import Path
rows=json.loads(Path('DemoPuentes/evidence/DP-12/literal-diff.json').read_text()); rules=[]; ambiguous=[]
for row in rows:
 a,b=row['before'],row['after']; sa=[json.dumps(x) for x in a];sb=[json.dumps(x) for x in b]
 for tag,i,j,k,l in difflib.SequenceMatcher(None,sa,sb,autojunk=False).get_opcodes():
  if tag!='replace':continue
  if j-i!=l-k:
   ambiguous.append({'file':row['file'],'before':a[i:j],'after':b[k:l]});continue
  for x,y in zip(a[i:j],b[k:l]):
   if x['kind']==y['kind'] and len(x['parts'])==len(y['parts']) and x!=y:
    rules.append({'from':x['parts'],'to':y['parts']})
rules.extend([{'from':['',' (alcance ',')'],'to':['',' (scope ',')']},{'from':['pendiente',''],'to':['pending','']}])
unique={json.dumps(x['from']):x for x in rules}
Path('frontend/lib/research/english-catalog.ts').write_text('// Known legacy system templates, translated for display only. Original records stay unchanged.\nexport const legacyEnglishCatalog: {from: string[]; to: string[]}[] = '+json.dumps(list(unique.values()),ensure_ascii=False,indent=2)+';\n')
Path('DemoPuentes/evidence/DP-12/catalog-unpaired.json').write_text(json.dumps(ambiguous,ensure_ascii=False,indent=2));print({'rules':len(unique),'unpairedGroups':len(ambiguous)})
