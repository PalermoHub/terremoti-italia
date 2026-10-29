// Costanti e piccole funzioni condivise dal pannello degli strati e dal suo riordino.
import { t } from './i18n.js';

// Il pannello «Ordine layer in mappa» e i gruppi si avvisano a vicenda quando cambia l'ordine degli strati sulla mappa.
export const EVENTO_DISEGNO = 'dt:ordine-disegno';
export const EVENTO_GRUPPO = 'dt:ordine-gruppo';

export const ETICHETTE = { base: t('gruppo.base'), layer: t('gruppo.layer'), filtri: t('html.cerca.filtri.et'), popolazione: t('gruppo.popolazione'), confini: t('gruppo.confini'), territorio: t('gruppo.territorio'), 'protezione-civile': t('gruppo.protezioneCivile'), 'terremoti-gruppo': t('gruppo.terremoti'), 'faglie-gruppo': t('gruppo.faglie'), 'placche-gruppo': t('gruppo.placche'), 'geologia-gruppo': t('gruppo.geologia'), edifici: t('gruppo.edifici'), terreno: t('gruppo.terreno'), trasporto: t('gruppo.trasporto'), pai: t('gruppo.pai'), monumenti: t('gruppo.monumenti'), scuole: t('gruppo.scuole'), uffici: t('gruppo.uffici'), colonnine: t('gruppo.colonnine'), incendi: t('gruppo.incendi'), 'isole-calore': t('gruppo.isoleCalore'), sicurezza: t('gruppo.sicurezza'), miei: t('gruppo.miei') };

// Titolo di un gruppo: il `summary` di una sezione, altrimenti l'`h2` del pannello. Barre e campi si inseriscono dopo.
export const intestazione = el => el.querySelector(':scope > summary') ?? el.querySelector('h2');
