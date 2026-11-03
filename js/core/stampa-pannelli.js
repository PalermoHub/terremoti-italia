// Disegno dei layout a pannelli della stampa (report, bacheca, murale): intestazione, mappa incorniciata, zona dei pannelli dati
// (riquadri, evento più forte, serie, legenda, elenco) e piede con fonte dei dati e avvertenza, sempre presenti.
// Le misure sono in mm; `dati` = { totale, magMax, profMediana, massimo, top, serie, unita } calcolato dagli eventi in elenco.
import { t as tr, localeIntl } from './i18n.js';
import { CLASSI_MAGNITUDO, coloreMagnitudo } from './magnitudo.js';
import { barraScala, scalaDaZoom } from './stampa.js';
import { geometriaLayout } from './stampa-layout.js';
import { BLU, URL_APP, MM_PX_CSS, carta, cornice, disegnaStelle, disegnaMl, roseDeiVenti, scalaTema, legendaContorni, etichettaClasse, proiettore, luminosita, spezzaRighe, stella, pallino } from './stampa-poster.js';

const TESTO = '#1e293b';
const SOFFOCATO = '#475569';
const DATI_VUOTI = { totale: 0, magMax: null, profMediana: null, massimo: null, top: [], serie: [], unita: 'giorno' };

const formatoMl = m => Number(m).toLocaleString(localeIntl(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dataBreve = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dataLunga = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Accorcia `testo` con i puntini finché sta in `max` (con il font corrente del contesto)
function tronca(ctx, testo, max) {
  if (ctx.measureText(testo).width <= max) return testo;
  let t = testo;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

const intestazione = (ctx, c, x, y, w, testo) => {
  ctx.font = `bold ${c * 0.95}px Montserrat, sans-serif`;
  ctx.fillStyle = BLU; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(testo.toUpperCase(), x, y, w);
};

// Tre riquadri: eventi nel periodo, magnitudo massima, profondità mediana (in fila se il pannello è largo, altrimenti in colonna)
function pannelloKpi(ctx, u, c, r, d) {
  carta(ctx, u, r.x, r.y, r.w, r.h, c * 0.8);
  const voci = [
    [tr('stampa.pannello.eventi'), String(d.totale)],
    [tr('stampa.pannello.magMax'), d.magMax == null ? '—' : formatoMl(d.magMax)],
    [tr('stampa.pannello.profMediana'), d.profMediana == null ? '—' : `${Math.round(d.profMediana)} km`],
  ];
  const p = c;
  const inFila = r.w > r.h * 2.2;
  const cw = inFila ? (r.w - 2 * p) / 3 : r.w - 2 * p;
  const ch = inFila ? r.h - 2 * p : (r.h - 2 * p) / 3;
  voci.forEach(([etichetta, valore], i) => {
    const x = r.x + p + (inFila ? i * cw : 0), y = r.y + p + (inFila ? 0 : i * ch);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `600 ${c * 0.85}px Montserrat, sans-serif`; ctx.fillStyle = SOFFOCATO;
    ctx.fillText(etichetta, x, y, cw - c * 0.4);
    ctx.font = `bold ${Math.min(c * 4.2, ch * 0.62)}px "Atkinson Hyperlegible", Montserrat, sans-serif`; ctx.fillStyle = TESTO;
    ctx.fillText(valore, x, y + c * 1.2, cw - c * 0.4);
  });
}

const ora = ts => new Date(ts).toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const gradi = (v, positivo, negativo) => `${Math.abs(v).toLocaleString(localeIntl(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}° ${v < 0 ? negativo : positivo}`;

// Dettagli dell'evento più forte, in ordine di importanza: [etichetta, valore]; il pannello ne mostra quanti ne stanno
function dettagliEvento(e, d) {
  const righe = [];
  if (Number.isFinite(e.prof)) righe.push([tr('stampa.pannello.profondita'), `${Math.round(e.prof)} km`]);
  if (Number.isFinite(e.ts)) righe.push([tr('stampa.pannello.oraUtc'), ora(e.ts)]);
  if (Number.isFinite(e.lat) && Number.isFinite(e.lon)) righe.push([tr('stampa.pannello.coordinate'), `${gradi(e.lat, 'N', 'S')} · ${gradi(e.lon, 'E', 'W')}`]);
  for (const m of [4, 5, 3]) if (d.oltre?.[m] > 0 && m <= Math.floor(e.mag)) righe.push([tr('stampa.pannello.eventiDa', { m }), String(d.oltre[m])]);
  return righe;
}

// L'evento più forte: magnitudo grande, luogo, data e dettagli (profondità, ora, coordinate, quanti eventi forti nel periodo).
// Il pannello largo mette la cifra a sinistra e il testo a destra; quello stretto li impila.
function pannelloEvento(ctx, u, c, r, d) {
  carta(ctx, u, r.x, r.y, r.w, r.h, c * 0.8, '#f5a623');
  const p = c * 1.1, e = d.massimo;
  ctx.fillStyle = '#1a1206'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = `bold ${c * 0.95}px Montserrat, sans-serif`;
  ctx.fillText(tr('stampa.pannello.piuForte').toUpperCase(), r.x + p, r.y + p, r.w - 2 * p);
  if (!e) { ctx.font = `${c * 1.1}px Montserrat, sans-serif`; ctx.fillText(tr('stampa.pannello.nessunEvento'), r.x + p, r.y + p + c * 2, r.w - 2 * p); return; }
  const largo = r.w > r.h * 1.5;
  const corpoY = r.y + p + c * 1.5; // sotto l'intestazione
  const dettagli = dettagliEvento(e, d);
  const colonna = (x, y0, w, h, conCifra) => { // testo: luogo, data, dettagli
    let y = y0;
    ctx.fillStyle = '#1a1206'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // il luogo sta su una riga: il carattere si riduce (fino a 0,85 corpi) finché entra; solo allora, se serve, va a capo
    const luogo = e.luogo || '—';
    let fl = c * 1.25;
    ctx.font = `bold ${fl}px Montserrat, sans-serif`;
    while (ctx.measureText(luogo).width > w && fl > c * 0.85) { fl *= 0.96; ctx.font = `bold ${fl}px Montserrat, sans-serif`; }
    const righeLuogo = spezzaRighe(ctx, luogo, w).slice(0, 2);
    if (righeLuogo.length === 2 && spezzaRighe(ctx, luogo, w).length > 2) righeLuogo[1] = tronca(ctx, `${righeLuogo[1]} …`, w);
    righeLuogo.forEach(riga => { ctx.fillText(tronca(ctx, riga, w), x, y); y += fl * 1.3; });
    y += c * 0.15;
    ctx.font = `${c}px Montserrat, sans-serif`; ctx.fillText(tronca(ctx, dataLunga(e.ts), w), x, y); y += c * 1.0 * 1.7;
    ctx.strokeStyle = 'rgba(26,18,6,.35)'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(x, y - c * 0.4); ctx.lineTo(x + w, y - c * 0.4); ctx.stroke();
    for (const [etichetta, valore] of dettagli) {
      if (y + c * 2.3 > y0 + h) break; // non ci sta più
      ctx.font = `600 ${c * 0.8}px Montserrat, sans-serif`; ctx.fillStyle = 'rgba(26,18,6,.75)'; ctx.fillText(etichetta, x, y);
      ctx.font = `bold ${c * 1.05}px "Atkinson Hyperlegible", Montserrat, sans-serif`; ctx.fillStyle = '#1a1206'; ctx.fillText(tronca(ctx, valore, w), x, y + c * 0.95);
      y += c * 2.3;
    }
  };
  const alto = r.y + r.h - p - corpoY;
  if (largo) {
    const wCifra = (r.w - 2 * p) * 0.42;
    ctx.font = `bold ${Math.min(alto / 1.05, wCifra / 1.7, c * 14)}px "Atkinson Hyperlegible", Montserrat, sans-serif`;
    ctx.fillText(formatoMl(e.mag), r.x + p, corpoY, wCifra);
    colonna(r.x + p + wCifra + c * 1.5, corpoY, r.w - 2 * p - wCifra - c * 1.5, alto);
  } else {
    const fs = Math.max(c * 2.5, Math.min(alto * 0.34 / 1.05, c * 9, r.w * 0.42));
    ctx.font = `bold ${fs}px "Atkinson Hyperlegible", Montserrat, sans-serif`; ctx.fillStyle = '#1a1206';
    ctx.fillText(formatoMl(e.mag), r.x + p, corpoY, r.w - 2 * p);
    const y1 = corpoY + fs * 1.1;
    colonna(r.x + p, y1, r.w - 2 * p, r.y + r.h - p - y1);
  }
}

// Istogramma degli eventi per giorno (o per mese/anno sui periodi lunghi): asse verticale con griglia, etichette dell'asse del tempo
// distribuite quanto la larghezza consente e, se le colonne sono larghe abbastanza, il valore sopra ogni colonna
function pannelloSerie(ctx, u, c, r, d) {
  carta(ctx, u, r.x, r.y, r.w, r.h, c * 0.8);
  const p = c;
  intestazione(ctx, c, r.x + p, r.y + p, r.w - 2 * p, tr(d.unita === 'anno' ? 'stampa.pannello.serieAnno' : d.unita === 'mese' ? 'stampa.pannello.serieMese' : 'stampa.pannello.serieGiorno'));
  const s = d.serie;
  if (!s.length) return;
  const max = Math.max(...s.map(v => v.n), 1);
  const fs = c * 0.85;
  ctx.font = `${fs}px "Atkinson Hyperlegible", Montserrat, sans-serif`;
  const asse = Math.ceil(max / 4 / 10 ** Math.floor(Math.log10(max / 4 || 1))) * 10 ** Math.floor(Math.log10(max / 4 || 1)); // passo «tondo» della griglia: circa 4 linee
  const passo = Math.max(1, asse);
  const cima = max; // la scala arriva al massimo dei dati
  const margineY = ctx.measureText(String(max)).width + c * 0.7;
  const x0 = r.x + p + margineY, w = r.w - 2 * p - margineY;
  const alto = r.y + p + c * 2.6, base = r.y + r.h - p - c * 1.6;
  const y = v => base - (base - alto) * v / cima;
  // griglia e valori dell'asse verticale
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = SOFFOCATO; ctx.strokeStyle = '#d0d7de'; ctx.lineWidth = 0.15;
  const livelli = [];
  for (let v = 0; v <= max; v += passo) livelli.push(v);
  if (livelli[livelli.length - 1] !== max && max - livelli[livelli.length - 1] > passo * 0.4) livelli.push(max);
  livelli.forEach(v => { ctx.beginPath(); ctx.moveTo(x0, y(v)); ctx.lineTo(x0 + w, y(v)); ctx.stroke(); ctx.fillText(String(v), x0 - c * 0.4, y(v)); });
  // colonne
  const bw = w / s.length;
  ctx.fillStyle = '#1971c2';
  s.forEach((v, i) => ctx.fillRect(x0 + i * bw + bw * 0.12, y(v.n), bw * 0.76, base - y(v.n)));
  // valore sopra le colonne, solo se ci sta
  if (bw >= c * 2.2) { ctx.fillStyle = TESTO; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; s.forEach((v, i) => { if (v.n) ctx.fillText(String(v.n), x0 + i * bw + bw / 2, y(v.n) - c * 0.15); }); }
  ctx.strokeStyle = TESTO; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x0 + w, base); ctx.stroke();
  // etichette del tempo: una ogni `salto` colonne, sempre la prima; l'ultima solo se non tocca la penultima
  const larghezzaEtichetta = Math.max(...s.map(v => ctx.measureText(v.etichetta).width)) + c * 0.8;
  const salto = Math.max(1, Math.ceil(larghezzaEtichetta / bw));
  ctx.fillStyle = SOFFOCATO; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  s.forEach((v, i) => {
    if (i % salto) return;
    const cx = x0 + i * bw + bw / 2;
    ctx.beginPath(); ctx.strokeStyle = TESTO; ctx.lineWidth = 0.2; ctx.moveTo(cx, base); ctx.lineTo(cx, base + c * 0.3); ctx.stroke();
    ctx.fillText(v.etichetta, Math.min(Math.max(cx, x0 + larghezzaEtichetta / 2 - c * 0.4), x0 + w - larghezzaEtichetta / 2 + c * 0.4), base + c * 0.45);
  });
}

// Legenda sulla mappa: cerchi e stelle delle classi di magnitudo e, se il tema non è la magnitudo, le voci della scala del colore;
// `tema` = scalaTema(), `r` = riquadro (altezza da `altezzaLegenda`)
function pannelloLegenda(ctx, u, c, r, tema, contorni) {
  carta(ctx, u, r.x, r.y, r.w, r.h, c * 0.8);
  const p = c;
  intestazione(ctx, c, r.x + p, r.y + p, r.w - 2 * p, tr('terremoti.ev.magnitudo'));
  const voci = [
    ...CLASSI_MAGNITUDO.map(k => ({ tipo: 'classe', k })),
    ...(tema.modo === 'magnitudo' ? [] : [{ tipo: 'titolo', testo: tema.nome }, ...tema.voci.map(v => ({ tipo: 'voce', v }))]),
    ...(contorni ? [{ tipo: 'titolo', testo: contorni.titolo, gruppo: 1 }, { tipo: 'evento', testo: contorni.evento.riga1, gruppo: 1 }, ...contorni.voci.map(v => ({ tipo: 'linea', v, gruppo: 1 }))] : []),
  ];
  const nBase = voci.filter(v => !v.gruppo).length, nContorni = voci.length - nBase;
  const colonne = Math.max(1, Math.min(voci.length, Math.floor((r.w - 2 * p) / (c * 11))));
  const aGruppi = colonne >= 2 && nContorni > 0; // i contorni ShakeMap hanno una colonna tutta loro
  const righe = aGruppi ? Math.max(nBase, nContorni) : Math.ceil(voci.length / colonne);
  const altezzaRiga = Math.min(c * 2.6, (r.h - 2 * p - c * 2) / righe);
  const larghezzaColonna = (r.w - 2 * p) / colonne;
  voci.forEach((voce, i) => {
    const colonna = aGruppi ? (voce.gruppo ? 1 : 0) : Math.floor(i / righe);
    const riga = aGruppi ? (voce.gruppo ? i - nBase : i) : i % righe;
    const x = r.x + p + colonna * larghezzaColonna, y = r.y + p + c * 2 + riga * altezzaRiga + altezzaRiga / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = TESTO;
    if (voce.tipo === 'titolo') { ctx.font = `bold ${c * 0.9}px Montserrat, sans-serif`; ctx.fillStyle = BLU; ctx.fillText(voce.testo, x, y, larghezzaColonna - c); return; }
    const cx = x + c * 1.2;
    if (voce.tipo === 'evento') { ctx.font = `${c * 0.8}px Montserrat, sans-serif`; ctx.fillStyle = SOFFOCATO; ctx.fillText(tronca(ctx, voce.testo, larghezzaColonna - c), x, y); return; }
    if (voce.tipo === 'linea') { // contorno ShakeMap: tratto colorato con filo scuro, come in mappa
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(31,42,68,.55)'; ctx.lineWidth = c * 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c * 2.2, y); ctx.stroke();
      ctx.strokeStyle = voce.v.colore; ctx.lineWidth = c * 0.3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c * 2.2, y); ctx.stroke();
      ctx.font = `${c * 0.9}px Montserrat, sans-serif`; ctx.fillStyle = TESTO; ctx.fillText(voce.v.testo, x + c * 3, y, larghezzaColonna - c * 3.4);
      return;
    }
    if (voce.tipo === 'voce') {
      ctx.fillStyle = voce.v.colore; ctx.beginPath(); ctx.roundRect(x, y - c * 0.4, c * 2.2, c * 0.8, c * 0.4); ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.lineWidth = 0.1; ctx.stroke();
      ctx.font = `${c * 0.9}px Montserrat, sans-serif`; ctx.fillStyle = TESTO; ctx.fillText(voce.v.testo, x + c * 3, y, larghezzaColonna - c * 3.4);
      return;
    }
    const k = voce.k, raggio = Math.min(k.raggio * MM_PX_CSS * 1.25, altezzaRiga * 0.42);
    const magnitudo = tema.modo === 'magnitudo';
    if (k.a === Infinity) {
      stella(ctx, cx, y, Math.max(raggio * 1.3, c * 0.6));
      ctx.fillStyle = magnitudo ? k.colore : '#94a3b8'; ctx.strokeStyle = TESTO; ctx.lineWidth = 0.2; ctx.fill(); ctx.stroke();
    } else if (magnitudo) pallino(ctx, cx, y, raggio, '#fff', k.colore, TESTO);
    else pallino(ctx, cx, y, raggio, '#f8fafc', '#94a3b8', SOFFOCATO);
    ctx.font = `${c * 0.95}px Montserrat, sans-serif`; ctx.fillStyle = TESTO;
    ctx.fillText(etichettaClasse(k), x + c * 2.8, y, larghezzaColonna - c * 3.2);
  });
}

const RIGA_LEGENDA = 2.2; // altezza di una riga della legenda sulla mappa, in corpi
const altezzaLegenda = (c, tema, contorni) => c * (2 * 1 + 2 + RIGA_LEGENDA * (CLASSI_MAGNITUDO.length + (tema.modo === 'magnitudo' ? 0 : tema.voci.length + 1) + (contorni ? contorni.voci.length + 2 : 0)));

// Elenco degli eventi più forti: magnitudo in una pillola colorata, luogo e data; tante righe quante ne stanno
function pannelloTop(ctx, u, c, r, d) {
  carta(ctx, u, r.x, r.y, r.w, r.h, c * 0.8);
  const p = c, altezzaRiga = c * 1.9;
  const n = Math.min(Math.floor((r.h - 2 * p - c * 1.8) / altezzaRiga), d.top.length);
  intestazione(ctx, c, r.x + p, r.y + p, r.w - 2 * p, tr('stampa.pannello.top', { n: Math.max(n, 0) }));
  if (n < 1) return;
  d.top.slice(0, n).forEach((e, i) => {
    const y = r.y + p + c * 1.8 + i * altezzaRiga + altezzaRiga / 2;
    ctx.fillStyle = coloreMagnitudo(e.mag); ctx.strokeStyle = 'rgba(15,23,42,.45)'; ctx.lineWidth = 0.12;
    ctx.beginPath(); ctx.roundRect(r.x + p, y - c * 0.7, c * 3.2, c * 1.4, c * 0.7); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#111';
    ctx.font = `bold ${c * 0.95}px "Atkinson Hyperlegible", Montserrat, sans-serif`;
    ctx.fillText(formatoMl(e.mag), r.x + p + c * 1.6, y + c * 0.05);
    ctx.textAlign = 'right'; ctx.font = `${c * 0.9}px Montserrat, sans-serif`; ctx.fillStyle = SOFFOCATO;
    const data = dataBreve(e.ts);
    ctx.fillText(data, r.x + r.w - p, y);
    const wData = ctx.measureText(data).width;
    ctx.textAlign = 'left'; ctx.fillStyle = TESTO;
    const wLuogo = r.w - 2 * p - c * 3.2 - c * 0.8 - wData - c * 0.6;
    let fl = c; // il luogo si rimpicciolisce (fino a 0,8 corpi) prima di essere troncato
    ctx.font = `${fl}px Montserrat, sans-serif`;
    while (ctx.measureText(e.luogo || '—').width > wLuogo && fl > c * 0.8) { fl *= 0.97; ctx.font = `${fl}px Montserrat, sans-serif`; }
    ctx.fillText(tronca(ctx, e.luogo || '—', wLuogo), r.x + p + c * 3.2 + c * 0.8, y);
  });
}

const PANNELLI = {
  // `peso` = quota dello spazio in colonna (pagina orizzontale), `pesoFila` = in fila (pagina verticale: l'istogramma ha bisogno di larghezza)
  kpi: { disegna: pannelloKpi, peso: 0.8, pesoFila: 0.8 },
  hero: { disegna: pannelloEvento, peso: 1.5, pesoFila: 1.25 },
  serie: { disegna: pannelloSerie, peso: 1, pesoFila: 2.2 },
  top: { disegna: pannelloTop, peso: 2.4, pesoFila: 1.25 },
};

// Dispone i pannelli nella zona: in colonna con la pagina orizzontale, in fila con la pagina verticale. I riquadri dei dati hanno
// l'altezza che serve ai tre numeri (in colonna); gli altri si dividono il resto in proporzione al loro peso
function disponiPannelli(ctx, u, g, el, d) {
  const chiavi = g.pannelli.filter(k => k !== 'top' || el.elenco);
  const gap = g.c;
  const fissa = k => (g.orizzontale && k === 'kpi' ? g.c * 17 : null);
  const spazio = (g.orizzontale ? g.zona.h : g.zona.w) - gap * (chiavi.length - 1) - chiavi.reduce((t, k) => t + (fissa(k) ?? 0), 0);
  const peso = k => (g.orizzontale ? PANNELLI[k].peso : PANNELLI[k].pesoFila);
  const totale = chiavi.reduce((t, k) => t + (fissa(k) == null ? peso(k) : 0), 0);
  let pos = g.orizzontale ? g.zona.y : g.zona.x;
  for (const k of chiavi) {
    const misura = fissa(k) ?? spazio * peso(k) / totale;
    const r = g.orizzontale ? { x: g.zona.x, y: pos, w: g.zona.w, h: misura } : { x: pos, y: g.zona.y, w: misura, h: g.zona.h };
    PANNELLI[k].disegna(ctx, u, g.c, r, d);
    pos += misura + gap;
  }
}

// Piede: fonte dei dati, crediti e attribuzioni a sinistra, avvertenza a destra. Non può mancare né uscire dal piede: se le righe non
// ci stanno, il corpo si riduce finché entrano (minimo 0,4× corpo)
function disegnaPiede(ctx, g, opzioni, data) {
  const { c, b, piede } = g;
  const pc = Boolean(opzioni.protezioneCivile);
  ctx.fillStyle = '#f1f5f9'; ctx.fillRect(piede.x, piede.y, piede.w, piede.h);
  ctx.strokeStyle = '#d0d7de'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(0, piede.y); ctx.lineTo(piede.w, piede.y); ctx.stroke();
  const gap = c * 2, wCol = (piede.w - 2 * b - gap) / 2;
  const attribuzioni = (opzioni.attribuzioni ?? []).filter(a => pc || !/protezione civile/i.test(a));
  const intro = [tr(pc ? 'stampa.poster.fonteDatiPc' : 'stampa.poster.fonteDati'), tr('stampa.poster.realizzazione', { data }), URL_APP];
  const avvertenza = tr(pc ? 'stampa.poster.avvertenzaPc' : 'stampa.poster.avvertenza');
  const utile = piede.h - c * 1.0;
  let fs = c * 0.72, col1, col2;
  for (;;) {
    ctx.font = `${fs}px Montserrat, sans-serif`;
    col1 = [...intro, ...spezzaRighe(ctx, attribuzioni.join(' · '), wCol)];
    ctx.font = `italic ${fs}px Montserrat, sans-serif`;
    col2 = spezzaRighe(ctx, avvertenza, wCol);
    if (Math.max(col1.length, col2.length) * fs * 1.36 <= utile || fs <= c * 0.4) break;
    fs *= 0.94;
  }
  const lh = fs * 1.36;
  const colonna = (righe, x, grassetto) => righe.forEach((riga, i) => {
    ctx.font = `${grassetto && i < 3 ? 'bold ' : ''}${grassetto ? '' : 'italic '}${fs}px Montserrat, sans-serif`;
    ctx.fillStyle = grassetto && i >= 3 ? SOFFOCATO : TESTO;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(riga, x, piede.y + (piede.h - righe.length * lh) / 2 + lh / 2 + i * lh, wCol);
  });
  colonna(col1, b, true);
  colonna(col2, b + wCol + gap, false);
}

// Barra di scala compatta nell'angolo in basso a sinistra della mappa
function disegnaScala(ctx, u, c, m, vista) {
  const reale = scalaDaZoom(vista.zoom, vista.centro.lat);
  const b = barraScala(reale, 60);
  const h = c * 3.4, margine = c * 1.3;
  const x = m.x + margine, y = m.y + m.altezza - margine - h;
  carta(ctx, u, x, y, b.mm + c * 8, h, c * 0.7);
  const bx = x + c * 1.2, by = y + c * 1.5, sp = c * 0.5, segmenti = 4;
  for (let i = 0; i < segmenti; i++) { ctx.fillStyle = i % 2 ? '#fff' : TESTO; ctx.fillRect(bx + i * b.mm / segmenti, by, b.mm / segmenti, sp); }
  ctx.strokeStyle = TESTO; ctx.lineWidth = 0.15; ctx.strokeRect(bx, by, b.mm, sp);
  ctx.fillStyle = TESTO; ctx.font = `${c * 0.8}px Montserrat, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  const km = b.metri >= 1000, div = km ? 1000 : 1;
  ctx.fillText('0', bx, by - c * 0.2);
  ctx.fillText(`${(b.metri / div).toLocaleString(localeIntl())} ${km ? 'km' : 'm'}`, bx + b.mm, by - c * 0.2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = SOFFOCATO; ctx.font = `bold ${c * 0.85}px Montserrat, sans-serif`;
  const cifre = 10 ** (Math.floor(Math.log10(reale)) - 1);
  ctx.fillText(`1:${(Math.round(reale / cifre) * cifre).toLocaleString(localeIntl())}`, bx, by + sp + c * 0.9);
  return y; // bordo alto della scala: la legenda si appoggia sopra
}

// Disegna un layout a pannelli sulla pagina `canvas` (stessa interfaccia di disegnaPoster)
export function disegnaPannelli(canvas, opzioni) {
  const { pagina, formato, direzione, layout, titolo, sottotitolo, logo, data, mappa, vista } = opzioni;
  const el = { legenda: true, scala: true, rosa: true, griglia: true, ml: true, elenco: true, ...opzioni.elementi };
  const d = { ...DATI_VUOTI, ...opzioni.dati };
  const g = geometriaLayout(layout, formato, direzione);
  const { c, L, A, mappa: m } = g;
  const ctx = canvas.getContext('2d');
  const u = canvas.width / pagina.larghezza;
  ctx.save();
  ctx.scale(u, u);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, L, A);

  // Mappa con graticola, stelle e magnitudo dei più forti
  if (mappa?.immagine) {
    const r = mappa.ritaglio;
    if (r) ctx.drawImage(mappa.immagine, r.x, r.y, r.w, r.h, m.x, m.y, m.larghezza, m.altezza);
    else ctx.drawImage(mappa.immagine, m.x, m.y, m.larghezza, m.altezza);
  }
  const proj = proiettore(vista.centro, vista.zoom, m);
  cornice(ctx, m, proj, c, el.griglia, mappa?.immagine ? luminosita(mappa.immagine, mappa.ritaglio) < 120 : false);
  disegnaStelle(ctx, m, proj, opzioni.stelle ?? [], vista.zoom, c);
  if (el.ml) disegnaMl(ctx, m, proj, opzioni.forti ?? [], vista.zoom, c);
  if (el.rosa) roseDeiVenti(ctx, u, m.x + m.larghezza - c * 1.3 - c * 2.6, m.y + c * 1.3 + c * 4, c * 1.9);
  const sopraScala = el.scala ? disegnaScala(ctx, u, c, m, vista) : m.y + m.altezza - c * 1.3;
  if (el.legenda) {
    const tema = scalaTema(), contorni = legendaContorni(opzioni.evento);
    let w = c * 17.5, h = altezzaLegenda(c, tema, contorni);
    const disponibile = sopraScala - c * 0.9 - (m.y + c * 1.3);
    if (h > disponibile) { // con i contorni ShakeMap la colonna è troppo alta: due colonne
      const nBase = CLASSI_MAGNITUDO.length + (tema.modo === 'magnitudo' ? 0 : tema.voci.length + 1);
      w = c * 33; h = c * (4 + RIGA_LEGENDA * Math.max(nBase, contorni ? contorni.voci.length + 2 : 0));
    }
    pannelloLegenda(ctx, u, c, { x: m.x + c * 1.3, y: sopraScala - c * 0.9 - h, w, h }, tema, contorni);
  }

  // Testata
  const gb = ctx.createLinearGradient(0, 0, L, 0);
  gb.addColorStop(0, '#093a5c'); gb.addColorStop(0.55, BLU); gb.addColorStop(1, '#2a8fc4');
  ctx.fillStyle = gb; ctx.fillRect(0, 0, L, g.testata);
  ctx.fillStyle = '#f5a623'; ctx.fillRect(0, g.testata - c * 0.3, L, c * 0.3);
  const hT = g.testata - c * 0.3;
  let xTit = c * 1.5;
  if (logo) {
    const hl = hT - c * 1.2, wl = hl * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, c * 1.5, (hT - hl) / 2, wl, hl);
    xTit += wl + c * 1.2;
  }
  ctx.fillStyle = '#f5a623'; ctx.fillRect(xTit, c, c * 0.35, hT - 2 * c);
  xTit += c * 1.1;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${hT * 0.36}px Montserrat, sans-serif`;
  ctx.fillText(titolo, xTit, hT * 0.4, L - xTit - c * 1.5);
  ctx.font = `${hT * 0.2}px Montserrat, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillText(sottotitolo, xTit, hT * 0.76, L - xTit - c * 1.5);

  disponiPannelli(ctx, u, g, el, d);
  disegnaPiede(ctx, g, opzioni, data);

  // Filetto esterno della pagina
  ctx.strokeStyle = BLU; ctx.lineWidth = 0.6; ctx.strokeRect(0.3, 0.3, L - 0.6, A - 0.6);
  ctx.restore();
}
