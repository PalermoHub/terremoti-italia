// Snapshot statico dei dati in tempo reale, per chi non ha il server (GitHub Pages): terremoti.json (ultimi 30 giorni, M ≥ 1) e allerte.json (bollettino DPC).
// Uso: node scripts/snapshot.mjs <cartella-di-uscita>. Lo lancia .github/workflows/snapshot.yml, che pubblica la cartella nel ramo `snapshot`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { scaricaIntervallo } from '../server/ingv.js';
import { gestisciAllerte } from '../server/allerte-core.js';
import { AREA } from '../server/terremoti.js';

const uscita = process.argv[2];
if (!uscita) { console.error('uso: node scripts/snapshot.mjs <cartella-di-uscita>'); process.exit(2); }
mkdirSync(uscita, { recursive: true });

const GIORNI = 30;
const adesso = Date.now();
const eventi = await scaricaIntervallo({ da: adesso - GIORNI * 86400000, a: adesso, magMin: 1, area: AREA });
if (!eventi.length) throw new Error('nessun evento dall\'INGV: snapshot non scritto');
writeFileSync(`${uscita}/terremoti.json`, JSON.stringify({ eventi, aggiornato: adesso }));
console.log(`terremoti.json: ${eventi.length} eventi`);

// Elenco degli eventi con una ShakeMap su shakemap.ingv.it (il sito non ha CORS: lo legge il browser da qui).
try {
  const r = await fetch('https://shakemap.ingv.it/events.json', { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(String(r.status));
  const ids = Object.values(await r.json()).flatMap(anno => Object.values(anno).flat()).map(e => String(e.id));
  if (!ids.length) throw new Error('elenco vuoto');
  writeFileSync(`${uscita}/shakemap.json`, JSON.stringify(ids));
  console.log(`shakemap.json: ${ids.length} eventi`);
} catch (e) { console.warn(`shakemap.json non scritto: ${e.message}`); }

const r = await gestisciAllerte(fetch, {});
if (r.stato !== 200) throw new Error(`allerte: ${r.corpo}`);
writeFileSync(`${uscita}/allerte.json`, r.corpo);
console.log(`allerte.json: ${r.corpo.length} byte`);
