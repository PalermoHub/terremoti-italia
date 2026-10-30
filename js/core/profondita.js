// Classi di profondità dell'ipocentro (km): una sola scala per tutta l'app. La usano la sezione verticale, i grafici, il layer
// «Terremoti per profondità», la legenda e il tema profondità dei cerchi in mappa, con il filtro per fascia.
// `fino` = estremo escluso della classe (l'ultima non ha limite): il limite appartiene alla classe sopra.
// Fino a 35 km sono le classi da 5 km della legenda del Bollettino Sismico Italiano (INGV); oltre restano le nostre (70, 150 km) per i piani di subduzione.
export const CLASSI_PROFONDITA = [
  { fino: 5, colore: '#3b1fc4' },
  { fino: 10, colore: '#4287f5' },
  { fino: 15, colore: '#6ecbff' },
  { fino: 20, colore: '#7cf29a' },
  { fino: 25, colore: '#b8f24d' },
  { fino: 30, colore: '#fbd34a' },
  { fino: 35, colore: '#f59e2b' },
  { fino: 70, colore: '#a3195b' },
  { fino: 150, colore: '#6b1146' },
  { fino: Infinity, colore: '#2a0a24' },
];

const COLORE_ASSENTE = '#868e96'; // profondità mancante: grigio, come la magnitudo fuori scala

// Indice della classe di una profondità; -1 se manca (null non è «0 km»: `null < 5` in JS sarebbe vero)
export const classeProfondita = prof => (Number.isFinite(prof) ? Math.max(0, CLASSI_PROFONDITA.findIndex(c => prof < c.fino)) : -1);
export const coloreProfondita = prof => CLASSI_PROFONDITA[classeProfondita(prof)]?.colore ?? COLORE_ASSENTE;

// Intervallo [da, a) della classe, con `a` = Infinity nell'ultima
export const intervalloClasseProfondita = i => [i ? CLASSI_PROFONDITA[i - 1].fino : 0, CLASSI_PROFONDITA[i].fino];

// Etichetta della classe senza unità: «< 5», «5–10», «≥ 150»
export function etichettaClasseProfondita(i) {
  const [da, a] = intervalloClasseProfondita(i);
  return a === Infinity ? `≥ ${da}` : i ? `${da}–${a}` : `< ${a}`;
}

// Espressione MapLibre del colore per profondità, sul campo `prof` della feature (grigio se manca)
export const espressioneColoreProfondita = (campo = 'prof') => [
  'case', ['==', ['typeof', ['get', campo]], 'number'],
  ['step', ['get', campo], CLASSI_PROFONDITA[0].colore, ...CLASSI_PROFONDITA.slice(0, -1).flatMap((c, i) => [c.fino, CLASSI_PROFONDITA[i + 1].colore])],
  COLORE_ASSENTE,
];

// Una fascia accesa come condizione MapLibre su `prof`
const condizioneClasse = (i, campo) => {
  const [da, a] = intervalloClasseProfondita(i);
  return ['all', ['>=', ['get', campo], da], ...(a === Infinity ? [] : [['<', ['get', campo], a]])];
};

// Tiene solo le fasce accese (`fasce` = Set di indici, null per tutte): null = nessun filtro. Senza profondità l'evento
// non sta in nessuna fascia: sparisce appena una fascia si spegne, come nel filtro in JS (`passaFasce`).
export const espressioneClassiProfondita = (fasce, campo = 'prof') => (fasce && fasce.size < CLASSI_PROFONDITA.length
  ? (fasce.size ? ['any', ...[...fasce].map(i => condizioneClasse(i, campo))] : ['==', 1, 0])
  : null);

export const passaFasce = (prof, fasce) => !fasce || fasce.has(classeProfondita(prof));
