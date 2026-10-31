// Impaginazione A4 della scheda in PDF: logica pura (altezze in una stessa unità, mm), senza DOM.

// Grafici stretti vanno in coppia; tabelle, elenchi e testo a tutta larghezza
export function classifica({ haGrafico, haTabella }) {
  return haGrafico && !haTabella ? 'meta' : 'piena';
}

// Raggruppa in righe: due blocchi `meta` consecutivi affiancati, ogni altro blocco da solo (un `meta` solitario resta in colonna 0)
function righe(blocchi) {
  const out = [];
  for (let i = 0; i < blocchi.length; i++) {
    const b = blocchi[i];
    const successivo = blocchi[i + 1];
    if (b.larghezza === 'meta' && successivo?.larghezza === 'meta') {
      out.push({ voci: [{ id: b.id, colonna: 0 }, { id: successivo.id, colonna: 1 }], altezza: Math.max(b.altezza, successivo.altezza) });
      i++;
    } else {
      out.push({ voci: [{ id: b.id, colonna: b.larghezza === 'meta' ? 0 : null }], altezza: b.altezza, conSuccessivo: !!b.conSuccessivo });
    }
  }
  // un titolo (conSuccessivo) si fonde con la riga che lo segue: si spostano insieme, mai un titolo solo in fondo alla pagina
  const uniti = [];
  for (let i = 0; i < out.length; i++) {
    let r = out[i];
    while (r.conSuccessivo && out[i + 1]) { const n = out[++i]; r = { voci: [...r.voci, ...n.voci], altezza: r.altezza + n.altezza, conSuccessivo: n.conSuccessivo }; }
    uniti.push(r);
  }
  return uniti;
}

// `utile` = altezza disponibile per il corpo: prima pagina (banner pieno) e pagine successive (banner ridotto).
// Una riga non si spezza mai: se non entra passa alla pagina dopo; se è più alta di una pagina intera sta da sola.
export function impagina(blocchi, utile) {
  const pagine = [];
  let corrente = [];
  let usata = 0;
  const limite = () => (pagine.length === 0 ? utile.primaPagina : utile.altre);
  for (const riga of righe(blocchi)) {
    if (corrente.length && usata + riga.altezza > limite()) {
      pagine.push(corrente);
      corrente = [];
      usata = 0;
    }
    corrente.push(...riga.voci);
    usata += riga.altezza;
  }
  if (corrente.length) pagine.push(corrente);
  return pagine;
}
