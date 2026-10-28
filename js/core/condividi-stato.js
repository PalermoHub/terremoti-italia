import { FILTRO_INIZIALE, PROFONDITA, CLASSI_MAG } from '../layers/scheda-terremoti.js';

// Indirizzo condivisibile: ricostruisce quello che l'utente vede. La vista della mappa sta nell'hash (MapLibre),
// la scheda aperta in `scheda`/`tab` (scheda.js); qui si aggiungono strati accesi, filtri dei terremoti, tema e lingua.
const LINGUE = ['it', 'en'];
const num = v => (v == null || v === '' ? null : Number(v));
const finito = v => (Number.isFinite(v) ? v : null);

// Stato corrente → parametri della query. Solo ciò che differisce dall'avvio, tranne gli strati (sempre scritti: spenti = assenti)
// Territorio {reg, prov, com} ↔ «12.58.58091»: i livelli sono a cascata, quindi basta il prefisso
const codificaTerritorio = a => [a.reg, a.prov, a.com].filter(x => x != null).join('.');
function decodificaTerritorio(v) {
  const n = v?.split('.').map(Number);
  if (!n?.length || n.length > 3 || !n.every(Number.isInteger)) return null;
  return { reg: n[0], prov: n[1] ?? null, com: n[2] ?? null };
}
const codificaPeriodo = p => `${p.da}-${p.a}`;
function decodificaPeriodo(v) {
  const n = v?.split('-').map(Number);
  return n?.length === 2 && n.every(Number.isFinite) ? { da: n[0], a: n[1] } : null;
}

export function codificaStato({ strati, filtro: f, tema, lingua, opacita = {}, storico = null, confronto = null, area = null }) {
  const p = new URLSearchParams();
  p.set('strati', strati.join(','));
  if (lingua) p.set('lng', lingua);
  p.set('tema', tema === 'scuro' ? 'scuro' : 'chiaro');
  const I = FILTRO_INIZIALE;
  if (f.giorni !== I.giorni) p.set('gg', String(f.giorni));
  if (f.magMin !== I.magMin) p.set('magmin', String(f.magMin));
  if (f.magMax != null) p.set('magmax', String(f.magMax));
  const prof = PROFONDITA.find(x => x.min === f.profMin && x.max === f.profMax);
  if (prof && prof.chiave !== 'tutte') p.set('prof', prof.chiave);
  if (f.classi) p.set('cl', [...f.classi].sort((a, b) => a - b).join('.'));
  if (f.finestra) p.set('fin', f.finestra.join('-'));
  if (f.periodo) p.set('per', `${f.periodo.da}-${f.periodo.a}`);
  const op = Object.entries(opacita).filter(([, v]) => v !== 1).map(([id, v]) => `${id}:${v}`);
  if (op.length) p.set('op', op.join(','));
  if (storico) p.set('sto', codificaPeriodo(storico));
  if (confronto) {
    p.set('ca', codificaPeriodo(confronto.a));
    p.set('cb', codificaPeriodo(confronto.b));
    p.set('cmag', String(confronto.mag));
    p.set('cprof', confronto.prof);
    if (confronto.territorio) p.set('ct', codificaTerritorio(confronto.territorio));
  }
  if (area) {
    p.set('area', codificaTerritorio(area));
    if (area.soloEventi) p.set('solo', '1');
  }
  return p;
}

// Query → stato. Valori non validi vengono ignorati, mai applicati a metà
export function decodificaStato(search) {
  const p = new URLSearchParams(search);
  const fin = p.get('fin')?.split('-').map(Number);
  const per = p.get('per')?.split('-').map(Number);
  const cl = p.get('cl')?.split('.').map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < CLASSI_MAG.length);
  const prof = PROFONDITA.find(x => x.chiave === p.get('prof'));
  const f = {};
  if (finito(num(p.get('gg')))) f.giorni = num(p.get('gg'));
  if (finito(num(p.get('magmin')))) f.magMin = num(p.get('magmin'));
  if (finito(num(p.get('magmax')))) f.magMax = num(p.get('magmax'));
  if (prof) { f.profMin = prof.min; f.profMax = prof.max; }
  if (cl?.length && cl.length < CLASSI_MAG.length) f.classi = new Set(cl);
  if (fin?.length === 2 && fin.every(Number.isFinite)) f.finestra = fin;
  if (per?.length === 2 && per.every(Number.isFinite)) f.periodo = { da: per[0], a: per[1] };
  const opacita = Object.fromEntries((p.get('op') ?? '').split(',').map(x => x.split(':')).filter(([id, v]) => id && Number.isFinite(Number(v)) && v !== '').map(([id, v]) => [id, Math.min(1, Math.max(0, Number(v)))]));
  const ca = decodificaPeriodo(p.get('ca')), cb = decodificaPeriodo(p.get('cb'));
  const cprof = PROFONDITA.find(x => x.chiave === p.get('cprof'));
  const cmag = p.get('cmag') === null ? NaN : Number(p.get('cmag'));
  const area = decodificaTerritorio(p.get('area'));
  return {
    opacita: Object.keys(opacita).length ? opacita : null,
    storico: decodificaPeriodo(p.get('sto')),
    confronto: ca && cb && cprof && Number.isFinite(cmag) ? { a: ca, b: cb, mag: cmag, prof: cprof.chiave, territorio: decodificaTerritorio(p.get('ct')) } : null,
    area: area && { ...area, soloEventi: p.get('solo') === '1' },
    strati: p.has('strati') ? p.get('strati').split(',').filter(Boolean) : null,
    lingua: LINGUE.includes(p.get('lng')) ? p.get('lng') : null,
    tema: ['scuro', 'chiaro'].includes(p.get('tema')) ? p.get('tema') : null,
    filtro: Object.keys(f).length ? f : null,
  };
}
