// Gruppo «Protezione Civile»: i layer delle allerte e delle emergenze (bollettino meteo-idro del DPC).
// Non ha strati propri: i moduli con `gruppo: 'protezione-civile'` mettono qui i loro strati, quindi deve precederli in MODULI.
export default {
  id: 'protezione-civile',
  titolo: 'Protezione Civile',
  ordine: 3, // posizione della sezione nel pannello «Layer»: subito sopra a «Territorio»
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
