import { raggioMagnitudo, modelloPopupTerremoto } from './scheda-terremoti.js';
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

export const conSimboli = (m, p) => ({ ...m, righe: m.righe.map(r => ({ ...r, nodo: simboliRighe(p)[r.etichetta]?.().nodo })) });

// Un popup per strato: `apri(mappa, p, punto)` lo mostra sul terremoto `p` (proprietà della feature + lon/lat), `chiudi()` lo toglie
export function creaPopupTerremoti() {
  let popup = null;
  const chiudi = () => { popup?.remove(); popup = null; };
  return {
    chiudi,
    apri(mappa, p, punto) {
      chiudi();
      const coordinate = [p.lon, p.lat];
      const { anchor, offset } = ancoraPopupTraffico(punto, mappa.getContainer());
      popup = new maplibregl.Popup({ maxWidth: '300px', className: 'traffico-popup-box', anchor, offset, closeButton: false })
        .setLngLat(coordinate)
        .setDOMContent(contenutoPopupTraffico({ sezione: 'Terremoti', icona: 'terremoto', colore: p.colore, modello: conSimboli(modelloPopupTerremoto(p), p), coordinate, chiudi }))
        .addTo(mappa);
      rifinisciPopupTraffico(popup, anchor, p.colore);
      centraPopupTraffico(mappa, popup, anchor, coordinate);
    },
  };
}
