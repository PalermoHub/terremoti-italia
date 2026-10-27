// Carica lo storico dei terremoti dall'INGV nell'archivio locale, a finestre annuali; si può interrompere e riprendere.
//   node scripts/carica-storico.mjs --da 1985 --magmin 2 [--a 2026]
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { apriArchivio } from '../server/archivio.js';
import { scaricaIntervallo } from '../server/ingv.js';
import { AREA } from '../server/terremoti.js';

const arg = (nome, predefinito) => { const i = process.argv.indexOf(`--${nome}`); return i > 0 ? Number(process.argv[i + 1]) : predefinito; };
const daAnno = arg('da', 1985);
const aAnno = arg('a', new Date().getUTCFullYear());
const magMin = arg('magmin', 2);

const radice = fileURLToPath(new URL('..', import.meta.url));
mkdirSync(`${radice}dati`, { recursive: true });
const archivio = apriArchivio(process.env.ARCHIVIO ?? `${radice}dati/terremoti.sqlite`);
const inizio = Date.now();
let totale = 0;
for (let anno = daAnno; anno <= aAnno; anno++) {
  const da = Date.UTC(anno, 0, 1);
  const a = Math.min(Date.UTC(anno + 1, 0, 1) - 1000, Date.now());
  for (let tentativo = 1; ; tentativo++) {
    try {
      const eventi = await scaricaIntervallo({ da, a, magMin, area: AREA });
      const cambiati = archivio.salva(eventi);
      totale += cambiati;
      console.log(`${anno}: ${eventi.length} eventi dall'INGV, ${cambiati} nuovi o aggiornati`);
      break;
    } catch (e) {
      if (tentativo === 3) { console.error(`${anno}: non riuscito (${e.message}); rilancia lo script per riprendere`); process.exit(1); }
      await new Promise(r => setTimeout(r, 3000 * tentativo));
    }
  }
}
console.log(`fine: ${totale} eventi nuovi o aggiornati in ${Math.round((Date.now() - inizio) / 1000)} s; nell'archivio ${archivio.interroga({ da: 0, a: Date.now(), magMin: 0, area: AREA, limite: 1 }).totale} eventi`);
archivio.chiudi();
