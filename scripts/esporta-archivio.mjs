// Esporta l'archivio storico (dati/terremoti.sqlite) in file statici, per chi non ha il server (GitHub Pages):
// anni/AAAA.json (gli eventi dell'anno) e riepilogo-M.json (conteggi per mese e magnitudo, per ogni magnitudo minima dell'archivio).
// Uso: node scripts/esporta-archivio.mjs <cartella-di-uscita> [percorso-sqlite]. La cartella va pubblicata nel ramo `archivio`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { apriArchivio } from '../server/archivio.js';
import { AREA } from '../server/terremoti.js';

const uscita = process.argv[2];
const sqlite = process.argv[3] ?? new URL('../dati/terremoti.sqlite', import.meta.url).pathname;
if (!uscita) { console.error('uso: node scripts/esporta-archivio.mjs <cartella-di-uscita> [percorso-sqlite]'); process.exit(2); }
mkdirSync(`${uscita}/anni`, { recursive: true });

const MAGNITUDO_RIEPILOGHI = [2, 3, 4, 5]; // le magnitudo minime del pannello «Terremoti storici»
const archivio = apriArchivio(sqlite);
const ultimo = new Date(archivio.ultimoTs()).getUTCFullYear();
const primo = 1985;

let totale = 0;
for (let anno = primo; anno <= ultimo; anno++) {
  const { eventi } = archivio.interroga({ da: Date.UTC(anno, 0, 1), a: Date.UTC(anno + 1, 0, 1) - 1, magMin: 0, area: AREA, limite: 1e7 });
  if (!eventi.length) continue;
  // righe compatte: [id, tempo, lat, lon, profondità, magnitudo, tipo magnitudo, luogo, tipo]
  const righe = eventi.map(f => {
    const p = f.properties, [lon, lat, prof] = f.geometry.coordinates;
    return [p.eventId, p.time, lat, lon, prof ?? null, p.mag, p.magType ?? '', p.place ?? '', p.type ?? ''];
  });
  writeFileSync(`${uscita}/anni/${anno}.json`, JSON.stringify({ anno, righe }));
  totale += righe.length;
}
console.log(`anni/: ${totale} eventi dal ${primo} al ${ultimo}`);

for (const m of MAGNITUDO_RIEPILOGHI) {
  const r = archivio.riepilogo({ da: Date.UTC(primo, 0, 1), a: Date.now(), magMin: m, area: AREA });
  writeFileSync(`${uscita}/riepilogo-${m}.json`, JSON.stringify({ ...r, aggiornato: archivio.ultimoTs() }));
  console.log(`riepilogo-${m}.json: ${r.totale} eventi`);
}
archivio.chiudi();
