import { caricaIndiceComuni } from './indice-comuni.js';
import { impostaIndiceTerritorio } from './territorio.js';

// Cache del territorio per le righe della tabella: l'indice si scarica una volta sola, alla prima apertura
// della tabella, e diventa il contesto condiviso di territorio.js.
let contesto = null;
let caricamento = null;
let fallito = false;

export function caricaTerritorio() {
  if (contesto) return Promise.resolve(contesto);
  if (fallito) {
    fallito = false;
    caricamento = null;
  }
  if (!caricamento) {
    caricamento = caricaIndiceComuni()
      .then(indice => {
        contesto = impostaIndiceTerritorio(indice);
        return contesto;
      })
      .catch(() => {
        fallito = true;
        return null;
      });
  }
  return caricamento;
}
