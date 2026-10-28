// Gruppo «Territorio»: i confini su cui si leggono i dati (i comuni d'Italia).
// Non ha strati propri: i moduli con `gruppo: 'territorio'` mettono qui i loro strati, quindi deve precederli in MODULI.
export default {
  id: 'territorio',
  titolo: 'Territorio',
  ordine: 4, // ultima sezione del pannello «Layer» (vedi ordinaSezioni in core/layer-sezioni.js)
  sezioneAperta: true, // la sezione si apre da sola la prima volta: i confini comunali si vedono subito
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
