// Genera dati/placche-margini.json (margini di placca nell'area dell'app) dal modello PB2002 di Peter Bird (2003).
// Uso: node scripts/placche-margini.mjs PB2002_steps.json > dati/placche-margini.json
// Fonte: https://github.com/fraxen/tectonicplates (GeoJSON del modello; originale: http://peterbird.name/publications/2003_PB2002/2003_PB2002.htm).
// Si tengono i tratti che toccano il riquadro LIMITI di js/core/config.js. Proprietà: `classe` (STEPCLASS di Bird),
// `tipo` (divergente | convergente | trasforme), `placche` (coppia di placche, es. «AF-EU») e la velocità relativa
// in mm/anno: `vel` (modulo), `div` (componente di allontanamento, negativa se le placche si avvicinano) e
// `lat` (componente laterale destra, negativa se sinistra).
import { readFileSync } from 'node:fs';

const [[W, S], [E, N]] = [[-6.0, 30.0], [30.0, 52.0]];
const TIPI = { OSR: 'divergente', CRB: 'divergente', OCB: 'convergente', CCB: 'convergente', SUB: 'convergente', OTF: 'trasforme', CTF: 'trasforme' };
const arrotonda = v => Math.round(v * 100) / 100;
const mm = v => Math.round(v * 10) / 10;

const dati = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const features = [];
for (const f of dati.features) {
  const tipo = TIPI[f.properties.STEPCLASS];
  const linea = f.geometry.coordinates;
  if (!tipo) continue;
  const xs = linea.map(p => p[0]), ys = linea.map(p => p[1]);
  if (Math.max(...xs) < W || Math.min(...xs) > E || Math.max(...ys) < S || Math.min(...ys) > N) continue;
  features.push({
    type: 'Feature',
    properties: {
      classe: f.properties.STEPCLASS, tipo, placche: f.properties.PLATEBOUND,
      vel: mm(f.properties.VELOCITYLE), div: mm(f.properties.VELOCITYDI), lat: mm(f.properties.VELOCITYRI),
    },
    geometry: { type: 'LineString', coordinates: linea.map(p => [arrotonda(p[0]), arrotonda(p[1])]) },
  });
}
process.stdout.write(JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
