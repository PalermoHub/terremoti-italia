import { urlDati } from './config.js';
import { creaIndice } from './aree.js';

// Carica una volta sola l'indice di comuni, province e regioni (dati/indice-comuni.json): lo usano la ricerca,
// i filtri per territorio e la tabella dei dati. Dopo un errore si riprova alla richiesta successiva.
let caricamento = null;

export function caricaIndiceComuni() {
  if (caricamento) return caricamento;
  caricamento = fetch(urlDati('indice-comuni.json'))
    .then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then(creaIndice);
  caricamento.catch(() => { caricamento = null; });
  return caricamento;
}
