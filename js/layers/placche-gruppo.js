// Gruppo «Placche tettoniche»: margini di placca (dorsali, subduzioni e collisioni, trasformi).
// Non ha strati propri: i moduli con `gruppo: 'placche-gruppo'` mettono qui i loro strati, quindi deve precederli in MODULI.
export default {
  id: 'placche-gruppo',
  titolo: 'Placche tettoniche',
  ordine: 2.5, // subito sotto a «Faglie» (vedi ordinaSezioni in core/layer-sezioni.js)
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
