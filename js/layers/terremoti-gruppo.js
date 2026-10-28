// Gruppo «Terremoti»: tempo reale, archivio storico e confronto fra due periodi.
// L'id non è «terremoti» perché è già del modulo dello strato in tempo reale (e del prefisso `strato-terremoti` del pannello).
// Non ha strati propri: i moduli con `gruppo: 'terremoti-gruppo'` mettono qui i loro strati, quindi deve precederli in MODULI.
export default {
  id: 'terremoti-gruppo',
  titolo: 'Terremoti',
  ordine: 1, // posizione della sezione nel pannello «Layer» (vedi ordinaSezioni in core/layer-sezioni.js)
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
