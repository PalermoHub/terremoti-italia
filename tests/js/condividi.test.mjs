import test from 'node:test';
import assert from 'node:assert/strict';
import { codificaStato, decodificaStato } from '../../js/core/condividi-stato.js';
import { FILTRO_INIZIALE } from '../../js/layers/scheda-terremoti.js';

test('stato → query → stato: strati, lingua, tema e filtri tornano uguali', () => {
  const f = { ...FILTRO_INIZIALE, giorni: 30, magMin: 3, magMax: 6, profMin: 10, profMax: 30, classi: new Set([2, 3]), finestra: [2, 9] };
  const q = codificaStato({ strati: ['terremoti', 'faglie'], filtro: f, tema: 'scuro', lingua: 'en' }).toString();
  const s = decodificaStato(q);
  assert.deepEqual(s.strati, ['terremoti', 'faglie']);
  assert.equal(s.lingua, 'en');
  assert.equal(s.tema, 'scuro');
  assert.deepEqual(s.filtro, { giorni: 30, magMin: 3, magMax: 6, profMin: 10, profMax: 30, classi: new Set([2, 3]), finestra: [2, 9] });
});

test('filtri iniziali: nessun parametro di filtro, strati vuoti = tutti spenti', () => {
  const p = codificaStato({ strati: [], filtro: { ...FILTRO_INIZIALE }, tema: 'chiaro', lingua: 'it' });
  assert.deepEqual([...p.keys()].sort(), ['lng', 'strati', 'tema']);
  assert.deepEqual(decodificaStato(p.toString()).strati, []);
});

test('valori non validi sono ignorati', () => {
  const s = decodificaStato('lng=fr&tema=rosa&gg=abc&prof=boh&cl=9.x&fin=1');
  assert.deepEqual(s, { opacita: null, storico: null, confronto: null, area: null, shakemap: null, strati: null, lingua: null, tema: null, filtro: null });
});

test('opacità, storico, confronto e area fanno il giro', () => {
  const confronto = { a: { da: 1, a: 2 }, b: { da: 3, a: 4 }, mag: 3, prof: 'fino10', territorio: { reg: 12, prov: 58, com: null } };
  const q = codificaStato({ strati: [], filtro: { ...FILTRO_INIZIALE }, tema: 'chiaro', lingua: 'it', opacita: { faglie: 0.5, base: 1 }, storico: { da: 10, a: 20 }, confronto, area: { reg: 12, prov: null, com: null, soloEventi: true } }).toString();
  const s = decodificaStato(q);
  assert.deepEqual(s.opacita, { faglie: 0.5 });
  assert.deepEqual(s.storico, { da: 10, a: 20 });
  assert.deepEqual(s.confronto, confronto);
  assert.deepEqual(s.area, { reg: 12, prov: null, com: null, soloEventi: true });
});

test('contorni ShakeMap: evento e prodotto fanno il giro, valori non validi no', () => {
  const q = codificaStato({ strati: [], filtro: { ...FILTRO_INIZIALE }, tema: 'chiaro', lingua: 'it', shakemap: { id: '47794662', prodotto: 'pga' } }).toString();
  assert.deepEqual(decodificaStato(q).shakemap, { id: '47794662', prodotto: 'pga' });
  assert.equal(decodificaStato('sm=abc.pga').shakemap, null);
  assert.equal(codificaStato({ strati: [], filtro: { ...FILTRO_INIZIALE }, tema: 'chiaro', lingua: 'it' }).has('sm'), false);
});
