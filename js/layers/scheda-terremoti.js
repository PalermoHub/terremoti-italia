import { righe } from '../core/scheda-util.js';
import { t, tl, tn, localeIntl } from '../core/i18n.js';
import { posizioneIn } from '../core/scheda-navigazione.js';

// Modello puro dei terremoti in tempo reale (INGV, servizio FDSN event): stesse righe per il popup e per la scheda di destra (tab «Luogo»).
// Il browser interroga direttamente il servizio (risponde con CORS aperto): ogni evento ha magnitudo, ora (UTC), zona, profondità (km, terza coordinata) e autore della localizzazione.

export const FONTE = 'INGV, Istituto Nazionale di Geofisica e Vulcanologia: terremoti in tempo reale (CC BY 4.0)';
export const SITO = 'https://terremoti.ingv.it/';
export const LINK = 'https://terremoti.ingv.it/event/';
const PESO_LUOGO = 8;
const ORA_MS = 3600 * 1000;

// Fasce di età, come sulle mappe dell'INGV: arancione le ultime 24 ore, giallo le ultime 72, azzurro i più vecchi
export const FASCE = [
  { nome: 'Ultime 24 ore', colore: '#f08c00', finoA: 24 * ORA_MS },
  { nome: 'Ultime 72 ore', colore: '#f2c500', finoA: 72 * ORA_MS },
  { nome: 'Oltre 72 ore', colore: '#1e9be0', finoA: Infinity },
];
export const fasciaEta = (ts, adesso = Date.now()) => FASCE.find(f => adesso - ts < f.finoA) ?? FASCE.at(-1);

// Filtri della scheda e della legenda: periodo (giorni) e magnitudo minima. Il servizio si interroga per GIORNI_MAX giorni, la vista parte da GIORNI_INIZIALI.
export const GIORNI_MAX = 30;
export const SCELTE_GIORNI = [1, 7, 30];
export const SCELTE_MAGNITUDO = [1, 2, 3, 4];
// Classi di profondità dell'ipocentro (km): la prima non filtra; gli intervalli sono estremi inclusi.
// Sono le stesse dei pannelli Archivio e Confronto; il menu della ricerca scrive `profMin`/`profMax` nel filtro condiviso.
export const PROFONDITA = [
  { chiave: 'tutte', min: null, max: null },
  { chiave: 'fino10', min: 0, max: 10 },
  { chiave: 'da10a30', min: 10, max: 30 },
  { chiave: 'da30a70', min: 30, max: 70 },
  { chiave: 'oltre70', min: 70, max: null },
];
// Oltre a questi, il pannello con slider e istogramma imposta `finestra` ([da, a] in giorni interi dall'inizio dei GIORNI_MAX, null = tutto) e `classi` (indici di CLASSI_MAG accesi, null = tutte).
export const FILTRO_INIZIALE = Object.freeze({ giorni: 7, magMin: 1, profMin: null, profMax: null, finestra: null, classi: null });
export const filtro = { ...FILTRO_INIZIALE };
const GIORNO_MS = 24 * ORA_MS;

// Profondità scelta come intervallo per le chiamate al server, o null se non filtra
export const profonditaDaFiltro = (f = filtro) => (f.profMin == null && f.profMax == null ? null : { min: f.profMin, max: f.profMax });
// Chiave della classe di profondità corrispondente al filtro (per i menu)
export const chiaveProfondita = (f = filtro) => PROFONDITA.find(p => p.min === f.profMin && p.max === f.profMax)?.chiave ?? 'tutte';

// Classi dell'istogramma di magnitudo
export const CLASSI_MAG = [{ da: 1, a: 2 }, { da: 2, a: 3 }, { da: 3, a: 4 }, { da: 4, a: Infinity }];
export const classeMagnitudo = m => Math.max(0, CLASSI_MAG.findIndex(c => m < c.a));

// Intervallo [da, a] in millisecondi: la finestra dello slider se c'è, altrimenti gli ultimi `giorni`. Il limite finale della finestra piena è aperto, così gli eventi nuovi restano dentro.
export function intervallo({ giorni, finestra } = filtro, adesso = Date.now()) {
  if (!finestra) return [adesso - giorni * GIORNO_MS, Infinity];
  const [da, a] = finestra;
  return [adesso - (GIORNI_MAX - da) * GIORNO_MS, a >= GIORNI_MAX ? Infinity : adesso - (GIORNI_MAX - a) * GIORNO_MS];
}

export const passaFiltro = (p, f = filtro, adesso = Date.now()) => {
  const [da, a] = intervallo(f, adesso);
  return p.mag >= f.magMin && p.ts >= da && p.ts <= a
    && (f.profMin == null || p.prof >= f.profMin) && (f.profMax == null || p.prof <= f.profMax)
    && (!f.classi || f.classi.has(classeMagnitudo(p.mag)));
};
// Stesso filtro come espressione MapLibre (per cerchi e strato di interrogazione)
export function espressioneFiltro(f = filtro, adesso = Date.now()) {
  const [da, a] = intervallo(f, adesso);
  return ['all', ['>=', ['get', 'mag'], f.magMin], ['>=', ['get', 'ts'], da], ...(a === Infinity ? [] : [['<=', ['get', 'ts'], a]]),
    ...(f.profMin == null ? [] : [['>=', ['get', 'prof'], f.profMin]]),
    ...(f.profMax == null ? [] : [['<=', ['get', 'prof'], f.profMax]]),
    ...(f.classi ? [['any', ...[...f.classi].map(i => ['all', ['>=', ['get', 'mag'], CLASSI_MAG[i].da], ...(CLASSI_MAG[i].a === Infinity ? [] : [['<', ['get', 'mag'], CLASSI_MAG[i].a]])])]] : [])];
}

// Barre della serie temporale: eventi per giorno negli ultimi GIORNI_MAX giorni (la più a destra è l'ultima), con magnitudo minima e classi ma senza la finestra
export function eventiPerGiorno(eventi, f = filtro, adesso = Date.now()) {
  const n = Array(GIORNI_MAX).fill(0);
  for (const p of eventi) {
    const i = GIORNI_MAX - 1 - Math.floor((adesso - p.ts) / GIORNO_MS);
    if (p.mag >= f.magMin && (f.profMin == null || p.prof >= f.profMin) && (f.profMax == null || p.prof <= f.profMax) && i >= 0 && i < GIORNI_MAX && (!f.classi || f.classi.has(classeMagnitudo(p.mag)))) n[i]++;
  }
  return n;
}

// Barre dell'istogramma di magnitudo: eventi per classe, nell'intervallo di tempo ma senza classi (così si vede cosa si accende)
export function eventiPerClasse(eventi, f = filtro, adesso = Date.now()) {
  const n = Array(CLASSI_MAG.length).fill(0);
  for (const p of eventi) if (passaFiltro(p, { ...f, classi: null }, adesso)) n[classeMagnitudo(p.mag)]++;
  return n;
}

// Riproduzione: sposta la finestra di un giorno; arrivata in fondo riparte dall'inizio. Con tutto il periodo parte da una finestra di 3 giorni.
export function prossimaFinestra(finestra, larghezza = 3) {
  const [da, a] = finestra ?? [0, GIORNI_MAX];
  const l = a - da >= GIORNI_MAX ? larghezza : Math.max(1, a - da);
  return a >= GIORNI_MAX ? [0, l] : [da + 1, a + 1];
}

// Classi della legenda di magnitudo dell'INGV: fino a 2.0, 2.0-2.9, 3.0-3.9, 4.0-4.9, da 5.0
const CLASSI_LEGENDA = [{ chiave: 'fino2', raggio: 3, sotto: 2 }, { chiave: 'da2', raggio: 5, sotto: 3 }, { chiave: 'da3', raggio: 7, sotto: 4 }, { chiave: 'da4', raggio: 10, sotto: 5 }, { chiave: 'da5', raggio: 14, sotto: Infinity }];

// Magnitudo → raggio del cerchio in pixel: uno per classe della legenda, lo stesso dei cerchi disegnati nella legenda
const classeLegenda = m => Math.max(0, CLASSI_LEGENDA.findIndex(c => m < c.sotto));
export const raggioMagnitudo = m => CLASSI_LEGENDA[classeLegenda(m)].raggio;

const num = (n, d = 1) => n.toLocaleString(localeIntl(), { minimumFractionDigits: d, maximumFractionDigits: d });

// INGV scrive l'ora UTC senza «Z» e con microsecondi: "2026-10-23T10:19:15.470000"
export const oraEvento = testo => Date.parse(`${String(testo).slice(0, 23)}Z`);

// Feature GeoJSON di INGV → feature per la sorgente della mappa (proprietà piatte e già calcolate), o null se i dati sono incompleti
export function eventoDaIngv(f, adesso = Date.now()) {
  const p = f?.properties ?? {};
  const [lon, lat, prof] = f?.geometry?.coordinates ?? [];
  const ts = oraEvento(p.time);
  if (!Number.isFinite(p.mag) || !Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(ts)) return null;
  const fascia = fasciaEta(ts, adesso);
  return {
    type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { id: String(p.eventId), mag: p.mag, tipoMag: p.magType ?? '', luogo: p.place ?? '', ts, ora: new Date(ts).toISOString().slice(0, 16).replace('T', ' '), prof: Number.isFinite(prof) ? prof : null, autore: p.author ?? '', fascia: fascia.nome, colore: fascia.colore, raggio: raggioMagnitudo(p.mag) },
  };
}

export function distanzaKm([lon1, lat1], [lon2, lat2]) {
  const rad = g => g * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// «3 ore fa», «12 minuti fa»
export function quantoTempoFa(ts, adesso = Date.now()) {
  const min = Math.max(0, Math.round((adesso - ts) / 60000));
  const rtf = new Intl.RelativeTimeFormat(localeIntl(), { numeric: 'always' });
  if (min < 60) return rtf.format(-min, 'minute');
  if (min < 48 * 60) return rtf.format(-Math.round(min / 60), 'hour');
  return rtf.format(-Math.round(min / 1440), 'day');
}

// L'anno si scrive solo se non è quello di `adesso` (eventi dell'archivio storico)
const quando = (ts, adesso) => new Date(ts).toLocaleString(localeIntl(), { day: 'numeric', month: 'long', ...(new Date(ts).getFullYear() === new Date(adesso).getFullYear() ? {} : { year: 'numeric' }), hour: '2-digit', minute: '2-digit' });

export const titoloTerremoto = p => `M ${num(p.mag)} · ${p.luogo || t('terremoti.zonaSconosciuta')}`;

function righeTerremoto(p, adesso) {
  return righe([
    ['Magnitudo', `${num(p.mag)}${p.tipoMag ? ` (${p.tipoMag})` : ''}`],
    ['Ora locale', `${quando(p.ts, adesso)} · ${quantoTempoFa(p.ts, adesso)}`],
    ['Zona', p.luogo],
    ['Profondità', p.prof == null ? '' : `${num(p.prof)} km`],
    ['Localizzazione', p.autore],
  ]);
}

// `p` = proprietà della feature in mappa + `lon`/`lat` (aggiunte da chi chiama)
export function modelloPopupTerremoto(p, adesso = Date.now()) {
  return { titolo: titoloTerremoto(p), sottotitolo: p.fascia, ...(p.anno ? { badge: { testo: String(p.anno), colore: p.colore } } : {}), righe: righeTerremoto(p, adesso).filter(r => r.etichetta !== 'Zona') };
}

const dataRoma = ts => new Date(ts).toLocaleDateString(localeIntl(), { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
const oraRoma = ts => new Date(ts).toLocaleTimeString(localeIntl(), { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });

// Scheda dell'evento sul modello di quella dell'INGV: titolo e zona, data e ora, magnitudo e profondità, poi le due legende con la voce dell'evento in evidenza
export function modelloEvento(p) {
  const classe = classeLegenda(p.mag);
  return {
    titolo: t('terremoti.ev.titolo'), luogo: p.luogo || t('terremoti.zonaSconosciuta'), ...(p.anno ? { badge: { testo: String(p.anno), colore: p.colore } } : {}),
    campi: [
      { chiave: t('terremoti.ev.data'), valore: dataRoma(p.ts) },
      { chiave: t('terremoti.ev.ora'), valore: oraRoma(p.ts), nota: t('terremoti.ev.oraItaliana') },
      { chiave: t('terremoti.ev.magnitudo'), valore: `${num(p.mag)}${p.tipoMag ? ` ${p.tipoMag}` : ''}` },
      { chiave: t('terremoti.ev.profondita'), valore: p.prof == null ? '' : `${num(p.prof, 0)} km` },
    ].filter(c => c.valore),
    legende: [
      { titolo: t('terremoti.ev.legendaMagnitudo'), voci: CLASSI_LEGENDA.map((c, i) => ({ testo: t(`terremoti.ev.mag.${c.chiave}`), raggio: c.raggio, attiva: i === classe, badge: `M ${num(p.mag)}` })) },
      { titolo: t('terremoti.ev.legendaTempo'), voci: FASCE.map(f => ({ testo: tl(f.nome), colore: f.colore, attiva: f.nome === p.fascia, badge: tl(f.nome) })) },
    ],
    autore: p.autore ? `${t('terremoti.ev.localizzazione')}: ${p.autore}` : '',
  };
}

export function voceTerremoto(p, adesso = Date.now(), dinamico = null, storico = false) {
  return {
    chiave: `terremoto-${storico ? 'storico-' : ''}${p.id}`, tipo: 'terremoto', peso: PESO_LUOGO, strato: 'terremoti', titolo: titoloTerremoto(p), icona: 'terremoto', sempre: true,
    gruppi: [], evento: modelloEvento(p), miniatura: miniatura(p),
    link: { testo: 'Scheda dell\'evento su INGV', url: LINK + p.id, icona: 'esterno', suggerimento: 'Pagina dell\'evento sul sito terremoti.ingv.it' },
    fonte: t('layer.fonte', { fonte: tl(FONTE) }),
    ...(dinamico ? { dinamico } : {}),
  };
}

// Posto dell'evento `id` tra quelli in mappa, dal più recente: `prec` è l'evento più recente, `succ` il meno recente
export const posizioneEvento = (visibili, id) => posizioneIn([...visibili].sort((a, b) => b.ts - a.ts), id);

export const MAX_ELENCO = 100;

// Miniatura rettangolare dell'epicentro, che sta sempre al centro: poche tessere raster (al massimo 3×2, caricate solo quando la card si apre) invece di una mappa interattiva per card.
// Il riquadro si adatta alla larghezza della scheda e ritaglia ai lati. Un clic apre la mappa del sito sullo stesso punto.
const ZOOM_MINIATURA = 8;
const LARGHEZZA_MINIATURA = 320;
const ALTEZZA_MINIATURA = 150;
const TESSERA = 256;
export function miniatura({ lon, lat }, zoom = ZOOM_MINIATURA, larghezza = LARGHEZZA_MINIATURA, altezza = ALTEZZA_MINIATURA) {
  const n = 2 ** zoom;
  const rad = lat * Math.PI / 180;
  const sinistra = (lon + 180) / 360 * n * TESSERA - larghezza / 2;
  const alto = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n * TESSERA - altezza / 2;
  const tessere = [];
  for (let ty = Math.floor(alto / TESSERA); ty <= Math.floor((alto + altezza - 1) / TESSERA); ty++) {
    for (let tx = Math.floor(sinistra / TESSERA); tx <= Math.floor((sinistra + larghezza - 1) / TESSERA); tx++) {
      tessere.push({ url: `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`, x: Math.round(tx * TESSERA - sinistra), y: Math.round(ty * TESSERA - alto) });
    }
  }
  return { larghezza, altezza, tessere, href: `mappa.html#${zoom + 1}/${lat.toFixed(4)}/${lon.toFixed(4)}`, attribuzione: '© OpenStreetMap' };
}

// Minimappa del grafico grande: centro e zoom (tessere OSM) che contengono tutti i punti `{lon, lat}` in una cornice larghezza × altezza.
// Un solo punto, o punti vicinissimi, si fermano a ZOOM_MAX_INQUADRA.
const ZOOM_MAX_INQUADRA = 12;
const mondoX = lon => (lon + 180) / 360;
const mondoY = lat => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;
export function inquadra(punti, larghezza, altezza, margine = 24) {
  const v = punti.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (!v.length) return null;
  const xs = v.map(p => mondoX(p.lon)), ys = v.map(p => mondoY(p.lat));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let zoom = 2;
  for (let z = ZOOM_MAX_INQUADRA; z > 2; z--) {
    const lato = TESSERA * 2 ** z;
    if ((x1 - x0) * lato <= larghezza - 2 * margine && (y1 - y0) * lato <= altezza - 2 * margine) { zoom = z; break; }
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { zoom, centro: { lon: cx * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180 / Math.PI } };
}
// Posizione in pixel di un punto nella cornice centrata su `centro` (la stessa delle tessere di miniatura())
export function proiettaMiniatura(centro, zoom, larghezza, altezza) {
  const lato = TESSERA * 2 ** zoom, cx = mondoX(centro.lon) * lato, cy = mondoY(centro.lat) * lato;
  return ({ lon, lat }) => ({ x: mondoX(lon) * lato - cx + larghezza / 2, y: mondoY(lat) * lato - cy + altezza / 2 });
}

// Elenco «gli altri terremoti» della scheda: quelli che passano il filtro, senza i cliccati, dal più recente (al massimo MAX_ELENCO)
export function altriTerremoti(eventi, esclusi, f = filtro, adesso = Date.now()) {
  const tutti = eventi.filter(p => !esclusi.has(p.id) && passaFiltro(p, f, adesso)).sort((a, b) => b.ts - a.ts);
  return { n: tutti.length, mostrati: tutti.slice(0, MAX_ELENCO) };
}

// Fisarmonica con una card per evento (stesse righe della scheda), per `disegnaAccordion`
export function accordionTerremoti(elenco, adesso = Date.now()) {
  const { n, mostrati } = elenco;
  return {
    icona: 'terremoto', aperto: n > 0 && n <= 10,
    riassunto: n > mostrati.length ? t('terremoti.altriParziale', { mostrati: mostrati.length, n }) : tn('terremoti.altri', n),
    elementi: mostrati.map(p => ({
      titolo: titoloTerremoto(p), anteprima: quantoTempoFa(p.ts, adesso),
      miniatura: miniatura(p),
      righe: [...righeTerremoto(p, adesso), { etichetta: 'Scheda INGV', valore: 'terremoti.ingv.it', urlValore: LINK + p.id }],
    })),
  };
}

// Sezione sotto agli eventi cliccati; `dinamico` disegna filtro ed elenco (scheda-terremoti-dom.js)
export const voceAltri = dinamico => ({
  chiave: 'terremoti:altri', tipo: 'terremoto', peso: PESO_LUOGO, strato: 'terremoti', titolo: 'Gli altri terremoti', icona: 'terremoto', sempre: true,
  gruppi: [], dinamico,
  link: { testo: 'Tutti i terremoti su INGV', url: SITO, icona: 'esterno', suggerimento: 'Elenco completo sul sito terremoti.ingv.it' },
  fonte: t('layer.fonte', { fonte: tl(FONTE) }),
});

// ---------- serie temporale: eventi per giorno, mese o anno, con sciami e sequenze ----------
// Il servizio si interroga una volta sola per gli ultimi ANNI_STORICO anni, dalla magnitudo MAG_STORICO (sotto, in 5 anni, gli eventi sarebbero decine di migliaia).
export const UNITA = ['giorno', 'mese', 'anno'];
export const ANNI_STORICO = 5;
export const MAG_STORICO = 2;
const FINESTRE = { giorno: 30, mese: 24, anno: ANNI_STORICO }; // quante barre
const MIN_SCIAME = 6; // sotto questo numero di eventi in una barra non è mai uno sciame

export const urlStorico = (area, adesso = Date.now()) => {
  const q = new URLSearchParams({ formato: 'testo', da: String(adesso - ANNI_STORICO * 366 * GIORNO_MS), a: String(adesso), magmin: String(MAG_STORICO), limite: '200000' });
  return `/terremoti?${q}`;
};

// Dove sta lo snapshot statico (ramo `snapshot`, rigenerato da una GitHub Action): serve quando manca il server locale, ad esempio su GitHub Pages
export const URL_SNAPSHOT = 'https://raw.githubusercontent.com/PalermoHub/terremoti-italia/snapshot/';
// Dove sta l'archivio storico statico (ramo `archivio`, da scripts/esporta-archivio.mjs): un file per anno e i riepiloghi
export const URL_ARCHIVIO = 'https://raw.githubusercontent.com/PalermoHub/terremoti-italia/archivio/';
const MASSIMO_MAPPA = 5000; // come MASSIMO_EVENTI del server
const MASSIMO_TESTO = 200000; // come MASSIMO_TESTO del server: il formato testo non ha il tetto della mappa
const GIORNI_SNAPSHOT = 29; // lo snapshot copre gli ultimi 30 giorni: un intervallo che parte prima va cercato nell'archivio

// Riga compatta dell'archivio statico → feature GeoJSON dell'INGV
const featureDaRiga = ([eventId, time, lat, lon, prof, mag, magType, place, type]) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: prof == null ? [lon, lat] : [lon, lat, prof] },
  properties: { eventId, time, mag, magType, place, type },
});

// Risposta di GET /terremoti per l'intervallo chiesto, dai file per anno dell'archivio statico.
// `massimo` è il tetto di eventi restituiti (come nella risposta del server): i conteggi di tutta la storia lo alzano,
// perché in un solo comune una sequenza può superare i MASSIMO_MAPPA eventi che la mappa sa disegnare.
export async function rispostaDaArchivio({ da, a, magMin, profMin = null, profMax = null }, fetchFn = fetch, massimo = MASSIMO_MAPPA) {
  const dal = new Date(da).getUTCFullYear(), al = new Date(a).getUTCFullYear();
  const anni = Array.from({ length: Math.max(0, al - dal + 1) }, (_, i) => dal + i);
  const file = await Promise.all(anni.map(async anno => {
    const r = await fetchFn(`${URL_ARCHIVIO}anni/${anno}.json`).catch(() => null);
    if (r?.status === 404) return []; // anno senza eventi
    if (!r?.ok) throw new Error(`archivio ${r?.status ?? 'non raggiungibile'}`);
    return (await r.json()).righe ?? [];
  }));
  const dentro = file.flat().map(featureDaRiga).filter(f => {
    const ts = oraEvento(f.properties.time);
    const prof = f.geometry.coordinates[2];
    return ts >= da && ts <= a && f.properties.mag >= magMin
      && (profMin == null || prof >= profMin) && (profMax == null || prof <= profMax);
  }).sort((x, y) => oraEvento(y.properties.time) - oraEvento(x.properties.time));
  return { eventi: dentro.slice(0, massimo), totale: dentro.length, troncato: dentro.length > massimo, aggiornato: null };
}

// Snapshot { eventi, aggiornato } → stessa risposta di GET /terremoti per l'intervallo chiesto: più recenti prima, al massimo MASSIMO_MAPPA
export function rispostaDaSnapshot(dati, { da, a, magMin, profMin = null, profMax = null }, massimo = MASSIMO_MAPPA) {
  const dentro = (dati?.eventi ?? []).filter(f => {
    const ts = oraEvento(f?.properties?.time);
    const prof = f?.geometry?.coordinates?.[2];
    return ts >= da && ts <= a && f.properties.mag >= magMin
      && (profMin == null || prof >= profMin) && (profMax == null || prof <= profMax);
  }).sort((x, y) => oraEvento(y.properties.time) - oraEvento(x.properties.time));
  return { eventi: dentro.slice(0, massimo), totale: dentro.length, troncato: dentro.length > massimo, aggiornato: dati?.aggiornato ?? null };
}

// Toglie duplicati, eventi fuori dall'area e fuori dall'intervallo di profondità: le sorgenti (server, archivio
// statico, snapshot) possono ripetere lo stesso evento, e il filtro locale vale anche quando rispondono i file statici.
function eventiNelFiltro(eventi, area, profMin = null, profMax = null) {
  const visti = new Set();
  const dentro = [];
  for (const f of eventi ?? []) {
    const id = f?.properties?.eventId;
    const [lon, lat, prof] = f?.geometry?.coordinates ?? [];
    if (id == null || visti.has(id)) continue;
    if (lon < area.minlon || lon > area.maxlon || lat < area.minlat || lat > area.maxlat) continue;
    if (profMin != null && !(prof >= profMin)) continue;
    if (profMax != null && !(prof <= profMax)) continue;
    visti.add(id);
    dentro.push(f);
  }
  return dentro;
}

// Eventi dal nostro archivio (GET /terremoti), come feature GeoJSON dell'INGV; senza duplicati e solo dentro `area`.
// Senza server (404) si ripiega sullo snapshot degli ultimi 30 giorni o, per un intervallo più vecchio, sull'archivio statico per anno.
export async function scaricaEventi({ da, a, magMin, profMin = null, profMax = null, area, fetchFn = fetch, adesso = Date.now() }) {
  const q = new URLSearchParams({ da: String(da), a: String(a), magmin: String(magMin), bbox: [area.minlon, area.minlat, area.maxlon, area.maxlat].join(',') });
  if (profMin != null) q.set('profmin', String(profMin));
  if (profMax != null) q.set('profmax', String(profMax));
  let dati;
  const r = await fetchFn(`/terremoti?${q}`).catch(() => null);
  if (r?.ok) dati = await r.json();
  else if (da < adesso - GIORNI_SNAPSHOT * GIORNO_MS) dati = await rispostaDaArchivio({ da, a, magMin, profMin, profMax }, fetchFn);
  else {
    const s = await fetchFn(`${URL_SNAPSHOT}terremoti.json`).catch(() => null);
    if (!s?.ok) throw new Error(`archivio ${r?.status ?? 'non raggiungibile'}`);
    dati = rispostaDaSnapshot(await s.json(), { da, a, magMin, profMin, profMax });
  }
  return { eventi: eventiNelFiltro(dati.eventi, area, profMin, profMax), troncato: Boolean(dati.troncato) };
}

// Tutti gli eventi di un intervallo dentro `area`, oltre il tetto di 5000 della mappa: il formato testo del server arriva a 200000 righe.
// Serve ai conteggi di un territorio (regione, provincia, comune), dove la magnitudo minima deve valere come per tutta l'Italia.
export async function scaricaEventiTutti({ da, a, magMin, profMin = null, profMax = null, area, fetchFn = fetch, adesso = Date.now() }) {
  const q = new URLSearchParams({ formato: 'testo', da: String(da), a: String(a), magmin: String(magMin), bbox: [area.minlon, area.minlat, area.maxlon, area.maxlat].join(','), limite: String(MASSIMO_TESTO) });
  if (profMin != null) q.set('profmin', String(profMin));
  if (profMax != null) q.set('profmax', String(profMax));
  let dati;
  const r = await fetchFn(`/terremoti?${q}`).catch(() => null);
  if (r?.ok) {
    const righe = eventiDaTesto(await r.text());
    dati = { eventi: righe.map(featureDaEventoTesto), troncato: righe.length >= MASSIMO_TESTO };
  } else if (da < adesso - GIORNI_SNAPSHOT * GIORNO_MS) dati = await rispostaDaArchivio({ da, a, magMin, profMin, profMax }, fetchFn, Infinity);
  else {
    const s = await fetchFn(`${URL_SNAPSHOT}terremoti.json`).catch(() => null);
    if (!s?.ok) throw new Error(`archivio ${r?.status ?? 'non raggiungibile'}`);
    dati = rispostaDaSnapshot(await s.json(), { da, a, magMin, profMin, profMax }, Infinity);
  }
  return { eventi: eventiNelFiltro(dati.eventi, area, profMin, profMax), troncato: Boolean(dati.troncato) };
}

// Riga del formato testo → feature GeoJSON dell'INGV (la stessa forma che legge eventoDaIngv)
const featureDaEventoTesto = e => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: e.prof == null ? [e.lon, e.lat] : [e.lon, e.lat, e.prof] },
  properties: { eventId: e.id, time: e.time, mag: e.mag, magType: e.tipoMag, place: e.luogo, author: e.autore, type: '' },
});

// Formato «text» di INGV: righe separate da «|», la prima con l'intestazione. Colonne: 0 = id, 1 = ora, 2-3 = lat/lon, 4 = profondità, 5 = autore, 9 = tipo magnitudo, 10 = magnitudo, 12 = zona
export function eventiDaTesto(testo) {
  const eventi = [];
  for (const riga of String(testo).split('\n')) {
    if (!riga || riga.startsWith('#')) continue;
    const c = riga.split('|');
    const ts = oraEvento(c[1]), mag = Number(c[10]), lat = Number(c[2]), lon = Number(c[3]), prof = Number(c[4]);
    if (Number.isFinite(ts) && Number.isFinite(mag)) eventi.push({ ts, mag, id: c[0], time: c[1], lat: c[2] === '' ? NaN : lat, lon: c[3] === '' ? NaN : lon, prof: c[4] !== '' && Number.isFinite(prof) ? prof : null, tipoMag: c[9] ?? '', autore: c[5] ?? '', luogo: c[12] ?? '' });
  }
  return eventi;
}

// Inizio della barra che contiene `ts` e della successiva (ora locale: «giorno» è il giorno di calendario del browser)
function inizioBarra(ts, unita, passo = 0) {
  const d = new Date(ts);
  if (unita === 'giorno') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + passo).getTime();
  if (unita === 'mese') return new Date(d.getFullYear(), d.getMonth() + passo, 1).getTime();
  return new Date(d.getFullYear() + passo, 0, 1).getTime();
}

// Segna `sciame` e `quota` su ogni barra e riunisce le barre di sciame consecutive in sequenze (le più numerose per prime)
export function marcaSciami(barre) {
  const n = barre.length;
  // mediana e scarto mediano (robusti: gli sciami stessi non alzano la soglia)
  const mediana = v => { const o = [...v].sort((a, b) => a - b); return (o[Math.floor((n - 1) / 2)] + o[Math.ceil((n - 1) / 2)]) / 2; };
  const centro = mediana(barre.map(b => b.n));
  const scarto = Math.max(1, mediana(barre.map(b => Math.abs(b.n - centro))));
  const soglia = Math.max(MIN_SCIAME, Math.ceil(centro + 4 * scarto));
  const max = Math.max(1, ...barre.map(b => b.n));
  for (const b of barre) { b.sciame = b.n >= soglia; b.quota = b.n / max * 100; }
  const sequenze = [];
  for (const b of barre) {
    if (!b.sciame) continue;
    const ultima = sequenze.at(-1);
    if (ultima && ultima.a === b.da) { ultima.a = b.a; ultima.n += b.n; ultima.barre++; ultima.magMax = Math.max(ultima.magMax, b.magMax); }
    else sequenze.push({ da: b.da, a: b.a, n: b.n, barre: 1, magMax: b.magMax });
  }
  return { sequenze: sequenze.sort((x, y) => y.n - x.n), soglia };
}

// Barre della serie (dalla più vecchia alla più recente) con il conteggio degli eventi M ≥ magMin e la magnitudo massima; `sciame` = barra anomala rispetto alle altre.
// Le sequenze sono le barre di sciame consecutive, riunite.
export function serieEventi(eventi, unita, magMin = MAG_STORICO, adesso = Date.now()) {
  const n = FINESTRE[unita];
  const barre = [];
  for (let i = n - 1; i >= 0; i--) {
    const da = inizioBarra(inizioBarra(adesso, unita), unita, -i);
    barre.push({ da, a: inizioBarra(da, unita, 1), n: 0, magMax: null, sciame: false });
  }
  const primo = barre[0].da;
  for (const e of eventi) {
    if (e.mag < Math.max(magMin, MAG_STORICO) || e.ts < primo || e.ts > adesso) continue;
    const b = barre.find(x => e.ts >= x.da && e.ts < x.a);
    if (!b) continue;
    b.n++;
    if (b.magMax == null || e.mag > b.magMax) b.magMax = e.mag;
  }
  const { sequenze, soglia } = marcaSciami(barre);
  return { unita, barre, sequenze, soglia, totale: barre.reduce((s, b) => s + b.n, 0) };
}

// Grafico magnitudo-tempo: ogni evento è uno stelo alto quanto la magnitudo, sulla stessa finestra della serie a barre.
// `x` e `y` sono quote 0-1 (y = 0 sulla base, 1 in cima all'asse); la scossa più forte è la mainshock, quelle dopo di lei le repliche.
export function puntiMagnitudo(eventi, unita, magMin = MAG_STORICO, adesso = Date.now()) {
  const da = inizioBarra(inizioBarra(adesso, unita), unita, -(FINESTRE[unita] - 1));
  const minimo = Math.max(magMin, MAG_STORICO);
  const scelti = eventi.filter(e => e.mag >= minimo && e.ts >= da && e.ts <= adesso).sort((a, b) => a.ts - b.ts);
  const base = Math.floor(minimo);
  const cima = Math.max(base + 2, Math.ceil(scelti.reduce((m, e) => Math.max(m, e.mag), 0)));
  const durata = adesso - da;
  const punti = scelti.map(e => ({ ...e, x: (e.ts - da) / durata, y: (e.mag - base) / (cima - base) }));
  const mainshock = punti.reduce((a, b) => (!a || b.mag > a.mag ? b : a), null);
  const repliche = mainshock ? punti.filter(p => p.ts > mainshock.ts).length : 0;
  const livelli = Array.from({ length: cima - base + 1 }, (_, i) => base + i);
  return { da, a: adesso, base, cima, livelli, punti, mainshock, repliche };
}

// Zoom su un tratto del tempo: stessi dati di `g` ristretti a [da, a], con `x` rifatta su quel tratto (la scala delle magnitudo non cambia).
// La mainshock è la più forte del tratto.
export function finestraTempo(g, da, a) {
  const durata = a - da;
  const punti = g.punti.filter(p => p.ts >= da && p.ts <= a).map(p => ({ ...p, x: (p.ts - da) / durata }));
  const mainshock = punti.reduce((m, p) => (!m || p.mag > m.mag ? p : m), null);
  const repliche = mainshock ? punti.filter(p => p.ts > mainshock.ts).length : 0;
  return { ...g, da, a, punti, mainshock, repliche };
}

// Curva cumulativa: eventi accumulati nel tempo, sulla stessa finestra del grafico magnitudo-tempo. `g` = risultato di puntiMagnitudo.
// `passi` = vertici della scala (x 0-1, n = eventi finora); un cambio di pendenza segnala un aumento (o un calo) di attività.
export function curvaCumulativa(g) {
  const passi = [{ x: 0, n: 0 }];
  g.punti.forEach((p, i) => passi.push({ x: p.x, n: i }, { x: p.x, n: i + 1 }));
  const totale = g.punti.length;
  passi.push({ x: 1, n: totale });
  return { passi, totale };
}

// Legge di Omori: repliche per giorno dopo la mainshock. `giorni` = bin di 24 ore dalla scossa (t = metà del bin, in giorni), solo quelli completi;
// `fit` = retta sul piano log-log, n ≈ K · t^-p (minimi quadrati sui giorni con almeno una replica), o null con meno di 3 punti.
export function omori(g) {
  const m = g.mainshock;
  if (!m) return { giorni: [], fit: null, mainshock: null };
  const completi = Math.floor((g.a - m.ts) / GIORNO_MS);
  const n = Array(completi).fill(0);
  for (const p of g.punti) {
    const i = Math.floor((p.ts - m.ts) / GIORNO_MS);
    if (p.ts > m.ts && i >= 0 && i < completi) n[i]++;
  }
  const giorni = n.map((c, i) => ({ t: i + 0.5, n: c }));
  const v = giorni.filter(d => d.n > 0);
  let fit = null;
  if (v.length >= 3) {
    const x = v.map(d => Math.log10(d.t)), y = v.map(d => Math.log10(d.n));
    const mx = x.reduce((s, a) => s + a, 0) / v.length, my = y.reduce((s, a) => s + a, 0) / v.length;
    const sxx = x.reduce((s, a) => s + (a - mx) ** 2, 0);
    if (sxx > 0) {
      const pend = x.reduce((s, a, i) => s + (a - mx) * (y[i] - my), 0) / sxx;
      fit = { p: -pend, logK: my - pend * mx };
    }
  }
  return { giorni, fit, mainshock: m };
}

// Momento sismico di una magnitudo (N·m, relazione di Hanks e Kanamori): ogni unità di magnitudo vale circa 32 volte più energia.
export const momentoSismico = m => 10 ** (1.5 * m + 9.1);
export const magnitudoDaMomento = m0 => (Math.log10(m0) - 9.1) * 2 / 3;

// Dove sta l'evento `p` nella sequenza `punti` (gli eventi del grafico): posizione, scarto dalla scossa più forte, rango per magnitudo, quota di energia,
// attese dall'evento prima e dopo, repliche, tre vicini e profondità di tutti gli eventi.
const chiaveEvento = e => String(e.id ?? e.ts);
export function statisticheEvento(punti, p) {
  const ordine = [...punti].sort((a, b) => a.ts - b.ts);
  const i = ordine.findIndex(e => chiaveEvento(e) === chiaveEvento(p));
  if (i < 0) return null;
  const forte = ordine.reduce((m, e) => (!m || e.mag > m.mag ? e : m), null);
  const totale = ordine.reduce((somma, e) => somma + momentoSismico(e.mag), 0);
  const geo = e => Number.isFinite(e.lon) && Number.isFinite(e.lat);
  const dopo = ordine.slice(i + 1);
  const vicini = geo(p) ? ordine.filter(e => e !== ordine[i] && geo(e)).map(e => ({ e, km: distanzaKm([p.lon, p.lat], [e.lon, e.lat]) })).sort((a, b) => a.km - b.km) : [];
  const prof = ordine.map(e => e.prof).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    posizione: i + 1, totale: ordine.length,
    primo: forte === ordine[i], scartoMs: p.ts - forte.ts,
    rango: ordine.filter(e => e.mag > p.mag).length + 1,
    quota: momentoSismico(p.mag) / totale,
    precedenteMs: i > 0 ? p.ts - ordine[i - 1].ts : null, successivoMs: dopo.length ? dopo[0].ts - p.ts : null,
    entro24h: dopo.filter(e => e.ts - p.ts <= 86400000).length,
    entro50km: geo(p) ? dopo.filter(e => geo(e) && distanzaKm([p.lon, p.lat], [e.lon, e.lat]) <= 50).length : null,
    vicini: vicini.slice(0, 3),
    profondita: prof, mediana: prof.length ? (prof[(prof.length - 1) >> 1] + prof[prof.length >> 1]) / 2 : null,
  };
}

// Rilascio cumulativo: momento sismico accumulato, in quota 0-1 del totale della finestra. A differenza del conteggio è dominato dai pochi eventi grandi.
// `magEquiv` = magnitudo di un unico terremoto con tutto il momento della finestra; `quotaMax` = quota dell'evento più forte.
export function rilascioCumulativo(g) {
  const tot = g.punti.reduce((s, p) => s + momentoSismico(p.mag), 0);
  if (!tot) return { passi: [], totale: 0, magEquiv: null, quotaMax: 0 };
  const passi = [{ x: 0, f: 0 }];
  let acc = 0;
  for (const p of g.punti) {
    const prima = acc / tot;
    acc += momentoSismico(p.mag);
    passi.push({ x: p.x, f: prima }, { x: p.x, f: acc / tot });
  }
  passi.push({ x: 1, f: 1 });
  return { passi, totale: tot, magEquiv: magnitudoDaMomento(tot), quotaMax: momentoSismico(g.mainshock.mag) / tot };
}

// Tempi tra eventi successivi: classi (minuti) dall'attesa più breve alla più lunga. Un'attività di fondo ha attese lunghe e sparse;
// uno sciame riempie le classi brevi. `cv` = deviazione standard / media delle attese: ≈ 1 se gli eventi arrivano a caso, > 1 se sono raggruppati.
export const CLASSI_ATTESA = [0, 1, 10, 60, 360, 1440, 4320, 10080, 43200, 129600, 525600]; // minuti: inizio di ogni classe
export function tempiTraEventi(g) {
  const ts = g.punti.map(p => p.ts);
  if (ts.length < 3) return null;
  const attese = ts.slice(1).map((x, i) => (x - ts[i]) / 60000);
  const classi = CLASSI_ATTESA.map((da, i) => ({ da, a: CLASSI_ATTESA[i + 1] ?? Infinity, n: 0 }));
  for (const a of attese) classi[classi.findLastIndex(c => a >= c.da)].n++;
  const media = attese.reduce((s, a) => s + a, 0) / attese.length;
  const ord = [...attese].sort((a, b) => a - b);
  const mediana = (ord[Math.floor((ord.length - 1) / 2)] + ord[Math.ceil((ord.length - 1) / 2)]) / 2;
  const varianza = attese.reduce((s, a) => s + (a - media) ** 2, 0) / attese.length;
  return { classi, n: attese.length, mediana, media, cv: media ? Math.sqrt(varianza) / media : 0, max: Math.max(...classi.map(c => c.n)) };
}

// Diagramma spazio-tempo: x = tempo (quota 0-1 della finestra), y = latitudine (quota 0-1 tra la più bassa e la più alta). Mostra se uno sciame migra verso nord o sud.
export function spazioTempo(g) {
  const geo = g.punti.filter(p => Number.isFinite(p.lat));
  if (geo.length < 2) return null;
  let min = Math.min(...geo.map(p => p.lat)), max = Math.max(...geo.map(p => p.lat));
  if (max - min < 0.1) { min -= 0.05; max += 0.05; }
  return { punti: geo.map(p => ({ ...p, y: (p.lat - min) / (max - min) })), latMin: min, latMax: max, mainshock: geo.includes(g.mainshock) ? g.mainshock : null };
}

// Proprietà di un evento dello storico, come quelle di un evento in mappa (per popup e scheda), o null se mancano le coordinate
export function proprietaStorico(e, adesso = Date.now()) {
  if (!Number.isFinite(e?.lon) || !Number.isFinite(e?.lat)) return null;
  const fascia = fasciaEta(e.ts, adesso);
  return { id: String(e.id), mag: e.mag, tipoMag: e.tipoMag ?? '', luogo: e.luogo ?? '', ts: e.ts, prof: e.prof ?? null, autore: e.autore ?? '', fascia: fascia.nome, colore: fascia.colore, raggio: raggioMagnitudo(e.mag), lon: e.lon, lat: e.lat };
}

// Etichetta breve sotto la barra e testo completo del suggerimento
export function etichettaBarra(b, unita) {
  const f = opz => new Date(b.da).toLocaleDateString(localeIntl(), opz);
  if (unita === 'giorno') return { breve: f({ day: 'numeric' }), lunga: f({ day: 'numeric', month: 'long', year: 'numeric' }) };
  if (unita === 'mese') return { breve: f({ month: 'short' }).slice(0, 3), lunga: f({ month: 'long', year: 'numeric' }) };
  return { breve: f({ year: 'numeric' }), lunga: f({ year: 'numeric' }) };
}

// Periodo di una sequenza: «12 ott» o «12 – 15 ott 2026» (l'ultima barra è inclusa)
export function periodoSequenza(s, unita) {
  const opz = unita === 'giorno' ? { day: 'numeric', month: 'short' } : unita === 'mese' ? { month: 'short', year: 'numeric' } : { year: 'numeric' };
  const fmt = ts => new Date(ts).toLocaleDateString(localeIntl(), opz);
  const dal = fmt(s.da), al = fmt(s.a - 1);
  return dal === al ? dal : `${dal} – ${al}`;
}

export const voceSerie = dinamico => ({
  chiave: 'terremoti:serie', tipo: 'terremoto', peso: PESO_LUOGO, strato: 'terremoti', titolo: 'Terremoti nel tempo', icona: 'terremoto', sempre: true,
  gruppi: [], dinamico,
  fonte: t('layer.fonte', { fonte: tl(FONTE) }),
});

// Riassunto per la legenda: quanti eventi e il più forte
export function riassuntoTerremoti(eventi) {
  if (!eventi.length) return null;
  const forte = eventi.reduce((a, b) => (b.mag > a.mag ? b : a));
  return { n: eventi.length, forte };
}
