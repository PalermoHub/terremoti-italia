import { raggioMagnitudo, modelloPopupTerremoto } from './scheda-terremoti.js';
import { t, tl } from '../core/i18n.js';
import { badgeMagnitudo } from '../core/badge-magnitudo.js';
import { contenutoPopupTraffico, ancoraPopupTraffico, rifinisciPopupTraffico, centraPopupTraffico } from './popup-traffico.js';

// Parti comuni dei due strati di terremoti (tempo reale e archivio storico): simboli delle righe e popup al clic.

// Punto del colore della fascia d'età, per la riga del tempo
function puntoTempo(p) {
  const casella = document.createElement('span');
  casella.className = 'tooltip-magnitudo';
  const punto = document.createElement('i');
  punto.style.cssText = `width:10px;height:10px;background:${p.colore};border-color:rgb(0 0 0 / .25)`;
  casella.append(punto);
  return casella;
}

// Cerchio della magnitudo per le righe di popup e tooltip: della classe dell'evento, con lo stesso diametro della legenda
function cerchioMagnitudo(p) {
  const casella = document.createElement('span');
  casella.className = 'tooltip-magnitudo';
  const cerchio = document.createElement('i');
  const r = p.raggio ?? (Number.isFinite(p.mag) ? raggioMagnitudo(p.mag) : 3);
  const d = r * 2;
  cerchio.style.cssText = `width:${d}px;height:${d}px;border-color:currentColor`;
  casella.append(cerchio);
  return casella;
}

// Simboli delle righe «Magnitudo» e «Ora locale» (tooltip e popup): il cerchio della sua classe e il punto del colore della sua fascia d'età
export const simboliRighe = p => ({ Magnitudo: () => ({ nodo: cerchioMagnitudo(p) }), 'Ora locale': () => ({ nodo: puntoTempo(p) }) });

// Righe del tooltip di un terremoto: «Etichetta: valore» con il simbolo della riga; la magnitudo è un badge
export const righeTooltip = (m, p) => m.righe.map(r => ({
  testo: r.etichetta === 'Magnitudo' ? `${tl(r.etichetta)}: ` : `${tl(r.etichetta)}: ${r.valore}`,
  ...simboliRighe(p)[r.etichetta]?.(),
  ...(r.etichetta === 'Magnitudo' ? { valoreNodo: badgeMagnitudo(p.mag, r.valore) } : {}),
}));

export const conSimboli = (m, p) => ({ ...m, righe: m.righe.map(r => ({ ...r, nodo: simboliRighe(p)[r.etichetta]?.().nodo, ...(r.etichetta === 'Magnitudo' ? { valoreNodo: badgeMagnitudo(p.mag, r.valore) } : {}) })) });

// Badge a destra del sottotitolo del popup: porta alla scheda dell'evento (`vai` è la funzione dello strato che la apre)
function collegamentoScheda(vai, p) {
  const link = document.createElement('a');
  link.className = 'tooltip-badge traffico-azione';
  link.style.setProperty('--colore', p.colore);
  link.href = '#';
  link.textContent = t('terremoti.scheda');
  link.title = t('terremoti.apriScheda');
  link.addEventListener('click', ev => { ev.preventDefault(); vai(p); });
  return link;
}

// Un popup per strato: `apri(mappa, p, punto)` lo mostra sul terremoto `p` (proprietà della feature + lon/lat), `chiudi()` lo toglie.
// Con `apriScheda(p)` il popup ha il collegamento alla scheda dell'evento (`apri(…, false)` lo toglie: l'evento non è in mappa)
export function creaPopupTerremoti({ apriScheda } = {}) {
  let popup = null;
  const chiudi = () => { popup?.remove(); popup = null; };
  return {
    chiudi,
    apri(mappa, p, punto, conScheda = true) {
      chiudi();
      const coordinate = [p.lon, p.lat];
      const { anchor, offset } = ancoraPopupTraffico(punto, mappa.getContainer());
      popup = new maplibregl.Popup({ maxWidth: '300px', className: 'traffico-popup-box', anchor, offset, closeButton: false })
        .setLngLat(coordinate)
        .setDOMContent(contenutoPopupTraffico({ sezione: 'Terremoti', icona: 'terremoto', colore: p.colore, modello: conSimboli(modelloPopupTerremoto(p), p), sottotitoloBadge: true, azione: apriScheda && conScheda ? collegamentoScheda(apriScheda, p) : undefined, coordinate, chiudi }))
        .addTo(mappa);
      rifinisciPopupTraffico(popup, anchor, p.colore);
      centraPopupTraffico(mappa, popup, anchor, coordinate);
    },
  };
}
