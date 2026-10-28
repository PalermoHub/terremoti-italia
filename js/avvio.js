// Punto d'ingresso: prima i dizionari, poi l'app. Così t() è già pronta quando i moduli di app.js
// (con costanti che chiamano t() a livello di modulo) vengono valutati.
import { caricaDizionari, applicaDom, creaInterruttoreLingua } from './core/i18n.js';

await caricaDizionari();
applicaDom(document);
document.getElementById('barra-strumenti').append(creaInterruttoreLingua(document));
await import('./app.js');
