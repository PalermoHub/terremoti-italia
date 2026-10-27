import { URL_ARCHIVIO, CLASSI_MAG, classeMagnitudo, marcaSciami, momentoSismico, magnitudoDaMomento } from './scheda-terremoti.js';

// Modello puro dell'archivio storico: periodi (anni UTC), serie annuale e confronto tra due periodi, a partire dai riepiloghi di GET /terremoti/riepilogo.
export const ANNO_INIZIO = 1985;
const GIORNO_MS = 86400000;

export const periodoAnno = anno => ({ da: Date.UTC(anno, 0, 1), a: Date.UTC(anno + 1, 0, 1) - 1 });

// null = periodo valido; altrimenti la chiave i18n dell'errore
export function periodoValido({ da, a }, adesso = Date.now()) {
  if (da > a) return 'terremoti.arc.errInvertito';
  if (da < periodoAnno(ANNO_INIZIO).da) return 'terremoti.arc.errPrima';
  if (da > adesso) return 'terremoti.arc.errFuturo';
  return null;
}

export const riepilogoVuoto = () => ({ totale: 0, perMagnitudo: [], perMese: [] });

// Serie «per anno» dal 1985: stessa forma di serieEventi, con gli anni senza eventi a zero.
// Gli eventi stanno nell'anno del loro mese UTC; i confini delle barre sono anni locali, perché le etichette (etichettaBarra, periodoSequenza) formattano in ora locale
export function serieAnnuale(perMese, adesso = Date.now()) {
  const ultimo = new Date(adesso).getUTCFullYear();
  const barre = [];
  for (let anno = ANNO_INIZIO; anno <= ultimo; anno++) barre.push({ da: new Date(anno, 0, 1).getTime(), a: new Date(anno + 1, 0, 1).getTime(), n: 0, magMax: null, sciame: false });
  for (const m of perMese) {
    const b = barre[Number(String(m.mese).slice(0, 4)) - ANNO_INIZIO];
    if (!b) continue;
    b.n += m.n;
    if (b.magMax == null || m.magMax > b.magMax) b.magMax = m.magMax;
  }
  const { sequenze, soglia } = marcaSciami(barre);
  return { unita: 'anno', barre, sequenze, soglia, totale: barre.reduce((s, b) => s + b.n, 0) };
}

function statistiche(r, giorni) {
  const perClasse = Array(CLASSI_MAG.length).fill(0);
  let momento = 0, magMax = null;
  for (const { mag, n } of r.perMagnitudo) {
    perClasse[classeMagnitudo(mag)] += n;
    momento += momentoSismico(mag) * n;
    if (magMax == null || mag > magMax) magMax = mag;
  }
  return { n: r.totale, magMax, perGiorno: r.totale / giorni, perClasse, magEquivalente: r.totale ? magnitudoDaMomento(momento) : null };
}

// Confronto tra due riepiloghi; `giorni*` = giorni davvero trascorsi nel periodo (un anno in corso è parziale)
export function confrontaPeriodi(a, b, giorniA, giorniB) {
  const sa = statistiche(a, giorniA), sb = statistiche(b, giorniB);
  return {
    a: sa, b: sb,
    differenza: {
      n: sb.n - sa.n,
      nPercento: sa.n ? (sb.n - sa.n) / sa.n * 100 : null,
      magMax: sa.magMax != null && sb.magMax != null ? Math.round((sb.magMax - sa.magMax) * 10) / 10 : null,
      perGiorno: sa.n ? sb.perGiorno - sa.perGiorno : null,
    },
  };
}

// Riepilogo (stessa forma di GET /terremoti/riepilogo) calcolato dagli eventi già scaricati: serve quando il confronto è ristretto a un territorio
export function riepilogoDaEventi(eventi) {
  const perMag = new Map(), perMese = new Map();
  for (const { mag, ts } of eventi) {
    const m = Math.round(mag * 10) / 10;
    perMag.set(m, (perMag.get(m) ?? 0) + 1);
    const mese = new Date(ts).toISOString().slice(0, 7);
    const v = perMese.get(mese) ?? { mese, n: 0, magMax: mag };
    v.n++;
    if (mag > v.magMax) v.magMax = mag;
    perMese.set(mese, v);
  }
  return { totale: eventi.length, perMagnitudo: [...perMag].map(([mag, n]) => ({ mag, n })).sort((a, b) => a.mag - b.mag), perMese: [...perMese.values()].sort((a, b) => a.mese.localeCompare(b.mese)) };
}

// Giorni trascorsi di un periodo fino ad adesso (almeno 1)
export const giorniPeriodo = ({ da, a }, adesso = Date.now()) => Math.max(1, Math.ceil((Math.min(a, adesso) - da) / GIORNO_MS));

// Senza server: i riepiloghi statici dell'intera storia (riepilogo-M.json, M = 2…5) ristretti al periodo, a mesi interi.
// La magnitudo minima si porta al riepilogo più vicino; la mappa per magnitudo è dello stesso file e si restringe per classe.
export const MAGNITUDO_RIEPILOGHI = [2, 3, 4, 5];
export function riepilogoDaStatico(dati, { da, a }, magMin) {
  const mese = ts => new Date(ts).toISOString().slice(0, 7);
  const [dal, al] = [mese(da), mese(a)];
  const perMese = (dati.perMese ?? []).filter(m => m.mese >= dal && m.mese <= al);
  const perMagnitudo = (dati.perMagnitudo ?? []).filter(m => m.mag >= magMin);
  return { totale: perMese.reduce((s, m) => s + m.n, 0), perMagnitudo, perMese };
}

// Riepilogo dell'archivio (conteggi per magnitudo e per mese) di un periodo, dal server o, se manca, dai file statici
export async function scaricaRiepilogo(periodo, magMin, fetchFn = fetch) {
  const q = new URLSearchParams({ da: String(periodo.da), a: String(periodo.a), magmin: String(magMin) });
  const r = await fetchFn(`/terremoti/riepilogo?${q}`).catch(() => null);
  if (r?.ok) return r.json();
  const m = MAGNITUDO_RIEPILOGHI.findLast(v => v <= magMin) ?? MAGNITUDO_RIEPILOGHI[0];
  const s = await fetchFn(`${URL_ARCHIVIO}riepilogo-${m}.json`).catch(() => null);
  if (!s?.ok) throw new Error(`archivio ${s?.status ?? r?.status ?? 'non raggiungibile'}`);
  return riepilogoDaStatico(await s.json(), periodo, magMin);
}
