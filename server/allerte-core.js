// Allerta meteo-idro della Protezione Civile (DPC) per le 187 zone di allerta d'Italia, come GeoJSON. Rotta: GET /allerte
// Derivato da worker/allerte-core.js di DigitalTwin Palermo, senza il filtro sulle zone siciliane.
// Fonte: repository pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica (CC BY 4.0). Il bollettino esce ogni giorno verso le 16:00 (oggi e domani),
// con aggiornamenti se le Regioni lo correggono. Il nome del file è «AAAAMMGG_HHMM.json»: l'ultimo si trova nell'elenco della cartella `files`.

export const FONTE = 'Dipartimento della Protezione Civile, bollettino di criticità nazionale (CC BY 4.0)';
export const TTL_SECONDI = 15 * 60;
export const TTL_ULTIMO_SECONDI = 3 * 24 * 60 * 60;
const BASE = 'https://raw.githubusercontent.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica/master/files';
const URL_ELENCO = 'https://api.github.com/repos/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica/git/trees/master:files';
const BOLLETTINO = /^(\d{8}_\d{4})\.json$/;

// Livelli di allerta dal testo del DPC («… / ALLERTA GIALLA», «NESSUNA ALLERTA»): 0 verde, 1 gialla, 2 arancione, 3 rossa
export function livello(testo) {
  const s = String(testo ?? '').toUpperCase();
  if (s.includes('ALLERTA ROSSA')) return 3;
  if (s.includes('ALLERTA ARANCIONE')) return 2;
  if (s.includes('ALLERTA GIALLA')) return 1;
  return 0;
}
export const NOMI_LIVELLO = ['Nessuna allerta', 'Allerta gialla', 'Allerta arancione', 'Allerta rossa'];

// Nome dell'ultimo bollettino («20261022_1417») dall'albero della cartella `files`; null se non ce n'è nessuno
export function ultimoBollettino(albero) {
  const nomi = (albero?.tree ?? []).map(n => BOLLETTINO.exec(n?.path ?? '')?.[1]).filter(Boolean).sort();
  return nomi.at(-1) ?? null;
}

// TopoJSON → anelli di coordinate [lon, lat] per la geometria (Polygon o MultiPolygon) → geometria GeoJSON arrotondata a 3 decimali (circa 100 m)
export function geometria(topo, g) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const archi = topo.arcs.map(arco => {
    let x = 0, y = 0;
    return arco.map(([dx, dy]) => { x += dx; y += dy; return [Math.round((x * sx + tx) * 1e3) / 1e3, Math.round((y * sy + ty) * 1e3) / 1e3]; });
  });
  const arco = i => (i >= 0 ? archi[i] : [...archi[~i]].reverse());
  const anello = indici => indici.flatMap((i, k) => (k === 0 ? arco(i) : arco(i).slice(1)));
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.arcs.map(anello) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.arcs.map(poligono => poligono.map(anello)) };
  throw new Error(`geometria non prevista: ${g.type}`);
}

// Tutte le zone di allerta del bollettino: [{ proprieta, geometria }]
export function zoneItalia(topo) {
  const oggetto = Object.values(topo?.objects ?? {})[0];
  return (oggetto?.geometries ?? []).map(g => ({ proprieta: g.properties ?? {}, geometria: geometria(topo, g) }));
}

function giorno(proprieta) {
  const mappa = proprieta['Rappresentata nella mappa'];
  return {
    livello: livello(mappa), testo: String(mappa ?? ''),
    idraulico: livello(proprieta['Per rischio idraulico']), temporali: livello(proprieta['Per rischio temporali']), idrogeologico: livello(proprieta['Per rischio idrogeologico']),
  };
}

// bollettino = JSON del bollettino; topo = { today, tomorrow } già scaricati
export function costruisci(nome, bollettino, topo) {
  const oggi = zoneItalia(topo.today);
  const domani = new Map(zoneItalia(topo.tomorrow).map(z => [z.proprieta['Nome zona'], z]));
  if (!oggi.length || oggi.some(z => !domani.has(z.proprieta['Nome zona']))) throw new Error(`zone di oggi e di domani non corrispondono nel bollettino ${nome}`);
  const [, aaaa, mm, gg, hh, mi] = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})$/.exec(nome);
  const titolo = String(bollettino?.name ?? `Bollettino ${gg}/${mm}/${aaaa} ore ${hh}:${mi}`);
  return {
    type: 'FeatureCollection', fonte: FONTE, aggiornato: Number.isFinite(Date.parse(bollettino?.date)) ? Math.floor(Date.parse(bollettino.date) / 1000) : null,
    legenda: bollettino?.global_legend ?? null,
    features: oggi.map(z => {
      const nomeZona = z.proprieta['Nome zona'];
      const g1 = giorno(z.proprieta);
      const g2 = giorno(domani.get(nomeZona).proprieta);
      return {
        type: 'Feature', geometry: z.geometria,
        properties: { zona: nomeZona, comuni: Array.isArray(z.proprieta.Comuni) ? z.proprieta.Comuni : [], bollettino: titolo, oggi: g1, domani: g2, livello: Math.max(g1.livello, g2.livello) },
      };
    }),
  };
}

async function prendi(fetchFn, url, opzioni) {
  const r = await fetchFn(url, opzioni);
  if (!r.ok) throw new Error(`${new URL(url).hostname} ${r.status}`);
  return r.json();
}

// `cache` = oggetto che il chiamante tiene vivo tra una richiesta e l'altra ({ corpo, quando, ultimo }); `ora` = orologio (ms)
export async function gestisciAllerte(fetchFn, cache, ora = Date.now) {
  const adesso = ora();
  const intestazioniOk = { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${TTL_SECONDI}` };
  if (cache.corpo && adesso - cache.quando < TTL_SECONDI * 1000) return { stato: 200, corpo: cache.corpo, intestazioni: intestazioniOk };
  try {
    const opzioni = { headers: { accept: 'application/json', 'user-agent': 'TerremotiItalia/0.1 (locale)' } };
    const nome = ultimoBollettino(await prendi(fetchFn, URL_ELENCO, opzioni));
    if (!nome) throw new Error('nessun bollettino nell\'elenco');
    const bollettino = await prendi(fetchFn, `${BASE}/${nome}.json`, opzioni);
    const [today, tomorrow] = await Promise.all([bollettino.today?.topo_json, bollettino.tomorrow?.topo_json].map(u => {
      if (typeof u !== 'string' || !u.startsWith(`${BASE}/`)) throw new Error('indirizzo del TopoJSON non previsto');
      return prendi(fetchFn, u, opzioni);
    }));
    const corpo = JSON.stringify(costruisci(nome, bollettino, { today, tomorrow }));
    cache.corpo = corpo; cache.quando = adesso; cache.ultimo = { corpo, quando: adesso };
    return { stato: 200, corpo, intestazioni: intestazioniOk };
  } catch (e) {
    // meglio l'ultimo bollettino buono, vecchio di poco, che nessun dato
    if (cache.ultimo && adesso - cache.ultimo.quando < TTL_ULTIMO_SECONDI * 1000) {
      return { stato: 200, corpo: cache.ultimo.corpo, intestazioni: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-dati': 'vecchi' } };
    }
    return { stato: 502, corpo: JSON.stringify({ errore: 'bollettino DPC non raggiungibile', dettaglio: String(e?.message ?? e).slice(0, 120) }), intestazioni: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } };
  }
}
