// Regioni, province e comuni per la ricerca e i filtri a cascata. Funzioni pure sull'indice di dati/indice-comuni.json
// (generato da scripts/indice-comuni.mjs): nessun accesso a DOM o mappa.
export const LIVELLI = ['regione', 'provincia', 'comune'];
export const MIN_LETTERE = 3;
const MAX_SUGGERIMENTI = 8;
const PESO_TIPO = { regione: 0, provincia: 1, comune: 2 };

// minuscolo e senza accenti né apostrofi: «Forlì-Cesena» e «forli cesena» coincidono
export const normalizza = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`-]/g, ' ').replace(/\s+/g, ' ').trim();

// Dal JSON compatto alle voci {tipo, cod, nome, riquadro, reg, prov}; `reg` e `prov` sono i codici dei livelli superiori.
export function creaIndice({ r, p, c }) {
  const regioni = r.map(([cod, nome, riquadro]) => ({ tipo: 'regione', cod, nome, riquadro, reg: cod, prov: null }));
  const province = p.map(([cod, nome, reg, riquadro]) => ({ tipo: 'provincia', cod, nome, riquadro, reg, prov: cod }));
  const regDiProv = new Map(province.map(v => [v.cod, v.reg]));
  const comuni = c.map(([cod, nome, prov, riquadro]) => ({ tipo: 'comune', cod, nome, riquadro, reg: regDiProv.get(prov) ?? null, prov }));
  const perCodice = new Map([...regioni, ...province, ...comuni].map(v => [`${v.tipo}:${v.cod}`, v]));
  const voci = [...regioni, ...province, ...comuni].map(v => ({ v, chiave: normalizza(v.nome) }));
  return { regioni, province, comuni, perCodice, voci };
}

// Suggerimenti per le prime lettere: prima chi inizia con il testo, poi chi ha una parola che inizia, poi chi lo contiene;
// a parità regione, provincia, comune; infine alfabetico. Meno di MIN_LETTERE lettere: nessun suggerimento.
export function cerca(indice, testo, max = MAX_SUGGERIMENTI) {
  const q = normalizza(testo);
  if (q.length < MIN_LETTERE) return [];
  const trovati = [];
  for (const { v, chiave } of indice.voci) {
    const i = chiave.indexOf(q);
    if (i < 0) continue;
    const grado = i === 0 ? 0 : chiave[i - 1] === ' ' ? 1 : 2;
    trovati.push({ v, grado, esatto: chiave === q ? 0 : 1 });
  }
  trovati.sort((a, b) => a.grado - b.grado || a.esatto - b.esatto || PESO_TIPO[a.v.tipo] - PESO_TIPO[b.v.tipo] || a.v.nome.localeCompare(b.v.nome, 'it'));
  return trovati.slice(0, max).map(x => x.v);
}

// Scelta corrente: {reg, prov, com}, ciascuno codice o null; un livello basso presuppone quelli sopra.
export const SCELTA_VUOTA = Object.freeze({ reg: null, prov: null, com: null });
export const haScelta = s => s.reg != null;

// La scelta che corrisponde a una voce (cerca o menu): porta con sé i livelli superiori.
export const sceltaDaVoce = v => ({ reg: v.reg, prov: v.tipo === 'regione' ? null : v.prov, com: v.tipo === 'comune' ? v.cod : null });

// Cambia un livello e azzera quelli sotto; scegliere una provincia o un comune senza regione la ricava dall'indice.
export function cambia(indice, scelta, livello, cod) {
  const k = LIVELLI.indexOf(livello);
  if (cod == null || cod === '') return k === 0 ? { ...SCELTA_VUOTA } : { ...scelta, ...(k === 1 ? { prov: null, com: null } : { com: null }) };
  const voce = indice.perCodice.get(`${livello}:${cod}`);
  return voce ? sceltaDaVoce(voce) : scelta;
}

// Voci dei tre menu: ogni livello mostra solo ciò che sta dentro il livello sopra, se scelto.
export function opzioni(indice, scelta) {
  return {
    regione: indice.regioni,
    provincia: scelta.reg == null ? indice.province : indice.province.filter(v => v.reg === scelta.reg),
    comune: scelta.prov != null ? indice.comuni.filter(v => v.prov === scelta.prov) : scelta.reg != null ? indice.comuni.filter(v => v.reg === scelta.reg) : indice.comuni,
  };
}

// Il livello più basso scelto, come voce dell'indice; null se non c'è scelta.
export function voceScelta(indice, scelta) {
  if (scelta.com != null) return indice.perCodice.get(`comune:${scelta.com}`) ?? null;
  if (scelta.prov != null) return indice.perCodice.get(`provincia:${scelta.prov}`) ?? null;
  if (scelta.reg != null) return indice.perCodice.get(`regione:${scelta.reg}`) ?? null;
  return null;
}

// Espressione MapLibre che seleziona sullo strato dei comuni l'area scelta; null senza scelta.
export function filtroArea(scelta) {
  if (scelta.com != null) return ['==', ['get', 'pro_com'], scelta.com];
  if (scelta.prov != null) return ['==', ['get', 'cod_uts'], scelta.prov];
  if (scelta.reg != null) return ['==', ['get', 'cod_reg'], scelta.reg];
  return null;
}

// Etichetta di contesto sotto il nome: «Provincia · Regione» per un comune, la regione per una provincia.
export function contesto(indice, v) {
  if (v.tipo === 'regione') return '';
  const reg = indice.perCodice.get(`regione:${v.reg}`)?.nome;
  if (v.tipo === 'provincia') return reg ?? '';
  return [indice.perCodice.get(`provincia:${v.prov}`)?.nome, reg].filter(Boolean).join(' · ');
}

// Punto dentro i poligoni (GeoJSON Polygon/MultiPolygon, anelli interni inclusi): per assegnare un evento all'area scelta.
export function puntoInGeometrie(lon, lat, geometrie) {
  const dentroAnello = anello => {
    let dentro = false;
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
      const [xi, yi] = anello[i], [xj, yj] = anello[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  };
  const dentroPoligono = anelli => dentroAnello(anelli[0]) && !anelli.slice(1).some(dentroAnello);
  return geometrie.some(g => g.type === 'Polygon' ? dentroPoligono(g.coordinates) : g.type === 'MultiPolygon' && g.coordinates.some(dentroPoligono));
}
