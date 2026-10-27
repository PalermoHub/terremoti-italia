// Gruppo «Eventi»: contenitore dei layer su ciò che accade (radar pioggia e allerte, terremoti, incendi).
// Non ha strati propri: i moduli con `gruppo: 'eventi'` mettono i loro strati qui, quindi deve precederli in MODULI.
export default {
  id: 'eventi',
  titolo: 'Eventi',
  aggiungiSorgenti() {},
  aggiungiLayer() {},
  strati: [],
};
