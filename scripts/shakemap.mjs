// Copia i contorni GeoJSON delle ShakeMap INGV (shakemap.ingv.it non ha CORS: il browser non li può leggere da lì).
// Uso: node scripts/shakemap.mjs <cartella> — la cartella è il ramo `shakemap` già estratto: scrive <id>/<prodotto>.json e elenco.json,
// salta gli eventi già copiati salvo quelli recenti (l'INGV ripubblica le versioni nei primi giorni). Lo lancia .github/workflows/shakemap.yml.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const SITO = 'https://shakemap.ingv.it';
const PRODOTTI = ['mmi', 'pga', 'pgv', 'psa0p3', 'psa1p0', 'psa3p0']; // cont_<prodotto>.json (cont_mi.json è identico a cont_mmi.json: non si copia)
const GIORNI_RECENTI = 3;
const PARALLELI = 8;

const uscita = process.argv[2];
if (!uscita) { console.error('uso: node scripts/shakemap.mjs <cartella>'); process.exit(2); }
mkdirSync(uscita, { recursive: true });

const r = await fetch(`${SITO}/events.json`, { signal: AbortSignal.timeout(60000) });
if (!r.ok) throw new Error(`events.json: ${r.status}`);
const eventi = Object.values(await r.json()).flatMap(anno => Object.values(anno).flat());
if (!eventi.length) throw new Error('events.json vuoto: niente da copiare');

const limite = Date.now() - GIORNI_RECENTI * 86400000;
const recente = e => Date.UTC(e.year, e.month - 1, e.day, e.h, e.m, Math.floor(e.s)) >= limite;
const da_fare = eventi.filter(e => recente(e) || !existsSync(`${uscita}/${e.id}/mmi.json`));

async function copia(e) {
  mkdirSync(`${uscita}/${e.id}`, { recursive: true });
  let n = 0;
  for (const p of PRODOTTI) {
    const risposta = await fetch(`${SITO}/data/${e.id}/current/products/cont_${p}.json`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!risposta?.ok) continue;
    const testo = JSON.stringify(await risposta.json()); // compatto: via spazi e rientri
    writeFileSync(`${uscita}/${e.id}/${p}.json`, testo);
    n++;
  }
  return n;
}

let copiati = 0, vuoti = 0;
for (let i = 0; i < da_fare.length; i += PARALLELI) {
  const n = await Promise.all(da_fare.slice(i, i + PARALLELI).map(copia));
  for (const k of n) k ? copiati++ : vuoti++;
}
// elenco compatto: l'app lo legge una volta sola per sapere quali eventi hanno una ShakeMap
writeFileSync(`${uscita}/elenco.json`, JSON.stringify(eventi.map(e => String(e.id))));
console.log(`${eventi.length} eventi, ${da_fare.length} scaricati (${copiati} con contorni, ${vuoti} senza)`);
