// Audit helper: compares saved pre-change TypeScript literals to reviewed English literals.
const ts = require(process.cwd() + '/frontend/node_modules/typescript');
const fs = require('fs'); const path = require('path');
function literals(file) {
 const out=[]; const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n){
  if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) out.push({kind:'literal',parts:[n.text]});
  if(ts.isTemplateExpression(n)) out.push({kind:'template',parts:[n.head.text,...n.templateSpans.map(s=>s.literal.text)]});
  ts.forEachChild(n,visit);
 } visit(ast); return out;
}
const before='/tmp/dp12-english-before'; const records=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const f=path.join(dir,name);if(fs.statSync(f).isDirectory())walk(f);else if(/\.tsx?$/.test(f)){const relative=path.relative(before,f);if(fs.existsSync(relative)) records.push({file:relative,before:literals(f),after:literals(relative)});}}}walk(before);
fs.writeFileSync('DemoPuentes/evidence/DP-12/literal-diff.json',JSON.stringify(records,null,2));
