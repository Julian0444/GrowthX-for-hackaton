import { legacyEnglishCatalog } from './english-catalog.ts';

// Presentation-only compatibility for system explanations saved before English
// became the interface language. Never apply to buyer input or source excerpts.
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rules = legacyEnglishCatalog.map(rule => ({
  ...rule,
  pattern: new RegExp(`^${rule.from.map(escape).join('([\\s\\S]*?)')}$`),
})).sort((a,b) => b.from.join('').length-a.from.join('').length);
const exact = new Map(rules.filter(r => r.from.length===1).map(r=>[r.from[0],r.to[0]]));

export function englishSystemText(text: string): string {
  return translate(text,0);
}
function translate(text:string,depth:number):string {
  if(depth>5)return text;
  const literal=exact.get(text);
  if(literal!==undefined)return literal;
  for(const rule of rules){
    if(rule.from.length===1)continue;
    const match=rule.pattern.exec(text);
    if(match)return rule.to.reduce((result,part,index)=>result+part+(index<rule.to.length-1?translate(match[index+1],depth+1):''),'');
  }
  // Cost readings join several independent system explanations. Translate only
  // complete known sentences/clauses, retaining unknown content verbatim.
  let result=text;
  for(const rule of rules){
    if(rule.from.length===1 && rule.from[0].length>=24)result=result.split(rule.from[0]).join(rule.to[0]);
    else if(rule.from.length>1 && rule.from[0].length>=12 && /[.!?]$/.test(rule.from.at(-1)!)){
      const pattern=new RegExp(rule.from.map(escape).join('([\\s\\S]*?)'),'g');
      result=result.replace(pattern,(...args:string[])=>rule.to.reduce((out,part,index)=>out+part+(index<rule.to.length-1?translate(args[index+1],depth+1):''),''));
    }
  }
  return result;
}
