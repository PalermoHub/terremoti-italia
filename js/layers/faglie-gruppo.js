// Gruppo «Faglie»: faglie capaci (ITHACA), faglie (EGDI) e sorgenti sismogenetiche (DISS).
// L'id non è «faglie» perché è già del modulo delle faglie capaci ITHACA.
// Non ha strati propri: i moduli con `gruppo: 'faglie-gruppo'` mettono qui i loro strati, quindi deve precederli in MODULI.
export default {
  id: 'faglie-gruppo',
  titolo: 'Faglie',
  ordine: 2, // posizione della sezione nel pannello «Layer» (vedi ordinaSezioni in core/layer-sezioni.js)
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
