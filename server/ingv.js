// Scarico dal servizio FDSN dell'INGV: eventi in GeoJSON, a pagine (l'INGV numera `offset` da 1).
export const URL_SERVIZIO = 'https://webservices.ingv.it/fdsnws/event/1/query';
export const DIMENSIONE_PAGINA = 1000;
const PAGINE_MAX = 200; // freno: 200.000 eventi per intervallo sono già troppi per una sola chiamata

const iso = ms => new Date(ms).toISOString().slice(0, 19);

export function urlPagina({ da, a, magMin, area, offset = 1 }) {
  const q = new URLSearchParams({
    format: 'geojson', starttime: iso(da), endtime: iso(a), orderby: 'time', minmag: String(magMin),
    minlon: String(area.minlon), minlat: String(area.minlat), maxlon: String(area.maxlon), maxlat: String(area.maxlat),
    limit: String(DIMENSIONE_PAGINA), offset: String(offset),
  });
  return `${URL_SERVIZIO}?${q}`;
}

// Tutte le feature dell'intervallo, senza duplicati (un evento nuovo può spostare le pagine); 204 = nessun evento
export async function scaricaIntervallo({ da, a, magMin, area, fetchFn = fetch }) {
  const visti = new Map();
  for (let p = 0; p < PAGINE_MAX; p++) {
    const r = await fetchFn(urlPagina({ da, a, magMin, area, offset: 1 + p * DIMENSIONE_PAGINA }));
    if (r.status === 204) break;
    if (!r.ok) throw new Error(`INGV ${r.status}`);
    const features = (await r.json()).features ?? [];
    for (const f of features) if (f?.properties?.eventId != null) visti.set(f.properties.eventId, f);
    if (features.length < DIMENSIONE_PAGINA) break;
  }
  return [...visti.values()];
}
