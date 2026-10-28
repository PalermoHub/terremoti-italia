import { URL_ARCHIVIO, CLASSI_MAG, classeMagnitudo, marcaSciami, momentoSismico, magnitudoDaMomento } from './scheda-terremoti.js';
import { localeIntl } from '../core/i18n.js';

// Modello puro dell'archivio storico: periodi (anni UTC), serie annuale e confronto tra due periodi, a partire dai riepiloghi di GET /terremoti/riepilogo.
export const ANNO_INIZIO = 1985;
// Dal 2005 la rete del Bollettino Sismico Italiano registra molti più eventi piccoli: prima, a M < 3, un confronto con anni recenti
// premierebbe gli anni nuovi solo perché il catalogo è migliorato (completezza diversa), non perché la sismicità sia cambiata.
export const ANNO_RETE_COMPLETA = 2005;
const GIORNO_MS = 86400000;

export const periodoAnno = anno => ({ da: Date.UTC(anno, 0, 1), a: Date.UTC(anno + 1, 0, 1) - 1 });

// Anno UTC del periodo e periodo che copre esattamente un anno: servono ai menu «Anno» e al confronto,
// che per i periodi personalizzati mostrano un intervallo di date invece del solo anno.
export const annoDi = p => new Date(p.da).getUTCFullYear();
export const periodoAnnoIntero = p => {
  const intero = periodoAnno(annoDi(p));
  return p.da === intero.da && p.a === intero.a;
};
const dataPeriodo = ts => new Date(ts).toLocaleDateString(localeIntl(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const etichettaPeriodo = p => {
  if (periodoAnnoIntero(p)) return String(annoDi(p));
  const da = dataPeriodo(p.da), a = dataPeriodo(p.a);
  return da === a ? da : `${da} – ${a}`;
};

// null = periodo valido; altrimenti la chiave i18n dell'errore
export function periodoValido({ da, a }, adesso = Date.now()) {
  if (da > a) return 'terremoti.arc.errInvertito';
  if (da < periodoAnno(ANNO_INIZIO).da) return 'terremoti.arc.errPrima';
  if (da > adesso) return 'terremoti.arc.errFuturo';
  return null;
}

// null = confronto accettabile; altrimenti la chiave i18n dell'avviso. Prima del 2005 il catalogo è completo solo dalle magnitudo
// più alte: confrontare a M ≥ 2 un anno di allora con uno recente farebbe sembrare il passato meno sismico di quanto fosse.
export function avvisoCompletezza(annoA, annoB, magMin) {
  return Math.min(annoA, annoB) < ANNO_RETE_COMPLETA && magMin < 3 ? 'terremoti.arc.completezza' : null;
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

// Mese con più eventi e quanto pesa sul totale: un anno può essere gonfiato dalle repliche di una sequenza concentrata in poche settimane.
function meseDominante(perMese, totale) {
  if (!perMese?.length || !totale) return null;
  let max = perMese[0];
  for (const m of perMese) if (m.n > max.n) max = m;
  return { mese: max.mese, n: max.n, quota: max.n / totale * 100 };
}

// Cumulata mese per mese dell'anno (12 valori, anche per i mesi senza eventi): serve al grafico che confronta due anni
function cumulataMensile(perMese) {
  const mesi = Array(12).fill(0);
  for (const m of perMese ?? []) {
    const i = Number(String(m.mese).slice(5, 7)) - 1;
    if (i >= 0 && i < 12) mesi[i] += m.n;
  }
  let totale = 0;
  return mesi.map((n, i) => ({ mese: i + 1, n, cumulati: (totale += n) }));
}

function statistiche(r, giorni) {
  const perClasse = Array(CLASSI_MAG.length).fill(0);
  const energiaClasse = Array(CLASSI_MAG.length).fill(0);
  let momento = 0, magMax = null;
  for (const { mag, n } of r.perMagnitudo) {
    const i = classeMagnitudo(mag);
    perClasse[i] += n;
    energiaClasse[i] += momentoSismico(mag) * n;
    momento += momentoSismico(mag) * n;
    if (magMax == null || mag > magMax) magMax = mag;
  }
  return { n: r.totale, magMax, perGiorno: r.totale / giorni, perClasse, energiaClasse, energia: momento, meseMax: meseDominante(r.perMese, r.totale), cumulata: cumulataMensile(r.perMese), magEquivalente: r.totale ? magnitudoDaMomento(momento) : null };
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
      magEquivalente: sa.magEquivalente != null && sb.magEquivalente != null ? Math.round((sb.magEquivalente - sa.magEquivalente) * 10) / 10 : null,
      energia: sa.energia && sb.energia ? sb.energia / sa.energia : null,
      perGiorno: sa.n ? sb.perGiorno - sa.perGiorno : null,
    },
  };
}

// Quota di energia (0–1) di ogni classe di magnitudo sul totale del periodo: pochi eventi forti pesano più dei tanti deboli
export const quoteEnergiaClassi = s => s.energiaClasse.map(e => (s.energia ? e / s.energia : 0));

// Sotto queste soglie le differenze sono rumore: «più eventi» solo oltre il 5 %, «stessa energia» tra ×0,8 e ×1,25
const SOGLIA_EVENTI = 5;
const SOGLIA_ENERGIA = 1.25;
// Da questa quota di eventi in un solo mese, il conteggio dell'anno segue una sequenza più che l'attività di fondo
export const QUOTA_MESE_SEQUENZA = 35;

// Frasi che dicono cosa significano i numeri del confronto: ogni voce è { chiave, ...valori } e il testo lo compone chi disegna.
// null se nessuno dei due periodi ha eventi.
export function conclusioniConfronto(c) {
  if (!c.a.n && !c.b.n) return null;
  const frasi = [];
  if (!c.a.n || !c.b.n) {
    frasi.push({ chiave: c.a.n ? 'soloA' : 'soloB' });
    return frasi;
  }
  const perc = c.differenza.nPercento;
  frasi.push(Math.abs(perc) < SOGLIA_EVENTI ? { chiave: 'eventiPari' } : { chiave: perc > 0 ? 'eventiPiu' : 'eventiMeno', perc: Math.abs(perc) });
  const r = c.differenza.energia;
  if (r != null) {
    if (r >= SOGLIA_ENERGIA) frasi.push({ chiave: 'energiaPiu', volte: r });
    else if (r <= 1 / SOGLIA_ENERGIA) frasi.push({ chiave: 'energiaMeno', volte: 1 / r });
    else frasi.push({ chiave: 'energiaPari' });
  }
  // il periodo più concentrato in un solo mese, se lo è abbastanza
  const lati = ['a', 'b'].filter(l => c[l].meseMax?.quota >= QUOTA_MESE_SEQUENZA).sort((x, y) => c[y].meseMax.quota - c[x].meseMax.quota);
  if (lati.length) frasi.push({ chiave: 'sequenza', lato: lati[0], mese: c[lati[0]].meseMax.mese, quota: c[lati[0]].meseMax.quota });
  return frasi;
}

// Mediana degli eventi per anno, per dire se un anno è fuori dall'ordinario. Esclude l'anno in corso (parziale) e, a magnitudo
// minima sotto 3, gli anni prima del 2005: lì la rete vedeva meno scosse piccole e la mediana risulterebbe troppo bassa.
// Gli anni sono quelli locali delle barre (come annoBarra). Null senza almeno 3 anni utili.
export function riferimentoAnnuale(serie, magMin, adesso = Date.now()) {
  const corrente = new Date(adesso).getUTCFullYear();
  const primo = magMin < 3 ? ANNO_RETE_COMPLETA : ANNO_INIZIO;
  const anni = serie.barre.map(b => ({ anno: new Date(b.da).getFullYear(), n: b.n })).filter(b => b.anno >= primo && b.anno < corrente);
  if (anni.length < 3) return null;
  const ord = anni.map(b => b.n).sort((x, y) => x - y);
  const mediana = (ord[Math.floor((ord.length - 1) / 2)] + ord[Math.ceil((ord.length - 1) / 2)]) / 2;
  return mediana > 0 ? { mediana, da: anni[0].anno, a: anni.at(-1).anno } : null;
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

// Griglia esagonale («pointy-top») della densità degli eventi, con la differenza tra i due periodi.
// Le celle sono uguali per A e B: il colore dice in quale anno ci sono stati più eventi, l'opacità quanto è netta la differenza.
export const RAGGIO_GRIGLIA = 0.15; // gradi: celle di circa 17 km in latitudine
const RADICE3 = Math.sqrt(3);
const COLORE_PIU_A = '#0ea5e9';
const COLORE_PIU_B = '#f97316';

// Cella esagonale che contiene il punto: coordinate cube arrotondate alla cella più vicina
function cellaEsagonale(lon, lat, raggio) {
  const q = (RADICE3 / 3 * lon - lat / 3) / raggio;
  const r = (2 / 3 * lat) / raggio;
  const x = q, z = r, y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

// Anello chiuso del poligono esagonale (6 vertici + il primo ripetuto)
export function anelloEsagono(q, r, raggio = RAGGIO_GRIGLIA) {
  const cx = raggio * RADICE3 * (q + r / 2), cy = raggio * 1.5 * r;
  const anello = Array.from({ length: 6 }, (_, i) => {
    const angolo = Math.PI / 3 * i + Math.PI / 6;
    return [cx + raggio * Math.cos(angolo), cy + raggio * Math.sin(angolo)];
  });
  anello.push(anello[0]);
  return anello;
}

// Eventi dei due periodi → FeatureCollection di celle con conteggi, differenza B − A e colore divergente.
// Gli eventi possono essere proprietà ({ lon, lat }) o feature GeoJSON.
export function grigliaDensita(eventiA, eventiB, raggio = RAGGIO_GRIGLIA) {
  const celle = new Map();
  const aggiungi = (e, lato) => {
    const lon = e?.lon ?? e?.geometry?.coordinates?.[0];
    const lat = e?.lat ?? e?.geometry?.coordinates?.[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const { q, r } = cellaEsagonale(lon, lat, raggio);
    const k = `${q},${r}`;
    const c = celle.get(k) ?? { q, r, a: 0, b: 0 };
    c[lato] += 1;
    celle.set(k, c);
  };
  for (const e of eventiA) aggiungi(e, 'a');
  for (const e of eventiB) aggiungi(e, 'b');
  const diverse = [...celle.values()].filter(c => c.a !== c.b);
  const massimo = Math.max(1, ...diverse.map(c => Math.abs(c.b - c.a)));
  return {
    type: 'FeatureCollection',
    features: diverse.map(c => {
      const differenza = c.b - c.a;
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [anelloEsagono(c.q, c.r, raggio)] },
        properties: {
          a: c.a, b: c.b, differenza,
          colore: differenza > 0 ? COLORE_PIU_B : COLORE_PIU_A,
          opacita: 0.12 + 0.5 * Math.sqrt(Math.abs(differenza) / massimo),
        },
      };
    }),
  };
}