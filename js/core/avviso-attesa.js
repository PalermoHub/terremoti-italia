// Avviso «caricamento in corso» per i dati che arrivano in ritardo (layer differiti): compare solo se l'attesa dura
// più di `ritardo` (niente lampi per un caricamento rapido) e sparisce da solo quando finiscono tutte le attese aperte.
export function creaAvvisoAttesa(contenitore, testo, { ritardo = 400, creaNodo = () => document.createElement('div') } = {}) {
  let aperte = 0;
  let nodo = null;
  let timer = null;
  const mostra = () => {
    timer = null;
    if (nodo || !aperte) return;
    nodo = creaNodo();
    nodo.className = 'avviso-attesa';
    nodo.textContent = testo;
    contenitore.append(nodo);
  };
  const fine = () => {
    if (--aperte > 0) return;
    clearTimeout(timer);
    timer = null;
    nodo?.remove();
    nodo = null;
  };
  return {
    // Segue la promessa senza cambiarne l'esito: l'avviso resta finché una qualunque attesa è aperta.
    durante(promessa) {
      aperte++;
      timer ??= nodo ? null : setTimeout(mostra, ritardo);
      const p = Promise.resolve(promessa);
      p.then(fine, fine);
      return p;
    },
  };
}

// Promessa che si risolve quando la mappa ha finito di caricare dati e tile (evento `idle`), o dopo `attesaMax`.
// Il primo controllo precede l'avviso: se non c'è niente da attendere l'`idle` potrebbe non arrivare più.
export function mappaFerma(map, { attesaMax = 20000, primoControllo = 300 } = {}) {
  return new Promise(ok => {
    let t1, t2;
    const fine = () => { clearTimeout(t1); clearTimeout(t2); map.off('idle', fine); ok(); };
    t1 = setTimeout(() => { if (map.loaded()) fine(); }, primoControllo);
    t2 = setTimeout(fine, attesaMax);
    map.on('idle', fine);
  });
}
