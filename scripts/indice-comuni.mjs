// Genera dati/indice-comuni.json (regioni, province e comuni con riquadro) dal pmtiles dei confini comunali.
// Uso: tippecanoe-decode -c comuni.pmtiles | node scripts/indice-comuni.mjs > dati/indice-comuni.json
// Il pmtiles ha un solo strato «comuni»; a zoom bassi i comuni piccoli sono scartati, quindi si legge ogni tile (anche lo zoom 11).
// Formato: { r: [[cod, nome, riquadro]], p: [[cod, nome, codReg, riquadro]], c: [[cod, nome, codProv, riquadro]] }, riquadro = [ovest, sud, est, nord].
import { createInterface } from 'node:readline';

const unisci = (m, k, nome, extra, b) => {
  const v = m.get(k);
  if (!v) return m.set(k, { nome, extra, b: [...b] });
  v.b = [Math.min(v.b[0], b[0]), Math.min(v.b[1], b[1]), Math.max(v.b[2], b[2]), Math.max(v.b[3], b[3])];
};
const riquadroDi = g => {
  let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visita = c => {
    if (typeof c[0] === 'number') { o = Math.min(o, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(visita);
  };
  visita(g.coordinates);
  return [o, s, e, n];
};
const R = new Map(), P = new Map(), C = new Map();
for await (const riga of createInterface({ input: process.stdin })) {
  const testo = riga.trim().replace(/,$/, '');
  if (!testo.startsWith('{ "type": "Feature"')) continue;
  const f = JSON.parse(testo);
  const p = f.properties, b = riquadroDi(f.geometry);
  unisci(R, p.cod_reg, p.den_reg, null, b);
  unisci(P, p.cod_uts, p.den_uts || p.den_prov, p.cod_reg, b);
  unisci(C, p.pro_com, p.comune, p.cod_uts, b);
}
const arrotonda = b => b.map(x => Math.round(x * 1e4) / 1e4);
const voci = (m, conExtra) => [...m].sort((a, b) => a[1].nome.localeCompare(b[1].nome, 'it'))
  .map(([k, v]) => [k, v.nome, ...(conExtra ? [v.extra] : []), arrotonda(v.b)]);
console.log(JSON.stringify({ r: voci(R, false), p: voci(P, true), c: voci(C, true) }));
