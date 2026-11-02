// Layout predisposti per i report periodici: ogni preset fissa il periodo e la magnitudo minima del filtro condiviso (come i menu
// «Periodo» e «Magnitudo» della scheda) e la soglia da cui il poster scrive la ML nei simboli e li elenca. Più lungo il periodo,
// più alta la soglia: una settimana mostra gli eventi da M 2, un anno solo quelli da M 4.
import { filtro } from '../layers/scheda-terremoti.js';
import { EVENTO_FILTRO } from '../layers/scheda-terremoti-dom.js';
import { periodoAnno } from '../layers/scheda-archivio.js';

// `giorni` = ultimi N giorni; `anno` = anno solare in corso; `magMin` = filtro della mappa; `elenco` = soglia di elenco e ML
export const REPORT = {
  settimanale: { giorni: 7, magMin: 2, elenco: 3 },
  mensile: { giorni: 30, magMin: 3, elenco: 4 },
  annuale: { anno: true, magMin: 4, elenco: 5 },
};

const GIORNO = 86400000;

// Periodo scelto, in UTC come gli altri periodi dell'app: `scelta` = { data: 'AAAA-MM-GG' } per la settimana (lunedì–domenica che
// contiene quel giorno), { anno, mese } per il mese (mese 0–11), { anno } per l'anno; senza scelta null = periodo in corso
export function periodoReport(chiave, scelta = {}) {
  if (chiave === 'settimanale' && scelta.data) {
    const [y, m, d] = scelta.data.split('-').map(Number);
    const giorno = new Date(Date.UTC(y, m - 1, d));
    const da = giorno.getTime() - ((giorno.getUTCDay() + 6) % 7) * GIORNO;
    return { da, a: da + 7 * GIORNO - 1 };
  }
  if (chiave === 'mensile' && Number.isInteger(scelta.anno) && Number.isInteger(scelta.mese)) return { da: Date.UTC(scelta.anno, scelta.mese, 1), a: Date.UTC(scelta.anno, scelta.mese + 1, 1) - 1 };
  if (chiave === 'annuale' && Number.isInteger(scelta.anno)) return periodoAnno(scelta.anno);
  return null;
}

// Imposta il filtro condiviso sul preset (e sul periodo scelto, se c'è) e avvisa i layer, che ricaricano gli eventi
export function applicaReport(chiave, scelta = {}, adesso = new Date()) {
  const r = REPORT[chiave];
  if (!r) return null;
  const scelto = periodoReport(chiave, scelta);
  const magMin = Number.isFinite(scelta.magMin) ? scelta.magMin : r.magMin; // la magnitudo scelta vale più di quella del preset
  filtro.magMin = magMin;
  filtro.magMax = null;
  filtro.finestra = null;
  if (scelto) filtro.periodo = scelto;
  else if (r.anno) filtro.periodo = periodoAnno(adesso.getUTCFullYear());
  else { filtro.periodo = null; filtro.giorni = r.giorni; }
  document.dispatchEvent(new CustomEvent(EVENTO_FILTRO));
  return { ...r, magMin, elenco: Math.max(r.elenco, magMin), periodo: scelto };
}
