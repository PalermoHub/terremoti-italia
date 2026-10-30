// Un solo blocco per magnitudo e colore di tutti gli strati dei terremoti: slider minima/massima, classi del tema magnitudo
// o fasce del tema profondità (una delle due, secondo il modo scelto) e nota.
// Prima ogni legenda (tempo reale, storico, confronto) ne aveva una copia: il filtro era già lo stesso, il comando no.
// Compare una volta sola, sotto il primo strato dei terremoti acceso; con «Legende sulla mappa» (o con il tema acceso,
// che la forza) resta in mappa come le altre legende.
import { t } from '../core/i18n.js';
import { EVENTO_LEGENDE } from '../core/legenda-pannello.js';
import { creaClassiFiltro, EVENTO_TEMA_MAGNITUDO, STRATI_TERREMOTI, temaMagnitudoAttivo, temaProfonditaAttivo, VOCI_TEMA } from '../core/tema-magnitudo.js';
import { filtro } from './scheda-terremoti.js';
import { EVENTO_FILTRO } from './scheda-terremoti-dom.js';
import { creaSliderMagnitudo } from './slider-magnitudo.js';

let blocco = null;

const acceso = id => Boolean(document.getElementById(`strato-${id}`)?.checked);
const primoStrato = () => STRATI_TERREMOTI.find(acceso) ?? null;

function creaBlocco() {
  const nodo = document.createElement('div');
  nodo.className = 'legenda legenda-monumenti legenda-magnitudo';
  nodo.dataset.legendaTitolo = t('terremoti.magMin'); // nel pannello si intitola «Magnitudo», non un secondo «Legenda»

  const slider = creaSliderMagnitudo();
  const classi = creaClassiFiltro({
    accese: () => filtro.classi,
    suCambio: insieme => { filtro.classi = insieme; document.dispatchEvent(new Event(EVENTO_FILTRO)); },
  });
  const nota = document.createElement('p');
  nota.className = 'legenda-magnitudo-nota';
  nota.textContent = t('tema.magnitudo.filtro');
  classi.nodo.append(nota);
  const fasce = creaClassiFiltro({
    accese: () => filtro.fasce,
    suCambio: insieme => { filtro.fasce = insieme; document.dispatchEvent(new Event(EVENTO_FILTRO)); },
    voci: VOCI_TEMA.profondita(),
    titolo: t('tema.profondita.scala'),
  });
  const notaFasce = document.createElement('p');
  notaFasce.className = 'legenda-magnitudo-nota';
  notaFasce.textContent = t('tema.profondita.filtro');
  fasce.nodo.append(notaFasce);
  nodo.append(slider.nodo, classi.nodo, fasce.nodo);

  // Le classi descrivono i colori del tema: senza tema i cerchi hanno i colori dell'età o dell'anno e la scala sparirebbe.
  const applicaTema = () => {
    classi.nodo.hidden = !temaMagnitudoAttivo();
    fasce.nodo.hidden = !temaProfonditaAttivo();
    classi.sincronizza();
    // Fuori dal tema profondità le fasce non hanno un comando in vista: un filtro per fascia resterebbe invisibile
    if (!temaProfonditaAttivo() && filtro.fasce) { filtro.fasce = null; document.dispatchEvent(new Event(EVENTO_FILTRO)); }
    fasce.sincronizza();
  };
  // Il blocco vale per tutti gli strati: segue il primo acceso, come la legenda che il tema forza in mappa.
  const aggiorna = () => {
    const primo = primoStrato();
    nodo.hidden = !primo;
    if (primo) nodo.dataset.legendaStrato = primo;
    else delete nodo.dataset.legendaStrato;
  };

  document.addEventListener(EVENTO_TEMA_MAGNITUDO, applicaTema);
  document.addEventListener(EVENTO_LEGENDE, aggiorna);
  document.addEventListener('change', aggiorna); // accensione e spegnimento degli strati
  document.addEventListener(EVENTO_FILTRO, () => { classi.sincronizza(); fasce.sincronizza(); }); // istogramma, «Azzera», ricerca
  applicaTema();
  aggiorna();
  return nodo;
}

// Restituisce il blocco, creandolo la prima volta in cima alle legende.
export function legendaMagnitudo() {
  if (!blocco) {
    blocco = creaBlocco();
    document.getElementById('legende').append(blocco);
  }
  return blocco;
}
