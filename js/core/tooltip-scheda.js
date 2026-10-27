// Tooltip «di riserva» dai dati della scheda: ogni strato con una scheda (poligoni «hit» trasparenti) e senza un tooltip
// proprio mostra, a strato acceso, titolo e prime righe della sua voce di scheda. Così il tooltip descrive tutti gli strati aperti.
import { registraTooltip, campioneTooltip } from './tooltip.js';
import { svgIcona } from './icone.js';
import { tl } from './i18n.js';

const MAX_VOCI = 3;
const MAX_RIGHE = 3;
const COLORE = '#495057'; // colore del marchio e della linea di richiamo, finché le voci di scheda non ne hanno uno
const R = 4; // riquadro di ±R pixel attorno al cursore, come per i clic

// Voci di scheda → modelli di tooltip {titolo, righe}, solo per gli strati accesi e non esclusi
export function modelliDaVoci(voci, { acceso, escludi = [] }) {
  const visti = new Set();
  const modelli = [];
  for (const v of voci) {
    if (!v?.titolo || escludi.includes(v.strato) || !acceso(v.strato)) continue;
    const chiave = v.chiave ?? v.titolo;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    const valide = g => (g.righe ?? []).filter(r => r?.etichetta && r?.valore != null);
    // `unaRigaPerGruppo`: con più gruppi (es. più vincoli sotto lo stesso punto) ognuno dà la sua prima riga, col titolo del gruppo
    const rr = v.unaRigaPerGruppo && (v.gruppi?.length ?? 0) > 1
      ? v.gruppi.flatMap(g => valide(g).slice(0, 1).map(r => ({ ...r, etichetta: g.titolo ?? r.etichetta }))).slice(0, v.maxRighe ?? MAX_RIGHE)
      : (v.gruppi ?? []).flatMap(valide).slice(0, v.maxRighe ?? MAX_RIGHE);
    modelli.push({ titolo: v.titolo, icona: v.icona, badge: v.badge, righe: rr });
  }
  return modelli;
}

// Il simbolo di una riga: `{ legenda, colore }` (quadratino colorato), `{ legenda, classe }` (la classe dell'<i> della legenda)
// oppure `{ legenda, immagine }` (il simbolo 16×16 della legenda, es. quelli del PRG)
function simboloRiga({ legenda, colore, classe, immagine }) {
  if (!immagine) return campioneTooltip(legenda, [classe ?? '', colore ? { background: colore } : {}]);
  const img = document.createElement('img');
  Object.assign(img, { src: immagine, alt: '', width: 16, height: 16 });
  img.style.imageRendering = 'pixelated';
  return campioneTooltip(legenda, img);
}

function disegna(modelli) {
  const corpo = document.createElement('div');
  corpo.className = 'strati-tooltip-corpo';
  for (const m of modelli.slice(0, MAX_VOCI)) {
    const voce = document.createElement('div');
    const testa = document.createElement('div'); // intestazione come nel popup: marchio colorato e titolo della voce in maiuscolo
    testa.className = 'tooltip-testa';
    const marchio = document.createElement('span');
    marchio.className = 'tooltip-marchio';
    marchio.style.background = COLORE;
    marchio.innerHTML = m.icona ? svgIcona(m.icona, 14) : '';
    const sezione = document.createElement('span');
    sezione.className = 'tooltip-sezione';
    sezione.textContent = tl(m.titolo);
    testa.append(marchio, sezione);
    voce.append(testa);
    if (m.badge) {
      const badge = document.createElement('strong');
      badge.textContent = m.badge;
      voce.append(badge);
    }
    // righe come nella scheda: etichetta attenuata a sinistra, valore in grassetto a destra
    for (const r of m.righe) {
      const riga = document.createElement('div');
      riga.className = 'tooltip-riga';
      const etichetta = document.createElement('span');
      etichetta.textContent = r.etichetta;
      const valore = document.createElement('b');
      valore.textContent = r.valore;
      // una riga con `campione` mostra il simbolo di legenda accanto al valore (vedi simboloRiga)
      if (r.campione) valore.prepend(simboloRiga(r.campione));
      riga.append(etichetta, valore);
      voce.append(riga);
    }
    corpo.append(voce);
  }
  if (modelli.length > MAX_VOCI) {
    const altre = document.createElement('div');
    altre.className = 'strati-tooltip-altre';
    altre.textContent = `+ altri ${modelli.length - MAX_VOCI}`;
    corpo.append(altre);
  }
  return corpo;
}

// moduli con `scheda.tooltip: true` (e, se serve, `scheda.senzaTooltip: [id di strato già coperti da un tooltip proprio]`)
export function collegaTooltipScheda(map, moduli) {
  const strati = moduli.flatMap(m => m.strati ?? []);
  const acceso = id => {
    const layer = strati.find(s => s.id === id)?.layers?.[0];
    return !!layer && !!map.getLayer(layer) && map.getLayoutProperty(layer, 'visibility') === 'visible';
  };
  const conTooltip = moduli.filter(m => m.scheda?.tooltip);
  registraTooltip(map, e => {
    const modelli = [];
    for (const m of conTooltip) {
      const layers = m.scheda.layers.filter(id => map.getLayer(id));
      if (!layers.length) continue;
      const riquadro = [[e.point.x - R, e.point.y - R], [e.point.x + R, e.point.y + R]];
      const trovati = map.queryRenderedFeatures(riquadro, { layers });
      if (!trovati.length) continue;
      modelli.push(...modelliDaVoci(m.scheda.voci(trovati, e.lngLat), { acceso, escludi: m.scheda.senzaTooltip }));
    }
    return modelli.length ? { contenuto: disegna(modelli), colore: COLORE } : null;
  }, 2);
}
