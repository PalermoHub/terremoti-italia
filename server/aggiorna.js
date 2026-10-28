// Una sola lettura dell'INGV alla volta: il timer dei 2 minuti e il clic «Aggiorna ora» del browser condividono la
// stessa promessa, così due richieste ravvicinate non scaricano due volte gli stessi eventi.
// Un errore si registra e arriva a chi ha chiesto (la rotta risponde 502), senza restare appeso: il giro dopo riparte.
export function creaAggiornamento({ leggi, registro = console }) {
  let inCorso = null;
  return function aggiorna() {
    if (!inCorso) {
      inCorso = leggi()
        .catch(e => { registro.error(`aggiornamento INGV non riuscito: ${e.message}`); throw e; })
        .finally(() => { inCorso = null; });
    }
    return inCorso;
  };
}
