// Rotta GET /terremoti: legge dall'archivio locale e risponde in GeoJSON dell'INGV (le stesse feature che il browser sa già leggere).
export const MASSIMO_EVENTI = 5000; // per la mappa
export const MASSIMO_TESTO = 200000; // per le serie storiche (formato testo)
// Stesso riquadro dei limiti della mappa (js/core/config.js, LIMITI): lo verifica tests/js/config-italia.test.mjs
export const AREA = { minlon: 5.5, minlat: 35.0, maxlon: 19.5, maxlat: 47.6 };
const GIORNO_MS = 86400000;

function numero(url, nome, predefinito) {
  const v = url.searchParams.get(nome);
  if (v === null || v === '') return predefinito;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`parametro ${nome} non valido`);
  return n;
}

// Riquadro facoltativo [ovest, sud, est, nord]: restringe la risposta a un'area (per esempio il comune cliccato in mappa)
function riquadro(url) {
  const v = url.searchParams.get('bbox');
  if (v === null || v === '') return null;
  const n = v.split(',').map(Number);
  if (n.length !== 4 || !n.every(Number.isFinite)) throw new Error('parametro bbox non valido');
  const [minlon, minlat, maxlon, maxlat] = n;
  if (minlon >= maxlon || minlat >= maxlat) throw new Error('parametro bbox non valido: riquadro vuoto');
  return { minlon, minlat, maxlon, maxlat };
}

export function leggiParametri(url, adesso = Date.now()) {
  const a = numero(url, 'a', adesso);
  const da = numero(url, 'da', a - 30 * GIORNO_MS);
  if (da > a) throw new Error('intervallo non valido: da > a');
  const magMin = numero(url, 'magmin', 0);
  const testo = url.searchParams.get('formato') === 'testo';
  const tetto = testo ? MASSIMO_TESTO : MASSIMO_EVENTI;
  const limite = Math.max(1, Math.min(Math.floor(numero(url, 'limite', tetto)), tetto));
  return { da, a, magMin, limite, testo, bbox: riquadro(url) };
}

export function rispondiTerremoti(archivio, { da, a, magMin, limite }, area) {
  const { eventi, totale } = archivio.interroga({ da, a, magMin, area, limite });
  return { eventi, totale, troncato: totale > eventi.length, aggiornato: archivio.ultimoTs() };
}

export function rispondiRiepilogo(archivio, { da, a, magMin }, area) {
  return { ...archivio.riepilogo({ da, a, magMin, area }), aggiornato: archivio.ultimoTs() };
}

// Stesso formato «text» dell'INGV (colonne separate da «|»): lo legge eventiDaTesto(), usato dalle serie storiche
const INTESTAZIONE = '#EventID|Time|Latitude|Longitude|Depth/Km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType';
export function rispondiTesto(archivio, { da, a, magMin, limite }, area) {
  const { eventi } = archivio.interroga({ da, a, magMin, area, limite });
  const riga = f => {
    const p = f.properties;
    const [lon, lat, prof] = f.geometry.coordinates;
    const luogo = String(p.place ?? '').replaceAll('|', ' ').replaceAll('\n', ' ');
    return [p.eventId, p.time, lat, lon, prof ?? '', '', '', '', '', p.magType ?? '', p.mag, '', luogo, p.type ?? ''].join('|');
  };
  return [INTESTAZIONE, ...eventi.map(riga)].join('\n');
}
