import { righe } from '../core/scheda-util.js';
import { t, tl, localeIntl } from '../core/i18n.js';

// Modello puro dell'allerta meteo-idro del Dipartimento della Protezione Civile per le 187 zone di allerta d'Italia: la card della scheda (tab «Luogo») e il riassunto della legenda.
// I dati li serve il server locale (/allerte): una feature per zona, con i livelli di oggi e di domani; il livello è 0 (nessuna allerta), 1 gialla, 2 arancione, 3 rossa.

const FONTE = 'Dipartimento della Protezione Civile, bollettino di criticità nazionale (CC BY 4.0)';
export const LINK = 'https://mappe.protezionecivile.gov.it/it/mappe-rischi/bollettino-di-criticita/';
const PESO_LUOGO = 8;
const ROSSO_ALLERTA = '#d7263d'; // scheda chiusa all'apertura e rossa quando la zona ha un'allerta oggi o domani

export const LIVELLI = [
  { nome: 'Nessuna allerta', colore: '#90c985' },
  { nome: 'Allerta gialla', colore: '#f8f865' },
  { nome: 'Allerta arancione', colore: '#f0bf01' },
  { nome: 'Allerta rossa', colore: '#fd6767' },
];
export const coloreLivello = n => (LIVELLI[n] ?? LIVELLI[0]).colore;
export const nomeLivello = n => (LIVELLI[n] ?? LIVELLI[0]).nome;

const ora = d => d.toLocaleTimeString(localeIntl(), { hour: '2-digit', minute: '2-digit' });
const data = d => d.toLocaleDateString(localeIntl(), { day: 'numeric', month: 'long' });

// «Nessuna allerta» oppure «Allerta gialla (temporali)»: i rischi che hanno fatto salire il livello
function testoGiorno(g) {
  if (!g || !g.livello) return tl(nomeLivello(0));
  const rischi = [['idraulico', t('allerte.idraulico')], ['temporali', t('allerte.temporali')], ['idrogeologico', t('allerte.idrogeologico')]]
    .filter(([k]) => g[k] === g.livello).map(([, nome]) => nome);
  return rischi.length ? `${tl(nomeLivello(g.livello))} (${rischi.join(', ')})` : tl(nomeLivello(g.livello));
}

export const livelloMassimo = p => Math.max(p?.oggi?.livello ?? 0, p?.domani?.livello ?? 0);

const MAX_RIGHE = 10;

// Righe della legenda e della scheda per `giorno` ('oggi' o 'domani'): prima la zona cliccata (anche senza allerta), poi le zone in allerta dalla più grave,
// al massimo MAX_RIGHE. Senza zona cliccata e senza allerte una riga sola.
export function modelloAllerte(zone, giorno, zonaCliccata = null) {
  const riga = z => ({ livello: z[giorno]?.livello ?? 0, testo: `${z.zona}: ${testoGiorno(z[giorno])}` });
  const inAllerta = zone.filter(z => z !== zonaCliccata && z.zona !== zonaCliccata?.zona && (z[giorno]?.livello ?? 0) > 0).sort((a, b) => b[giorno].livello - a[giorno].livello).map(riga);
  const righe = [...(zonaCliccata ? [riga(zonaCliccata)] : []), ...inAllerta].slice(0, MAX_RIGHE);
  if (!righe.length) righe.push({ livello: 0, testo: t('allerte.nessunaInItalia') });
  return { titolo: `${tl('Allerta meteo-idro')} · ${t(`allerte.${giorno}`)}`, righe };
}

function righeAllerta(p, adesso) {
  const agg = Number.isFinite(p.aggiornato) ? new Date(p.aggiornato * 1000) : null;
  return righe([
    ['Zona di allerta', p.zona],
    ['Oggi', testoGiorno(p.oggi)],
    ['Domani', testoGiorno(p.domani)],
    ['Comuni', Array.isArray(p.comuni) ? p.comuni.join(', ') : ''],
    ['Bollettino', p.bollettino],
    ['Pubblicato', agg ? `${agg.toDateString() === adesso.toDateString() ? '' : `${data(agg)}, `}${ora(agg)}` : ''],
  ]);
}

// `p` = proprietà della zona dal server (oggi e domani sono oggetti; `aggiornato` in secondi, aggiunto dal layer)
export function voceAllerta(p, adesso = new Date()) {
  return {
    chiave: 'allerta-meteo', tipo: 'allerta', peso: PESO_LUOGO, strato: 'allerte', titolo: tl('Allerta meteo-idro'), icona: 'allerta', badge: tl(nomeLivello(livelloMassimo(p))), sempre: true, aperta: false, ...(livelloMassimo(p) > 0 ? { tinta: ROSSO_ALLERTA } : {}),
    gruppi: [{ righe: righeAllerta(p, adesso) }],
    link: { testo: 'Bollettino della Protezione Civile', url: LINK, icona: 'esterno', suggerimento: 'Allertamento meteo-idro sul sito della Protezione Civile' },
    fonte: t('layer.fonte', { fonte: tl(FONTE) }),
  };
}
