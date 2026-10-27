// Collegamenti che arrivano dai dati (schede, monumenti, fonti): si accettano solo http e https.
// Un indirizzo `javascript:` o `data:` in un dato non diventa mai un href cliccabile.
export function urlSicuro(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url.trim(), 'https://esempio.invalid/');
    return u.protocol === 'http:' || u.protocol === 'https:' ? url.trim() : null;
  } catch {
    return null;
  }
}

// Imposta href, target e rel solo se l'indirizzo è accettabile; restituisce l'elemento (senza href resta testo semplice).
export function collegamento(a, url) {
  const sicuro = urlSicuro(url);
  if (!sicuro) return a;
  a.href = sicuro;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}
