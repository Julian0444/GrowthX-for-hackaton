import assert from 'node:assert/strict';
import {test} from 'node:test';
import {englishSystemText} from '../../lib/research/english.ts';

test('DP12 legacy excluded dates render in English without changing persisted text',()=>{
 const saved={reasons:['Fecha vencida: Declared start (2026-09-01T15:30:00.000-07:00) is before the evaluation instant.', 'La fecha declarada (2026-09-01) es anterior a la ventana del perfil (2026-09-11).']};
 const before=JSON.stringify(saved);
 assert.equal(englishSystemText(saved.reasons[0]),'Past event: Declared start (2026-09-01T15:30:00.000-07:00) is before the evaluation instant.');
 assert.equal(englishSystemText(saved.reasons[1]),'The declared date (2026-09-01) is before the brief window (2026-09-11).');
 assert.equal(JSON.stringify(saved),before);
});
test('DP12 known historical conditions preserve amounts, identifiers and unresolved status',()=>{
 const text='Costo incompleto: partida «sponsorship» pending; Edition-specific quote unknown.; no cuenta como cero. — Qué respuesta la resolvería: ¿Cuál es el costo completo, la moneda y el paquete a contratar?';
 const rendered=englishSystemText(text);
 assert.match(rendered,/Incomplete cost/);assert.match(rendered,/sponsorship.*pending/);assert.match(rendered,/does not count as zero/);assert.match(rendered,/Answer needed/);assert.doesNotMatch(rendered,/Costo|Qué respuesta|Cuál/);
 assert.equal(englishSystemText('Un texto original de una fuente: audiencia por confirmar.'),'Un texto original de una fuente: audiencia por confirmar.');
 assert.equal(englishSystemText('USD 3000 + USD 3000 > USD 5000'),'USD 3000 + USD 3000 > USD 5000');
});
test('DP12 missing venue display retains uncertainty and does not invent coordinates',()=>{
 assert.equal(englishSystemText('Solo ciudad o sede sin dirección pública; sin punto de venue.'),'City or venue name only, without a public address; no venue marker.');
 assert.equal(englishSystemText('Dirección oculta; no se reconstruye la sede.'),'Address withheld; venue is not reconstructed.');
 const source='Monitoring, auditing, and recovery patterns for long-running agents';
 assert.equal(englishSystemText(source),source);
});
