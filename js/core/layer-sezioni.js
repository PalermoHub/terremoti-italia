// Sezioni del tab «Layer»: ordine alfabetico e stato aperto/chiuso. Solo parti pure (testabili);
// il collegamento al DOM sta in pannello.js.
export const CHIAVE = 'dt-layer-sezioni';

// Id delle sezioni in ordine alfabetico di titolo (italiano, senza distinguere maiuscole e accenti).
export function ordinaSezioni(voci) {
  return [...voci].sort((a, b) => a.titolo.localeCompare(b.titolo, 'it', { sensitivity: 'base' })).map(v => v.id);
}

// Id delle sezioni lasciate aperte; storage assente, bloccato o corrotto: nessuna.
export function leggiAperte(storage) {
  try {
    const v = JSON.parse(storage?.getItem(CHIAVE) ?? '[]');
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}

export function salvaAperta(storage, id, aperta) {
  const aperte = new Set(leggiAperte(storage));
  if (aperta) aperte.add(id); else aperte.delete(id);
  try { storage?.setItem(CHIAVE, JSON.stringify([...aperte])); } catch { /* storage pieno o bloccato: vale per la sessione */ }
}
