// Sottogruppi pieghevoli del pannello «Layer»: il titolo (h3.gruppo-sezione) di un gruppo condiviso si apre e si chiude, e chiuso
// nasconde gli strati (e ciò che li accompagna: opacità, filtri) fino al titolo successivo. Dentro una sezione possono esserci titoli di
// secondo livello (h4.gruppo-sottosezione, es. «Colonnine di ricarica» in «Servizi su strada»), pieghevoli a loro volta: una sezione chiusa
// nasconde anche i suoi titoli di secondo livello.

// Nodi da nascondere, dato l'elenco dei figli di un gruppo (funzioni `eTitolo(nodo)` e `chiuso(titolo)` per restare testabile senza DOM).
// `eSotto(nodo)`: titolo di secondo livello (opzionale); vale solo dentro la sezione che lo precede.
export function nascosti(nodi, eTitolo, chiuso, eSotto = () => false) {
  const fuori = [];
  let sezioneChiusa = false;
  let sottoChiuso = false;
  for (const n of nodi) {
    if (eTitolo(n)) { sezioneChiusa = chiuso(n); sottoChiuso = false; } else if (eSotto(n)) {
      if (sezioneChiusa) fuori.push(n);
      sottoChiuso = chiuso(n);
    } else if (sezioneChiusa || sottoChiuso) fuori.push(n);
  }
  return fuori;
}

const CHIUSO = n => n.getAttribute('aria-expanded') === 'false';

const SEZIONE = 'h3.gruppo-sezione';
const SOTTOSEZIONE = 'h4.gruppo-sottosezione';

// Titoli che governano il nodo `n`: l'ultima sezione che lo precede e, se c'è, l'ultimo titolo di secondo livello dopo di essa.
function titoliDi(figli, n) {
  const prima = figli.slice(0, figli.indexOf(n)).reverse();
  const sezione = prima.find(x => x.matches(SEZIONE));
  const sotto = prima.slice(0, sezione ? prima.indexOf(sezione) : undefined).find(x => x.matches(SOTTOSEZIONE));
  return [sezione, sotto].filter(Boolean);
}

// Applica lo stato dei titoli del gruppo: i nodi di un sottogruppo chiuso prendono la classe `sotto-chiuso` (display: none).
// `ignora`: ricerca in corso, niente resta nascosto (lo strato trovato deve vedersi). `riapri`: dopo un riordino, uno strato finito
// sotto un titolo chiuso lo riapre, così non sparisce.
export function aggiornaSottogruppi(gruppo, { ignora = false, riapri = false } = {}) {
  const figli = [...gruppo.children];
  const calcola = () => new Set(ignora ? [] : nascosti(figli, n => n.matches(SEZIONE), CHIUSO, n => n.matches(SOTTOSEZIONE)));
  let fuori = calcola();
  if (riapri) {
    for (const n of fuori) {
      if (n.classList.contains('sotto-chiuso')) continue; // era già nascosto: resta com'è
      for (const h of titoliDi(figli, n)) h.setAttribute('aria-expanded', 'true');
    }
    fuori = calcola();
  }
  for (const n of figli) n.classList.toggle('sotto-chiuso', fuori.has(n));
}

// Rende pieghevoli i titoli di sottogruppo del gruppo.
export function rendiPieghevoli(gruppo) {
  const titoli = [...gruppo.querySelectorAll(`:scope > ${SEZIONE}, :scope > ${SOTTOSEZIONE}`)];
  for (const h of titoli) {
    h.tabIndex = 0;
    h.setAttribute('role', 'button');
    h.setAttribute('aria-expanded', 'true');
    const alterna = () => {
      h.setAttribute('aria-expanded', String(CHIUSO(h)));
      aggiornaSottogruppi(gruppo);
    };
    h.addEventListener('click', alterna);
    h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(); } });
  }
}
