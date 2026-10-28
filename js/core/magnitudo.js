// Classi della magnitudo: una sola scala per tutta l'app. La usano i cerchi in mappa, la scheda dell'evento, i popup,
// l'istogramma «Eventi per magnitudo», i riepiloghi dell'archivio e la legenda del tema magnitudo.
// `da`/`a` = intervallo [da, a) della classe (`a` = Infinity nell'ultima); il filtro per classe accende e spegne questi
// intervalli. `raggio` = raggio del cerchio in pixel (i layer lo leggono dalla proprietà `raggio` della feature) e
// `colore` = colore del tema magnitudo.
export const CLASSI_MAGNITUDO = [
  { chiave: 'fino2', da: 1, a: 2, raggio: 3, colore: '#fde68a' },
  { chiave: 'da2', da: 2, a: 3, raggio: 5, colore: '#fbbf24' },
  { chiave: 'da3', da: 3, a: 4, raggio: 7, colore: '#f97316' },
  { chiave: 'da4', da: 4, a: 5, raggio: 10, colore: '#c2410c' },
  { chiave: 'da5', da: 5, a: Infinity, raggio: 14, colore: '#dc2626' },
];

// Lo zoom a cui i cerchi in mappa hanno il raggio di CLASSI_MAGNITUDO: i layer interpolano 0,8 volte il raggio a zoom 6
// e 1,6 volte a zoom 12, quindi a 7,5 il moltiplicatore è 1. La legenda disegna i cerchi a questa scala.
export const ZOOM_LEGENDA = 7.5;

// Indice della classe di una magnitudo: l'ultima per i valori fuori scala
export const classeMagnitudo = m => Math.max(0, CLASSI_MAGNITUDO.findIndex(c => m < c.a));

// Magnitudo → raggio e colore del cerchio (tema magnitudo)
export const raggioMagnitudo = m => CLASSI_MAGNITUDO[classeMagnitudo(m)].raggio;
export const coloreMagnitudo = m => CLASSI_MAGNITUDO[classeMagnitudo(m)].colore;

// Espressione MapLibre del colore per classe di magnitudo, sul campo `classeMag` della feature (grigio se manca)
export const espressioneColoreMagnitudo = (campo = 'classeMag') => [
  'match', ['get', campo], ...CLASSI_MAGNITUDO.flatMap((c, i) => [i, c.colore]), '#868e96',
];

// Espressione MapLibre che tiene solo le classi accese (`classi` = Set di indici, null per tutte): null = nessun filtro.
// La usano gli strati dei terremoti che filtrano in mappa senza ripassare dal server (storici e confronto).
export const espressioneClassiMagnitudo = (classi, campo = 'classeMag') => (classi && classi.size < CLASSI_MAGNITUDO.length
  ? ['in', ['get', campo], ['literal', [...classi]]]
  : null);

// Slider della magnitudo delle legende (layers/slider-magnitudo.js): scala 0–10 a passi di 0,1. L'estremo alto è
// aperto: con la maniglia in fondo scala il filtro non ha un massimo, così anche un evento più forte di 10 resta in mappa.
export const SLIDER_MAGNITUDO = Object.freeze({ min: 0, max: 10, passo: 0.1 });
const DECIMI = Math.round(1 / SLIDER_MAGNITUDO.passo); // 0,1 → 10: arrotonda i valori dello slider a un decimo
const dentroScala = v => Math.min(SLIDER_MAGNITUDO.max, Math.max(SLIDER_MAGNITUDO.min, Math.round((Number.isFinite(v) ? v : SLIDER_MAGNITUDO.min) * DECIMI) / DECIMI));

// Filtro (magMin, magMax) → posizione delle due maniglie; magMax null (nessun massimo) va a fondo scala.
export const maniglieMagnitudo = (magMin = SLIDER_MAGNITUDO.min, magMax = null) => {
  const da = dentroScala(magMin);
  return { da, a: magMax == null ? SLIDER_MAGNITUDO.max : Math.max(da, dentroScala(magMax)) };
};

// Maniglie → filtro: la maniglia alta a fondo scala vuol dire «nessun massimo» (null), non «magnitudo 8 esatta».
export const filtroMagnitudo = (da, a) => {
  const m = maniglieMagnitudo(da, a);
  return { magMin: m.da, magMax: m.a >= SLIDER_MAGNITUDO.max ? null : m.a };
};
