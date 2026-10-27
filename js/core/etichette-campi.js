// Nomi leggibili dei campi dell'edificato nel tema per attributo e nella sua legenda: titolo del campo, unità delle classi,
// uso dell'edificio (occupancy, codici OBM/GEM: famiglia di 3 lettere + sottocodice) e colori di partenza per famiglia d'uso.
import { t } from './i18n.js';

const CAMPI = new Set(['altezza', 'occupancy', 'pop_stim']);
const UNITA = { altezza: ' m' };
// Colori dell'uso: quelli della palette di riferimento di OBM (Earth Engine); OCO non c'è, resta un grigio neutro.
const COLORI_FAMIGLIA = {
  RES: '#3498db', COM: '#e74c3c', MIX: '#9b59b6', IND: '#f39c12', AGR: '#27ae60',
  ASS: '#16a085', GOV: '#34495e', EDU: '#e67e22', UNK: '#bdc3c7', OCO: '#95a5a6',
};
const COLORI_SPECIFICI = { RES1: '#3498db', RES2: '#2980b9' };
const SPECIFICI = new Set(['RES1', 'RES2']); // gli unici sottocodici descritti dalla fonte (OBM)

export const nomeCampo = campo => (CAMPI.has(campo) ? t(`edificio.campo.${campo}`) : campo);
export const unitaCampo = campo => UNITA[campo] ?? '';

export const famigliaUso = codice => (/^[A-Z]{3}/.test(codice) && COLORI_FAMIGLIA[codice.slice(0, 3)] ? codice.slice(0, 3) : null);

// «Residenziale plurifamiliare (RES2)»: il codice resta in parentesi, per chi lo conosce e per i sottocodici senza descrizione.
export function nomeUso(codice) {
  const famiglia = famigliaUso(codice);
  if (!famiglia) return codice;
  const nome = t(`edificio.uso.${SPECIFICI.has(codice) ? codice : famiglia}`);
  return t('edificio.uso.conCodice', { nome, codice });
}

export const nomeValore = (campo, valore) => (campo === 'occupancy' ? nomeUso(valore) : valore);

// Colore di partenza di un valore: per l'uso uno per famiglia, con RES2 più scuro di RES e RES1, altrimenti null (sceglie la tavolozza).
export const coloreValore = (campo, valore) => (campo === 'occupancy' ? COLORI_SPECIFICI[valore] ?? COLORI_FAMIGLIA[famigliaUso(valore)] ?? null : null);

// Voci di legenda per categorie: per l'uso una riga per famiglia (RES, RES1 e RES2 sono «Residenziale»), col colore del codice di famiglia
// se c'è, altrimenti del primo sottocodice; RES1 e RES2 hanno una riga propria solo se il loro colore è diverso da quello della famiglia.
// Per gli altri campi una riga per valore.
export function vociCategorie(campo, colori) {
  if (campo !== 'occupancy') return Object.entries(colori).map(([testo, colore]) => ({ colore, testo }));
  const righe = new Map();
  for (const [codice, colore] of Object.entries(colori)) {
    const famiglia = famigliaUso(codice);
    const propria = SPECIFICI.has(codice) && colore !== (colori[famiglia] ?? coloreValore(campo, famiglia));
    const chiave = propria ? codice : famiglia ?? codice;
    const testo = !famiglia ? codice : t(`edificio.uso.${propria ? codice : famiglia}`);
    if (!righe.has(chiave) || codice === chiave) righe.set(chiave, { colore, testo, chiave });
  }
  return [...righe.values()].sort((a, b) => a.chiave.localeCompare(b.chiave)).map(({ colore, testo }) => ({ colore, testo }));
}
