// Pannellino «Colori» di uno strato: colore di riempimento e bordo di poligoni e punti, colore e spessore delle linee dello strato.
// Il tema si salva nel browser e si scambia come file JSON (vedi tema.js).
import { svgIcona } from './icone.js';
import { creaSezioneAttributo } from './pannello-attributo.js';
import { legendaAttributo } from './tema-attributo.js';
import { partiStrato, proprietaColore, proprietaBordoPunto, applicaTema, validaTema, comeEsadecimale, leggiTemi, salvaTemi, esportaTemi, importaTemi } from './tema.js';
import { t as tr } from './i18n.js';

const partiVuote = () => ({ riempimenti: [], punti: [], uniformi: [], categorie: [], linee: [], lineeColore: [], volumi: [] });
const haParti = p => p.riempimenti.length + p.punti.length + p.linee.length + p.volumi.length > 0;

const registro = new Map(); // id strato → { ricarica(): rilegge il tema salvato e lo applica }

function storageBrowser() {
  try { return window.localStorage; } catch { return null; }
}

function campoColore(testo, nome) {
  const riga = document.createElement('label');
  riga.className = 'tema-riga';
  const t = document.createElement('span');
  t.textContent = testo;
  const i = document.createElement('input');
  i.type = 'color';
  i.dataset.tema = nome;
  riga.append(t, i);
  return { riga, input: i };
}

// Restituisce { bottone, pannello }: l'host li mette dove vuole; il bottone si nasconde se lo strato non ha poligoni, punti o linee.
export function creaPannelloTema(map, strato, stato) {
  const originali = stato.temaOriginali ??= new Map();
  const storage = storageBrowser();
  let parti = stato.parti ?? partiVuote();
  let tema = null;

  const bottone = document.createElement('button');
  bottone.type = 'button';
  bottone.className = 'strato-zoom strato-tema-btn';
  bottone.dataset.temaStrato = strato.id;
  bottone.title = bottone.ariaLabel = tr('tema.coloriDi', { nome: strato.etichetta });
  bottone.setAttribute('aria-expanded', 'false');
  bottone.innerHTML = svgIcona('tavolozza', 14);
  bottone.hidden = true;

  const pannello = document.createElement('div');
  pannello.className = 'strato-tema';
  pannello.hidden = true;
  const riempimento = campoColore(tr('tema.riempimento'), 'riempimento');
  const bordo = campoColore(tr('tema.bordo'), 'bordo');
  const etichettaBordo = bordo.riga.firstChild;
  const rigaSpessore = document.createElement('label');
  rigaSpessore.className = 'tema-riga';
  const ts = document.createElement('span');
  ts.textContent = tr('tema.spessore');
  const spessore = document.createElement('input');
  spessore.type = 'range';
  spessore.min = '0';
  spessore.max = '6';
  spessore.step = '0.5';
  spessore.dataset.tema = 'spessore';
  const vs = document.createElement('output');
  rigaSpessore.append(ts, spessore, vs);
  const categorie = document.createElement('div');
  categorie.className = 'tema-categorie';
  categorie.hidden = true;
  const azioni = document.createElement('div');
  azioni.className = 'tema-azioni';
  const bottoneAz = (testo, azione) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'strato-strumento';
    b.dataset.azione = azione;
    b.textContent = testo;
    return b;
  };
  const reset = bottoneAz(tr('tema.ripristina'), 'tema-ripristina');
  const esporta = bottoneAz(tr('tema.esporta'), 'tema-esporta');
  const importa = bottoneAz(tr('tema.importa'), 'tema-importa');
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  const msg = document.createElement('p');
  msg.className = 'tema-msg';
  msg.setAttribute('role', 'status');
  azioni.append(reset, esporta, importa, file);
  // La sezione «per attributo» (rampe, elenchi di campi: oltre cento nodi per strato) si costruisce alla prima apertura del pannello:
  // all'avvio c'è solo il segnaposto, e il DOM resta leggero anche con decine di strati.
  // Il tema viene dichiarato più sotto: la sezione lo legge e lo modifica solo a eventi, dopo la costruzione.
  const segnapostoAttributo = document.createElement('div');
  segnapostoAttributo.hidden = true;
  let sezioneAttributo = null;
  const costruisciAttributo = () => sezioneAttributo ??= (() => {
    const sezione = creaSezioneAttributo({
      map,
      layers: () => [...parti.riempimenti, ...parti.punti, ...parti.linee, ...parti.volumi],
      leggi: () => tema?.attributo ?? null,
      cambia: a => {
        const nuovo = { ...(tema ?? {}) };
        if (a) nuovo.attributo = a; else delete nuovo.attributo;
        tema = validaTema(nuovo);
        applica();
        salva();
      },
    });
    segnapostoAttributo.replaceWith(sezione.el);
    return sezione;
  })();
  pannello.append(riempimento.riga, bordo.riga, rigaSpessore, categorie, segnapostoAttributo, azioni, msg);

  // categorie del colore (valore → colore originale), senza ripetizioni tra i layer dello strato
  const vociCategorie = () => [...new Map(parti.categorie.flatMap(c => c.voci)).entries()];
  const campiCategorie = new Map();
  const costruisciCategorie = () => {
    const voci = vociCategorie();
    categorie.hidden = !voci.length;
    if (!voci.length || categorie.dataset.pronta || pannello.hidden) return; // i campi si costruiscono quando il pannello si apre
    categorie.dataset.pronta = '1';
    const titolo = document.createElement('strong');
    titolo.textContent = tr('tema.perCategoria');
    categorie.append(titolo);
    for (const [nome] of voci) {
      const c = campoColore(nome, 'categoria');
      c.input.dataset.categoria = nome;
      c.input.addEventListener('input', () => {
        tema = validaTema({ ...(tema ?? {}), categorie: { ...(tema?.categorie ?? {}), [nome]: c.input.value } });
        applica();
        salva();
      });
      campiCategorie.set(nome, c.input);
      categorie.append(c.riga);
    }
  };
  // pallini della legenda e del menu che portano data-tema-cat="idStrato|categoria": seguono il colore scelto
  const aggiornaPallini = () => {
    const originale = new Map(vociCategorie());
    for (const p of document.querySelectorAll(`[data-tema-cat^="${CSS.escape(strato.id)}|"]`)) {
      const nome = p.dataset.temaCat.slice(strato.id.length + 1);
      p.style.background = tema?.categorie?.[nome] ?? originale.get(nome) ?? '';
    }
  };

  // Legenda del tema per attributo, in #legende: compare con lo strato acceso e un tema attivo.
  // Le legende proprie dello strato indicate da `strato.legenda` (selettore CSS) si nascondono finché c'è: non descriverebbero più la mappa.
  const legendaTema = document.createElement('div');
  legendaTema.className = 'legenda legenda-tema';
  legendaTema.dataset.legendaTema = strato.id;
  legendaTema.hidden = true;
  document.getElementById('legende')?.append(legendaTema);
  const aggiornaLegenda = () => {
    const l = legendaAttributo(tema?.attributo);
    const acceso = Boolean(document.getElementById(`strato-${strato.id}`)?.checked);
    // Legenda propria che resta (`strato.legendaIntegrata`): cambiano solo i suoi colori, lo strato li legge dalla rampa del tema.
    if (strato.legendaIntegrata) {
      const att = tema?.attributo;
      document.dispatchEvent(new CustomEvent('tema-rampa', { detail: { strato: strato.id, rampa: l && att.tipo === 'graduata' ? att.rampa : null, inverti: att?.inverti === true } }));
    }
    legendaTema.hidden = !(l && acceso) || Boolean(strato.legendaIntegrata);
    legendaTema.replaceChildren();
    if (l) {
      const t = document.createElement('strong');
      t.textContent = `${strato.etichetta} · ${l.titolo}`;
      legendaTema.append(t);
      for (const v of l.voci) {
        const riga = document.createElement('div');
        const i = document.createElement('i');
        if (v.colore) i.style.background = v.colore; else i.style.visibility = 'hidden';
        riga.append(i, v.testo);
        legendaTema.append(riga);
      }
    }
    if (strato.legenda) for (const e of document.querySelectorAll(strato.legenda)) e.classList.toggle('legenda-sostituita', Boolean(l) && acceso);
  };

  // valori mostrati: quelli del tema, altrimenti quelli correnti della mappa
  const mostraValori = () => {
    const u = parti.uniformi[0];
    const f = parti.riempimenti[0];
    const pt = parti.punti[0];
    const lc = parti.lineeColore[0];
    riempimento.riga.hidden = !u;
    if (u) riempimento.input.value = tema?.riempimento ?? comeEsadecimale(originali.get(`${u}|${proprietaColore(map, u)}`) ?? map.getPaintProperty(u, proprietaColore(map, u)));
    // il bordo è quello dei poligoni, altrimenti dei punti, altrimenti il colore delle linee
    const [idBordo, propBordo] = f ? [f, 'fill-outline-color'] : pt ? [pt, proprietaBordoPunto(map, pt)] : [lc, 'line-color'];
    bordo.riga.hidden = !idBordo;
    etichettaBordo.textContent = f || pt ? tr('tema.bordo') : tr('tema.coloreLinea');
    if (idBordo) bordo.input.value = tema?.bordo ?? comeEsadecimale(originali.get(`${idBordo}|${propBordo}`) ?? map.getPaintProperty(idBordo, propBordo), u ? riempimento.input.value : '#444444');
    const l = parti.linee[0];
    const w = tema?.spessore ?? originali.get(`${l}|line-width`) ?? (l && map.getPaintProperty(l, 'line-width'));
    spessore.value = String(typeof w === 'number' ? w : 1);
    vs.textContent = Number(spessore.value).toFixed(1);
    rigaSpessore.hidden = !parti.linee.length;
    costruisciCategorie();
    const orig = new Map(vociCategorie());
    for (const [nome, input] of campiCategorie) input.value = tema?.categorie?.[nome] ?? comeEsadecimale(orig.get(nome));
    aggiornaPallini();
    aggiornaLegenda();
    sezioneAttributo?.sincronizza();
  };

  const salva = () => {
    const temi = leggiTemi(storage);
    if (tema) temi[strato.id] = tema; else delete temi[strato.id];
    salvaTemi(storage, temi);
  };
  const applica = () => { applicaTema(map, parti, tema, originali); mostraValori(); };

  // I layer possono comparire dopo la costruzione del pannello: si rivaluta a ogni accensione e al primo idle.
  const aggiorna = () => {
    if (!haParti(parti)) {
      parti = partiStrato(map, strato.layers);
      if (haParti(parti)) stato.parti = parti; // si ricorda: con opacità 0 un riempimento sembrerebbe di sola selezione
    }
    bottone.hidden = !haParti(parti);
    if (haParti(parti)) { tema = leggiTemi(storage)[strato.id] ?? null; applica(); }
  };

  // un campo entra nel tema solo se l'utente lo tocca: gli altri restano quelli originali
  for (const [campo, el] of [['riempimento', riempimento.input], ['bordo', bordo.input], ['spessore', spessore]]) {
    el.addEventListener('input', () => {
      const nuovo = { ...(tema ?? {}) };
      nuovo[campo] = campo === 'spessore' ? Number(el.value) : el.value;
      tema = validaTema(nuovo);
      applica();
      salva();
    });
  }

  reset.addEventListener('click', () => { tema = null; applica(); salva(); msg.textContent = tr('tema.ripristinato'); });
  esporta.addEventListener('click', () => {
    const blob = new Blob([esportaTemi(leggiTemi(storage))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'temi-strati.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg.textContent = tr('tema.esportati');
  });
  importa.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    try {
      const temi = importaTemi(await f.text());
      salvaTemi(storage, { ...leggiTemi(storage), ...temi });
      for (const r of registro.values()) r.ricarica();
      msg.textContent = `Importati ${Object.keys(temi).length} temi`;
    } catch (e) { msg.textContent = e.message; }
  });

  bottone.addEventListener('click', () => {
    pannello.hidden = !pannello.hidden;
    bottone.setAttribute('aria-expanded', String(!pannello.hidden));
    if (!pannello.hidden) { costruisciAttributo().rileva(); mostraValori(); }
  });

  registro.set(strato.id, { ricarica: aggiorna });
  aggiorna();
  if (typeof map.once === 'function') map.once('idle', aggiorna);
  return { bottone, pannello, aggiorna };
}
