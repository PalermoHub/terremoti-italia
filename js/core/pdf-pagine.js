// PDF multipagina minimo: una pagina per immagine JPEG a pagina intera (nessuna dipendenza).
// Generalizza `creaPdf` di stampa-poster.js, che resta a pagina singola per il poster.

// `pagine` = [{ jpeg: Uint8Array, pxL, pxA }]; `paginaL` e `paginaA` in mm
export function creaPdfPagine(pagine, paginaL, paginaA) {
  if (!pagine.length) throw new Error('PDF senza pagine'); // i18n-ok: errore di programmazione, non mostrato
  const pt = mm => (mm * 72 / 25.4).toFixed(2);
  const codifica = new TextEncoder();
  const contenuto = `q ${pt(paginaL)} 0 0 ${pt(paginaA)} 0 0 cm /Im0 Do Q`;
  const parti = [];
  const offset = [];
  let lunghezza = 0;
  const aggiungi = dati => { const b = typeof dati === 'string' ? codifica.encode(dati) : dati; parti.push(b); lunghezza += b.length; };
  const oggetto = (n, corpo) => { offset[n] = lunghezza; aggiungi(`${n} 0 obj\n`); corpo(); aggiungi('\nendobj\n'); };
  // numerazione: 1 catalogo, 2 elenco pagine, poi per ogni pagina tre oggetti (pagina, immagine, contenuto)
  const primo = i => 3 + i * 3;
  aggiungi('%PDF-1.4\n');
  oggetto(1, () => aggiungi('<< /Type /Catalog /Pages 2 0 R >>'));
  oggetto(2, () => aggiungi(`<< /Type /Pages /Kids [${pagine.map((_, i) => `${primo(i)} 0 R`).join(' ')}] /Count ${pagine.length} >>`));
  pagine.forEach(({ jpeg, pxL, pxA }, i) => {
    const n = primo(i);
    oggetto(n, () => aggiungi(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(paginaL)} ${pt(paginaA)}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`));
    oggetto(n + 1, () => { aggiungi(`<< /Type /XObject /Subtype /Image /Width ${pxL} /Height ${pxA} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); aggiungi(jpeg); aggiungi('\nendstream'); });
    oggetto(n + 2, () => aggiungi(`<< /Length ${contenuto.length} >>\nstream\n${contenuto}\nendstream`));
  });
  const totale = 3 + pagine.length * 3;
  const xref = lunghezza;
  const voci = Array.from({ length: totale - 1 }, (_, k) => `${String(offset[k + 1]).padStart(10, '0')} 00000 n \n`).join('');
  aggiungi(`xref\n0 ${totale}\n0000000000 65535 f \n${voci}trailer\n<< /Size ${totale} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parti, { type: 'application/pdf' });
}
