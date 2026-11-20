// Minimappa dell'Italia per la stampa: i confini dei comuni e delle regioni (sagome SVG) resi una volta sola su una tela,
// e il rettangolo dell'area stampata disegnato sopra. L'immagine resta in memoria: l'anteprima la riusa a ogni ridisegno.

// L'Italia con un margine (isole minori comprese): rapporto larghezza/altezza in Mercator ≈ 0,8
export const ESTENSIONE = { ovest: 5.5, est: 19.5, sud: 35, nord: 48 };
const PX = { l: 560, a: 700 };

let promessa = null;
let pronta = null;

// Immagine già resa (o null): serve all'anteprima, che non può aspettare
export const minimappaPronta = () => pronta;

const mercX = lng => (lng + 180) / 360;
const mercY = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const fx = lng => (mercX(lng) - mercX(ESTENSIONE.ovest)) / (mercX(ESTENSIONE.est) - mercX(ESTENSIONE.ovest));
const fy = lat => (mercY(lat) - mercY(ESTENSIONE.nord)) / (mercY(ESTENSIONE.sud) - mercY(ESTENSIONE.nord));

// Disegna le sagome SVG dei comuni e delle regioni (img/italia-comuni.json, da scripts/minimappa_italia.py) su una tela
async function cattura() {
  if (typeof document === 'undefined') return null;
  const risposta = await fetch('img/italia-comuni.json');
  if (!risposta.ok) throw new Error(`img/italia-comuni.json: ${risposta.status}`); // i18n-ok: messaggio solo per la console
  const dati = await risposta.json();
  const tela = Object.assign(document.createElement('canvas'), { width: PX.l, height: PX.a });
  const g = tela.getContext('2d');
  g.fillStyle = '#dbe7f0'; g.fillRect(0, 0, PX.l, PX.a);
  g.scale(PX.l / dati.w, PX.a / dati.h);
  const comuni = new Path2D(dati.comuni), regioni = new Path2D(dati.regioni);
  g.fillStyle = '#f7f5ee'; g.fill(comuni);
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(123,135,148,.75)'; g.lineWidth = 0.3; g.stroke(comuni); // confini comunali
  g.strokeStyle = '#334155'; g.lineWidth = 0.9; g.stroke(regioni); // confini regionali, più marcati
  return tela;
}

// Avvia (una sola volta) la resa della minimappa; se fallisce resta il fondo piano e si riprova alla prossima richiesta
export function caricaMinimappa() {
  promessa ??= cattura().then(img => { pronta = img; return img; }, e => { console.warn('Minimappa non disponibile', e); promessa = null; return null; }); // i18n-ok: messaggio solo per la console
  return promessa;
}

// Disegna la minimappa nel riquadro (x, y, w, h) in mm e, sopra, l'area stampata `area` = { ovest, est, sud, nord } in gradi
export function disegnaMinimappa(ctx, x, y, w, h, img, area, raggio = 1) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, raggio); ctx.clip();
  if (img) ctx.drawImage(img, x, y, w, h);
  else { ctx.fillStyle = '#e8eef3'; ctx.fillRect(x, y, w, h); }
  const limita = (v, da, a) => Math.min(a, Math.max(da, v));
  let x0 = limita(x + w * fx(area.ovest), x, x + w), x1 = limita(x + w * fx(area.est), x, x + w);
  let y0 = limita(y + h * fy(area.nord), y, y + h), y1 = limita(y + h * fy(area.sud), y, y + h);
  const minimo = 0.9; // un'area minuscola resta visibile
  if (x1 - x0 < minimo) { const m = (x0 + x1) / 2; x0 = m - minimo / 2; x1 = m + minimo / 2; }
  if (y1 - y0 < minimo) { const m = (y0 + y1) / 2; y0 = m - minimo / 2; y1 = m + minimo / 2; }
  ctx.fillStyle = 'rgba(220,38,38,.16)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 0.45; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}
