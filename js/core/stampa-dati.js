// Dati dei pannelli dei layout di stampa (riquadri, evento più forte, elenco, serie), calcolati dagli eventi in elenco:
// stessi eventi e stesso filtro (periodo, magnitudo) della mappa, nessuna richiesta al server.
import { localeIntl } from './i18n.js';

const GIORNO = 86400000;

const mediana = valori => {
  if (!valori.length) return null;
  const v = [...valori].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Raggruppa i tempi in colonne: per giorno fino a 45 giorni di estensione, per mese fino a 36 mesi, altrimenti per anno (UTC come gli altri periodi)
export function serieEventi(tempi) {
  if (!tempi.length) return { unita: 'giorno', serie: [] };
  const min = Math.min(...tempi), max = Math.max(...tempi);
  const giorni = Math.floor((max - min) / GIORNO) + 1;
  const unita = giorni <= 45 ? 'giorno' : giorni <= 1100 ? 'mese' : 'anno';
  const chiave = ts => { const d = new Date(ts); return unita === 'giorno' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : unita === 'mese' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) : Date.UTC(d.getUTCFullYear(), 0, 1); };
  const avanti = ts => { const d = new Date(ts); return unita === 'giorno' ? ts + GIORNO : unita === 'mese' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) : Date.UTC(d.getUTCFullYear() + 1, 0, 1); };
  const conteggi = new Map();
  tempi.forEach(ts => conteggi.set(chiave(ts), (conteggi.get(chiave(ts)) ?? 0) + 1));
  const opzioni = unita === 'giorno' ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : unita === 'mese' ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { year: 'numeric', timeZone: 'UTC' };
  const serie = [];
  for (let k = chiave(min); k <= chiave(max); k = avanti(k)) serie.push({ etichetta: new Date(k).toLocaleDateString(localeIntl(), opzioni), n: conteggi.get(k) ?? 0 });
  return { unita, serie };
}

// `eventi` = elementi { mag, prof, ts, luogo }; `quanti` = lunghezza massima dell'elenco dei più forti
export function datiPannelli(eventi, quanti = 30) {
  const validi = eventi.filter(e => Number.isFinite(e.mag));
  const ordinati = [...validi].sort((a, b) => b.mag - a.mag || b.ts - a.ts);
  const { unita, serie } = serieEventi(validi.filter(e => Number.isFinite(e.ts)).map(e => e.ts));
  return {
    totale: validi.length,
    magMax: ordinati[0]?.mag ?? null,
    profMediana: mediana(validi.map(e => e.prof).filter(Number.isFinite)),
    massimo: ordinati[0] ? { mag: ordinati[0].mag, luogo: ordinati[0].luogo || '', ts: ordinati[0].ts, prof: ordinati[0].prof, lat: ordinati[0].lat, lon: ordinati[0].lon } : null,
    oltre: Object.fromEntries([3, 4, 5].map(m => [m, validi.filter(e => e.mag >= m).length])), // quanti eventi da M 3, 4 e 5 in su
    top: ordinati.slice(0, quanti).map(e => ({ mag: e.mag, luogo: e.luogo || '', ts: e.ts })),
    serie, unita,
  };
}
