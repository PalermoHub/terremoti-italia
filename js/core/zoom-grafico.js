// Zoom e pan dei grafici disegnati a mano: si sceglie un intervallo sull'asse orizzontale
// (tempo, anni o mesi) e il grafico viene ridisegnato per quell'intervallo.
// Lo usano il popup grande dei grafici della scheda (js/layers/scheda-terremoti-dom.js) e il confronto tra anni (js/layers/terremoti-archivio.js).
import { t } from './i18n.js';

const SVG = 'http://www.w3.org/2000/svg';
// Lente d'ingrandimento (come l'icona di riferimento) con dentro il simbolo: più, meno, o freccia circolare per reimpostare
const SIMBOLI = { piu: 'M7 10h6M10 7v6', meno: 'M7 10h6', reimposta: 'M12.6 8.5A3 3 0 1 0 13 10M11.8 11.2L13 10l1.2 1.2' };

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo;
  return e;
}

function nodoSvg(tag, attributi = {}) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attributi)) n.setAttribute(k, v);
  return n;
}

// `dominio` e `origine` sono intervalli { da, a } sull'asse orizzontale; `geometria` è il viewBox del grafico
// ({ L, A, MS, MD, MA, MB }); `ridisegna(dominio)` restituisce il blocco nuovo, che si ricostruisce il suo zoom;
// `formatta(da, a)` scrive l'intervallo nella riga dei comandi. `minDurata` ferma lo zoom prima che il tratto sia troppo stretto.
export function zoomGrafico({ blocco, svg, dominio, origine, geometria, formatta, ridisegna, minDurata = 0, aiuto = t('terremoti.zoom.aiuto'), frecceInRiga = false }) {
  const { L, A, MS, MD, MA, MB } = geometria;
  let corrente = blocco; // il blocco in pagina: il pan lo sostituisce mentre si trascina
  const sostituisci = nuovo => { if (nuovo) { corrente.replaceWith(nuovo); corrente = nuovo; } };
  const intero = dominio.da === origine.da && dominio.a === origine.a;
  const tutto = () => sostituisci(ridisegna(origine));
  if (!intero) svg.classList.add('zoomato');

  const icona = (simbolo, chiave, azione) => {
    const b = el('button', 'zoom-icona');
    const lente = nodoSvg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    lente.append(nodoSvg('circle', { cx: 10, cy: 10, r: 7 }), nodoSvg('path', { d: 'M15.2 15.2L21 21' }), nodoSvg('path', { d: SIMBOLI[simbolo] }));
    b.append(lente);
    b.type = 'button';
    b.title = t(chiave);
    b.setAttribute('aria-label', t(chiave));
    b.addEventListener('click', azione);
    return b;
  };
  const piuMeno = () => [icona('piu', 'terremoti.zoom.piu', () => scala(0.5, true)), icona('meno', 'terremoti.zoom.meno', () => scala(0.5, false))];

  if (intero) {
    const testo = el('p', 'scheda-nota zoom-aiuto', aiuto);
    testo.append(' ', ...piuMeno());
    svg.before(testo);
  } else {
    const riga = el('div', 'zoom-riga');
    // frecce: spostano il tratto di un terzo della sua durata, senza uscire dai dati
    const freccia = (simbolo, verso, chiave) => {
      const b = el('button', `zoom-freccia ${verso < 0 ? 'sx' : 'dx'}${frecceInRiga ? ' nella-riga' : ''}`, simbolo);
      b.type = 'button';
      b.title = t(chiave);
      b.setAttribute('aria-label', t(chiave));
      b.addEventListener('click', () => {
        const durata = dominio.a - dominio.da;
        const da = Math.min(Math.max(dominio.da + verso * durata / 3, origine.da), origine.a - durata);
        const nuovo = ridisegna({ da, a: da + durata });
        if (nuovo?.querySelector('svg')) sostituisci(nuovo);
      });
      return b;
    };
    const saette = () => [freccia('‹', -1, 'terremoti.zoom.sinistra'), freccia('›', 1, 'terremoti.zoom.destra')];
    if (frecceInRiga) riga.append(...saette()); // nella riga dei comandi, senza coprire assi e dati
    riga.append(...piuMeno(), icona('reimposta', 'terremoti.zoom.reimposta', tutto), el('span', 'scheda-nota', formatta(dominio.da, dominio.a)));
    svg.before(riga);
    if (!frecceInRiga) blocco.append(...saette()); // sul grafico, ai lati, come in uno slider di foto
  }

  svg.addEventListener('dblclick', tutto);

  const frazione = ev => {
    const r = svg.getBoundingClientRect();
    return Math.min(1, Math.max(0, (((ev.clientX - r.left) * L) / r.width - MS) / (L - MS - MD)));
  };
  const xSvg = f => MS + f * (L - MS - MD);

  // Ingrandisce (o riduce) attorno alla frazione `f` del grafico; tornando alla durata intera si rivede tutto
  const scala = (f, dentro) => {
    const durata = dominio.a - dominio.da;
    const nuova = durata * (dentro ? 0.7 : 1 / 0.7);
    if (nuova >= origine.a - origine.da) { if (!intero) tutto(); return; }
    if (nuova < minDurata) return;
    const da = Math.min(Math.max(dominio.da + f * durata - f * nuova, origine.da), origine.a - nuova);
    const nuovo = ridisegna({ da, a: da + nuova });
    if (nuovo?.querySelector('svg')) sostituisci(nuovo);
  };

  // Rotella: un colpo ogni 80 ms, per non ridisegnare a raffica
  let ultimaRotella = 0;
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    if (ev.timeStamp - ultimaRotella < 80) return;
    ultimaRotella = ev.timeStamp;
    scala(frazione(ev), ev.deltaY < 0);
  }, { passive: false });

  // Pan: con il grafico ingrandito il trascinamento sposta il tratto (Maiusc + trascinamento = nuova selezione). Si parte sempre dal dominio del blocco.
  const panorama = ev => {
    const larghezza = svg.getBoundingClientRect().width, x0 = ev.clientX, durata = dominio.a - dominio.da;
    let attesa = false, ultimo = null;
    const sposta = () => {
      attesa = false;
      const df = ((ultimo - x0) * L / larghezza) / (L - MS - MD);
      const da = Math.min(Math.max(dominio.da - df * durata, origine.da), origine.a - durata);
      const nuovo = ridisegna({ da, a: da + durata });
      if (nuovo?.querySelector('svg')) sostituisci(nuovo);
    };
    const muovi = e => {
      ultimo = e.clientX;
      if (!attesa) { attesa = true; requestAnimationFrame(sposta); }
    };
    const fine = () => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', fine);
      if (Math.abs((ultimo ?? x0) - x0) < 6) return;
      const ferma = c => c.stopPropagation();
      svg.addEventListener('click', ferma, true);
      setTimeout(() => svg.removeEventListener('click', ferma, true), 0);
    };
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', fine);
  };

  svg.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    if (!intero && !ev.shiftKey) return panorama(ev);
    const f0 = frazione(ev), x0 = ev.clientX;
    let rett = null, trascinato = false;
    const muovi = e => {
      if (!trascinato && Math.abs(e.clientX - x0) < 6) return; // sotto 6 px è un clic (apre l'evento)
      trascinato = true;
      rett ??= svg.appendChild(nodoSvg('rect', { class: 'brush', y: MA, height: A - MA - MB }));
      const [a, b] = [f0, frazione(e)].sort((x, y) => x - y);
      rett.setAttribute('x', xSvg(a));
      rett.setAttribute('width', xSvg(b) - xSvg(a));
    };
    const fine = e => {
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', fine);
      rett?.remove();
      if (!trascinato) return;
      const ferma = c => c.stopPropagation(); // il clic che chiude il trascinamento non deve aprire un evento
      svg.addEventListener('click', ferma, true);
      setTimeout(() => svg.removeEventListener('click', ferma, true), 0);
      const [a, b] = [f0, frazione(e)].sort((x, y) => x - y);
      if (b - a < 0.01) return;
      const da = dominio.da + a * (dominio.a - dominio.da);
      const nuovo = ridisegna({ da, a: dominio.da + b * (dominio.a - dominio.da) });
      if (nuovo?.querySelector('svg')) sostituisci(nuovo); // tratto troppo povero di eventi: si resta dove si è
    };
    window.addEventListener('pointermove', muovi);
    window.addEventListener('pointerup', fine);
  });
}