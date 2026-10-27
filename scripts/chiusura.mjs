// Chiusura transitiva degli import relativi a partire da uno o più file: un file per riga; esce 1 se un import non esiste.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;
const visti = new Set();
const mancanti = [];
const pila = process.argv.slice(2).map(f => resolve(f));
while (pila.length) {
  const f = pila.pop();
  if (visti.has(f)) continue;
  if (!existsSync(f)) { mancanti.push(f); continue; }
  visti.add(f);
  for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
    if (m[1].endsWith('.js') || m[1].endsWith('.mjs') || m[1].endsWith('.json')) pila.push(resolve(dirname(f), m[1]));
  }
}
for (const f of [...visti].sort()) console.log(f);
for (const f of mancanti) console.error(`import mancante: ${f}`);
process.exit(mancanti.length ? 1 : 0);
