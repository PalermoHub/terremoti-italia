import { t, localeIntl } from '../core/i18n.js';
import { titoloConInfo, apriGrande } from '../core/info-grafico.js';
import { zoomGrafico } from '../core/zoom-grafico.js';
import { rendiGruppo, rendiApribile, creaSync, aggiungiMappa, adattaDimensioni, azzeraSelezione, dimensioniPopup } from './scheda-terremoti-dom.js';
import { nodoSvg, testoSvg, titoloAsse, collegaTooltip } from './terremoti-archivio.js';
import { CLASSI_PROFONDITA, coloreProfondita, estremoAsse } from './scheda-sezione.js';
import { raggioMagnitudo } from './scheda-terremoti.js';
import { vista3d } from './grafico-sezione-3d.js';

// Grafico della sezione verticale, nello stile di quelli della scheda: titolo con «i» e «ingrandisci», tooltip su ogni cerchio,
// evidenza dell'evento in mappa al passaggio del mouse e, nel popup grande, zoom e pan lungo la linea.
// x = distanza da A (km), y = profondità (km, verso il basso); colore = profondità, grandezza = magnitudo.
const DIM = { L: 400, A: 210, MS: 38, MD: 12, MA: 10, MB: 26 };
const MARGINI_GRANDE = { MS: 62, MD: 24, MA: 22, MB: 54 };
const numero = (n, d = 0) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });
const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
};

// Estremo dell'asse della profondità: un valore tondo appena sopra il massimo (700 per 620, non 1000)
const cimaProfondita = massimo => {
  const potenza = 10 ** Math.floor(Math.log10(Math.max(1, massimo)));
  const n = Math.max(1, massimo) / potenza;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10].find(s => s >= n) ?? 10) * potenza;
};

// Etichette dell'asse x a passi tondi dentro [da, a]
function tacchePasso(da, a, quante) {
  const passo = estremoAsse((a - da) / quante);
  const out = [];
  for (let v = Math.ceil(da / passo) * passo; v <= a + 1e-9; v += passo) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

let in3d = false; // la vista scelta nel popup resta tra un ridisegno e l'altro (zoom), si azzera a ogni apertura

const tip = e => `M ${numero(e.mag, 1)} · ${numero(e.prof)} km · ${e.ora}${e.luogo ? ` · ${e.luogo}` : ''}`;

// `eventi` = eventi dentro la fascia (con x e prof); `dominio`/`origine` = intervallo di distanza mostrato / intero (per lo zoom)
export function graficoSezione(eventi, lunghezza, { grande = false, dominio = null, origine = null, interazione = null, semilarghezza = null } = {}) {
  const intero = origine ?? { da: 0, a: lunghezza };
  const da = Math.max(0, dominio?.da ?? 0), a = Math.min(lunghezza, dominio?.a ?? lunghezza);
  const visibili = eventi.filter(e => e.x >= da && e.x <= a);
  const dim = grande ? { ...dimensioniPopup(), ...MARGINI_GRANDE } : DIM; // nel popup la larghezza segue lo spazio lasciato a minimappa e scheda
  const sync = grande ? creaSync(null) : null;
  const { L, A, MS, MD, MA, MB } = dim;
  const sinistra = MS, destra = L - MD, alto = MA, basso = A - MB;
  const cima = cimaProfondita(Math.max(10, ...visibili.map(e => e.prof)));
  const x = d => sinistra + (d - da) / (a - da) * (destra - sinistra);
  const y = p => alto + p / cima * (basso - alto); // la profondità cresce verso il basso
  const titolo = t('terremoti.sez.graficoTitolo');
  const blocco = el('div', `terremoti-serie terremoti-confronto-grafico${grande ? ' grande' : ''}`);
  const ingrandisci = () => apriGrande(titolo, () => { in3d = false; azzeraSelezione(); adattaDimensioni('sezione'); return graficoSezione(eventi, lunghezza, { grande: true, interazione, semilarghezza }); });
  blocco.append(titoloConInfo('h4', 'terremoti-titolo', titolo, 'sezione-verticale', grande ? null : ingrandisci));
  const svg = nodoSvg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': t('terremoti.sez.aria') });
  if (grande) svg.classList.add('grafico-zoom');

  for (const v of grande ? [0, 0.25, 0.5, 0.75, 1].map(f => cima * f) : cima >= 4 ? [0, cima / 2, cima] : [0, cima]) {
    svg.append(nodoSvg('line', { x1: sinistra, x2: destra, y1: y(v), y2: y(v), class: v ? 'griglia' : 'asse' }));
    svg.append(testoSvg(sinistra - 4, y(v) + 3, numero(Math.round(v)), { 'text-anchor': 'end' }));
  }
  for (const d of tacchePasso(da, a, grande ? 8 : 4)) {
    svg.append(testoSvg(x(d), grande ? basso + 22 : A - 6, numero(d), { 'text-anchor': 'middle' }));
    if (grande) svg.append(nodoSvg('line', { x1: x(d), x2: x(d), y1: alto, y2: basso, class: 'griglia' }));
  }
  // A e B agli estremi della linea, quando sono nell'intervallo mostrato
  if (da <= 0) svg.append(testoSvg(sinistra + 2, alto + 11, 'A', { class: 'et asse-titolo' }));
  if (a >= lunghezza) svg.append(testoSvg(destra - 2, alto + 11, 'B', { 'text-anchor': 'end', class: 'et asse-titolo' }));

  // i più forti per ultimi (sopra); ogni cerchio ha il suo tooltip e accende l'evento in mappa
  for (const e of [...visibili].sort((p, q) => p.mag - q.mag)) {
    const c = nodoSvg('circle', { cx: x(e.x), cy: y(e.prof), r: raggioMagnitudo(e.mag) * (grande ? 0.9 : 0.6), fill: coloreProfondita(e.prof), 'data-tip': tip(e), class: 'punto-sezione' });
    if (sync) {
      const g = nodoSvg('g', { class: 'evento' }, tip(e));
      g.append(c);
      rendiApribile(g, e, null, sync, interazione);
      svg.append(g);
    } else {
      rendiGruppo(c, [e], interazione, tip(e));
      svg.append(c);
    }
  }
  svg.append(nodoSvg('line', { x1: sinistra, x2: sinistra, y1: alto, y2: basso, class: 'asse' }));
  if (grande) {
    titoloAsse(svg, t('terremoti.sez.asseDistanza'), sinistra + (destra - sinistra) / 2, A - 4);
    titoloAsse(svg, t('terremoti.sez.asseProfondita'), 15, (alto + basso) / 2, true);
  }

  const chiave = el('div', 'terremoti-confronto-chiave');
  CLASSI_PROFONDITA.forEach((c, i) => {
    const voce = el('span');
    const pallino = el('i');
    pallino.style.background = c.colore;
    const inizio = i ? CLASSI_PROFONDITA[i - 1].fino : 0;
    voce.append(pallino, el('span', null, c.fino === Infinity ? `≥ ${inizio}` : i ? `${inizio}–${c.fino}` : `< ${c.fino}`));
    chiave.append(voce);
  });
  blocco.append(chiave, svg, el('p', 'scheda-nota', t('terremoti.sez.graficoNota')));
  collegaTooltip(blocco);
  if (grande) {
    aggiungiMappa(blocco, sync, eventi, null, e => coloreProfondita(e.prof));
    if (semilarghezza) aggiungiVista3d(blocco, svg, chiave, sync, eventi, lunghezza, semilarghezza, cimaProfondita(Math.max(10, ...eventi.map(e => e.prof))), interazione);
    zoomGrafico({
      blocco, svg,
      dominio: { da, a },
      origine: intero,
      geometria: dim,
      minDurata: Math.max(5, lunghezza / 40),
      aiuto: t('terremoti.sez.zoomAiuto'),
      formatta: (d0, d1) => `${numero(d0)} – ${numero(d1)} km`,
      ridisegna: d => graficoSezione(eventi, lunghezza, { grande: true, dominio: d, origine: intero, interazione, semilarghezza }),
    });
  }
  return blocco;
}

// Interruttore 2D / 3D del popup: la nuvola 3D prende il posto dell'svg nella stessa cella e usa lo stesso `sync` (minimappa, scheda)
function aggiungiVista3d(blocco, svg, chiave, sync, eventi, lunghezza, semilarghezza, cima, interazione) {
  const v = vista3d(eventi, lunghezza, semilarghezza, cima, { sync, interazione });
  const interruttore = el('button', 'grafico-3d-interruttore');
  interruttore.type = 'button';
  const imposta = acceso => {
    in3d = acceso;
    svg.style.display = acceso ? 'none' : '';
    blocco.classList.toggle('vista-3d', acceso);
    v.canvas.hidden = !acceso;
    v.comandi.hidden = !acceso;
    interruttore.textContent = acceso ? t('terremoti.sez.vista2d') : t('terremoti.sez.vista3d');
    interruttore.setAttribute('aria-pressed', String(acceso));
    if (acceso) v.disegna();
  };
  interruttore.addEventListener('click', () => imposta(!in3d));
  svg.after(v.canvas);
  chiave.append(interruttore, v.comandi);
  imposta(in3d);
}
