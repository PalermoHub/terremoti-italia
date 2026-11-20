// Blocchi in sovraimpressione della stampa, pensati per lasciare la mappa quasi tutta libera: la minimappa dell'Italia in alto a sinistra
// e, in basso a sinistra, un'unica scheda compatta con la legenda (a righe orizzontali: magnitudo, scala del colore, contorni ShakeMap)
// e la barra di scala. Le misure sono in mm; `c` = corpo del testo.
import { t as tr, localeIntl } from './i18n.js';
import { CLASSI_MAGNITUDO } from './magnitudo.js';
import { barraScala, scalaDaZoom } from './stampa.js';
import { BLU, MM_PX_CSS, carta, pallino, stella, scalaTema, legendaContorni } from './stampa-poster.js';
import { disegnaMinimappa, minimappaPronta } from './stampa-minimappa.js';

const TESTO = '#1e293b';
const SOFFOCATO = '#475569';
const FONT = 'Montserrat, sans-serif';
export const LARGHEZZA_MINI = 9; // in corpi
export const ALTEZZA_MINI = 11.25;
const SCALA_DI_PROVA = { mm: 30, estremo: '250 km', rapporto: '1:7.900.000' };

const breve = k => (k.a === Infinity ? `≥ ${k.da}` : k.chiave === 'fino2' ? `< ${k.a}` : `${k.da}–${k.a}`);

// — voci della legenda: ognuna ha la larghezza `w` e sa disegnarsi con il centro verticale in `y` —
function voceClasse(ctx, c, k, colorata) {
  ctx.font = `${c * 0.85}px ${FONT}`;
  const testo = breve(k), slot = c * 1.8;
  const proporzione = Math.min(1.1, c * 0.8 / (14 * MM_PX_CSS)); // il cerchio più grande (14 px) sta in 0,8 corpi
  return {
    w: slot + c * 0.3 + ctx.measureText(testo).width,
    disegna(g, x, y) {
      const r = k.raggio * MM_PX_CSS * proporzione, cx = x + slot / 2;
      if (k.a === Infinity) {
        stella(g, cx, y, Math.max(r * 1.25, c * 0.6));
        g.fillStyle = colorata ? k.colore : '#94a3b8'; g.strokeStyle = TESTO; g.lineWidth = 0.2; g.fill(); g.stroke();
      } else if (colorata) pallino(g, cx, y, r, '#fff', k.colore, TESTO);
      else pallino(g, cx, y, r, '#f8fafc', '#94a3b8', SOFFOCATO);
      g.font = `${c * 0.85}px ${FONT}`; g.fillStyle = TESTO; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(testo, x + slot + c * 0.3, y);
    },
  };
}

function voceChip(ctx, c, v) {
  ctx.font = `${c * 0.85}px ${FONT}`;
  return {
    w: c * 1.8 + ctx.measureText(v.testo).width,
    disegna(g, x, y) {
      g.fillStyle = v.colore; g.beginPath(); g.roundRect(x, y - c * 0.35, c * 1.5, c * 0.7, c * 0.35); g.fill();
      g.strokeStyle = 'rgba(15,23,42,.35)'; g.lineWidth = 0.1; g.stroke();
      g.font = `${c * 0.85}px ${FONT}`; g.fillStyle = TESTO; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(v.testo, x + c * 1.8, y);
    },
  };
}

function voceLinea(ctx, c, v) {
  ctx.font = `${c * 0.85}px ${FONT}`;
  return {
    w: c * 2.1 + ctx.measureText(v.testo).width,
    disegna(g, x, y) {
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(31,42,68,.55)'; g.lineWidth = c * 0.45; g.beginPath(); g.moveTo(x + c * 0.2, y); g.lineTo(x + c * 1.6, y); g.stroke();
      g.strokeStyle = v.colore; g.lineWidth = c * 0.27; g.beginPath(); g.moveTo(x + c * 0.2, y); g.lineTo(x + c * 1.6, y); g.stroke();
      g.font = `${c * 0.85}px ${FONT}`; g.fillStyle = TESTO; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(v.testo, x + c * 2.1, y);
    },
  };
}

// Scala grafica dalla vista: lunghezza della barra, etichetta dell'estremo e rapporto («1:7.900.000»)
function datiScala(c, vista) {
  const reale = scalaDaZoom(vista.zoom, vista.centro.lat);
  const b = barraScala(reale, Math.min(45, c * 13));
  const cifre = 10 ** (Math.floor(Math.log10(reale)) - 1);
  const km = b.metri >= 1000, div = km ? 1000 : 1;
  return { mm: b.mm, estremo: `${(b.metri / div).toLocaleString(localeIntl())} ${km ? 'km' : 'm'}`, rapporto: `1:${(Math.round(reale / cifre) * cifre).toLocaleString(localeIntl())}` };
}

// Dispone la scheda in una larghezza massima `wMax`: ritorna larghezza, altezza e le sezioni già impaginate in righe
function misura(ctx, c, wMax, el, tema, contorni, scala) {
  const pad = c * 0.9, riga = c * 1.9, gap = c * 1.1;
  const sezioni = [];
  if (el.legenda) {
    sezioni.push({ titolo: tr('terremoti.ev.magnitudo'), voci: CLASSI_MAGNITUDO.map(k => voceClasse(ctx, c, k, tema.modo === 'magnitudo')) });
    if (tema.modo !== 'magnitudo' && tema.voci.length) sezioni.push({ titolo: tema.nome, voci: tema.voci.map(v => voceChip(ctx, c, v)) });
    if (contorni) sezioni.push({ titolo: contorni.titolo, voci: contorni.voci.map(v => voceLinea(ctx, c, v)), nota: contorni.evento.riga1 });
  }
  ctx.font = `bold ${c * 0.8}px ${FONT}`;
  const wTitolo = sezioni.length ? Math.min(Math.max(...sezioni.map(s => ctx.measureText(s.titolo.toUpperCase()).width)) + c * 0.8, (wMax - 2 * pad) * 0.42) : 0;
  const utile = Math.max(c * 6, wMax - 2 * pad - wTitolo);
  for (const s of sezioni) {
    s.righe = [[]];
    let x = 0;
    for (const v of s.voci) {
      if (x > 0 && x + v.w > utile) { s.righe.push([]); x = 0; }
      s.righe.at(-1).push(v); x += v.w + gap;
    }
    s.wRiga = Math.max(...s.righe.map(r => r.reduce((t, v) => t + v.w, 0) + gap * (r.length - 1)));
    s.h = s.righe.length * riga + (s.nota ? c * 1.3 : 0);
  }
  let wScala = 0;
  if (scala) {
    ctx.font = `${c * 0.8}px ${FONT}`; const we = ctx.measureText(scala.estremo).width;
    ctx.font = `bold ${c * 0.85}px ${FONT}`; const wr = ctx.measureText(scala.rapporto).width;
    scala.wEstremo = we;
    wScala = scala.mm + we / 2 + c * 0.8 + wr;
  }
  const naturale = 2 * pad + Math.max(sezioni.length ? wTitolo + Math.max(...sezioni.map(s => s.wRiga)) : 0, wScala);
  const w = Math.min(wMax, naturale);
  const hScala = scala ? c * 2.8 : 0;
  const separatori = (sezioni.length + (scala ? 1 : 0) - 1) * c * 0.3;
  return { w, h: 2 * pad + sezioni.reduce((t, s) => t + s.h, 0) + hScala + Math.max(0, separatori), pad, riga, gap, wTitolo, sezioni, scala, hScala };
}

// Altezza che la scheda occupa in fondo alla mappa (serve all'inquadratura per non coprire gli eventi)
export function altezzaBlocchiBassi(c, wMax, el = { legenda: true, scala: true }) {
  if (typeof document === 'undefined') return c * 10;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    return misura(ctx, c, wMax, el, scalaTema(), legendaContorni(null), el.scala ? SCALA_DI_PROVA : null).h;
  } catch { return c * 10; }
}

// Larghezza massima della scheda: mai oltre il 62% della mappa e mai sotto l'elenco degli eventi (se c'è)
export const larghezzaMassimaLegenda = (mappaL, c, riservaDestra = 0) => Math.min(mappaL * 0.62, mappaL - 2 * c * 1.3 - riservaDestra);

// Disegna minimappa e scheda sulla mappa `m` ({ x, y, larghezza, altezza }); ritorna i riquadri occupati
// `proj` = proiettore della vista, `el` = elementi accesi, `evento` = evento dei contorni ShakeMap, `riservaDestra` = fascia a destra già occupata
export function disegnaBlocchi(ctx, u, c, m, proj, vista, el, { evento, minimappa }, riservaDestra = 0) {
  const occupati = [];
  const margine = c * 1.3;
  if (el.minimappa !== false) {
    const w = c * LARGHEZZA_MINI, h = c * ALTEZZA_MINI, x = m.x + margine, y = m.y + margine;
    carta(ctx, u, x - c * 0.35, y - c * 0.35, w + c * 0.7, h + c * 0.7, c * 0.6);
    disegnaMinimappa(ctx, x, y, w, h, minimappa ?? minimappaPronta(), { ovest: proj.lng(0), est: proj.lng(m.larghezza), nord: proj.lat(0), sud: proj.lat(m.altezza) }, c * 0.4);
    occupati.push({ x: x - c * 0.35, y: y - c * 0.35, w: w + c * 0.7, h: h + c * 0.7 });
  }
  if (!el.legenda && !el.scala) return occupati;
  const scala = el.scala ? datiScala(c, vista) : null;
  const mis = misura(ctx, c, larghezzaMassimaLegenda(m.larghezza, c, riservaDestra), el, el.legenda ? scalaTema() : { modo: '', voci: [] }, el.legenda ? legendaContorni(evento) : null, scala);
  const x = m.x + margine, y = m.y + m.altezza - margine - mis.h;
  carta(ctx, u, x, y, mis.w, mis.h, c * 0.8);
  occupati.push({ x, y, w: mis.w, h: mis.h });
  let yy = y + mis.pad;
  const filo = () => { ctx.strokeStyle = 'rgba(15,23,42,.18)'; ctx.lineWidth = 0.12; ctx.beginPath(); ctx.moveTo(x + mis.pad, yy + c * 0.15); ctx.lineTo(x + mis.w - mis.pad, yy + c * 0.15); ctx.stroke(); yy += c * 0.3; };
  mis.sezioni.forEach((s, i) => {
    if (i) filo();
    ctx.font = `bold ${c * 0.8}px ${FONT}`; ctx.fillStyle = BLU; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(s.titolo.toUpperCase(), x + mis.pad, yy + mis.riga / 2, mis.wTitolo - c * 0.8);
    s.righe.forEach((riga, j) => {
      let xv = x + mis.pad + mis.wTitolo;
      riga.forEach(v => { v.disegna(ctx, xv, yy + j * mis.riga + mis.riga / 2); xv += v.w + mis.gap; });
    });
    if (s.nota) {
      ctx.font = `italic ${c * 0.75}px ${FONT}`; ctx.fillStyle = SOFFOCATO; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(s.nota, x + mis.pad + mis.wTitolo, yy + s.righe.length * mis.riga + c * 0.45, mis.w - 2 * mis.pad - mis.wTitolo);
    }
    yy += s.h;
  });
  if (scala) {
    if (mis.sezioni.length) filo();
    const bx = x + mis.pad, by = yy + c * 1.3, sp = c * 0.5;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#fff' : TESTO; ctx.fillRect(bx + i * scala.mm / 4, by, scala.mm / 4, sp); }
    ctx.strokeStyle = TESTO; ctx.lineWidth = 0.15; ctx.strokeRect(bx, by, scala.mm, sp);
    ctx.fillStyle = TESTO; ctx.font = `${c * 0.8}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('0', bx, by - c * 0.2); ctx.fillText(scala.estremo, bx + scala.mm, by - c * 0.2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = SOFFOCATO; ctx.font = `bold ${c * 0.85}px ${FONT}`;
    ctx.fillText(scala.rapporto, bx + scala.mm + scala.wEstremo / 2 + c * 0.8, by + sp / 2, mis.w - 2 * mis.pad - scala.mm);
  }
  return occupati;
}
