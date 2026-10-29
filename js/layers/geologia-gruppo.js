// Gruppo «Geologia»: la carta geologica d'Italia (ISPRA).
// Non ha strati propri: i moduli con `gruppo: 'geologia-gruppo'` mettono qui i loro strati, quindi deve precederli in MODULI.
export default {
  id: 'geologia-gruppo',
  titolo: 'Geologia',
  ordine: 2.7, // subito sotto a «Placche tettoniche» (vedi ordinaSezioni in core/layer-sezioni.js)
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
