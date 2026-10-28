// Video demo verticale (1080×1920, 9:16) della sezione sismica in 3D, per storie WhatsApp/Instagram.
// Locale: non fa parte dell'app. Prende gli eventi da dati/terremoti.sqlite, apre la vista 3D reale in Chromium,
// la ruota trascinando il mouse a ogni fotogramma (resa deterministica, senza scatti) e monta l'MP4 con ffmpeg.
// Uso: node scripts/video-demo.mjs [uscita.mp4] [secondi=14]
import { DatabaseSync } from 'node:sqlite';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { proiettaEventi, SEZIONI_PREDEFINITE, lunghezzaKm, CLASSI_PROFONDITA } from '../js/layers/scheda-sezione.js';

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uscita = resolve(process.argv[2] ?? join(radice, 'video-demo', 'sezione-3d.mp4'));
const secondi = Number(process.argv[3] ?? 14);
const FPS = 30, L = 540, H = 960, DSF = 2; // 540×960 a densità 2 = 1080×1920
const DA = '2015-01-01', MAG_MIN = 2.5, PORTA = 8799;

// Playwright non è tra le dipendenze del progetto: se non c'è in locale, si usa quello installato globalmente
const richiedi = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = richiedi('playwright')); } catch {
  const globale = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  ({ chromium } = richiedi(join(globale, '@playwright/cli/node_modules/playwright')));
}

// Eventi nella fascia della sezione «arco calabro», proiettati come fa l'app
const { a, b, semilarghezza } = SEZIONI_PREDEFINITE[0];
const lunghezza = lunghezzaKm(a, b);
const db = new DatabaseSync(join(radice, 'dati', 'terremoti.sqlite'), { readOnly: true });
const righe = db.prepare('SELECT id, lat, lon, prof, mag FROM eventi WHERE ts >= strftime(\'%s\', ?) AND mag >= ? AND prof IS NOT NULL AND lat BETWEEN 36 AND 42 AND lon BETWEEN 12 AND 18').all(DA, MAG_MIN);
const eventi = proiettaEventi(righe.map(r => ({ ...r })), a, b, semilarghezza);
if (!eventi.length) throw new Error('Nessun evento nella sezione: archivio vuoto?');
console.log(`${eventi.length} eventi (M≥${MAG_MIN} dal ${DA}) su una linea di ${Math.round(lunghezza)} km`);

const server = spawn('node', ['server.js'], { cwd: radice, env: { ...process.env, PORT: String(PORTA) }, stdio: 'ignore' });
const cartella = mkdtempSync(join(tmpdir(), 'video-demo-'));
let browser;
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORTA}/`)).ok) break; } catch { /* il server sta partendo */ }
    if (i > 50) throw new Error('Server non raggiungibile');
    await new Promise(r => setTimeout(r, 200));
  }
  try { browser = await chromium.launch(); } catch {
    // revisione di Chromium non scaricata: si usa il Chromium completo più recente già in cache
    const cache = join(homedir(), '.cache', 'ms-playwright');
    const piene = readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort((x, y) => parseInt(y.slice(9)) - parseInt(x.slice(9)));
    browser = await chromium.launch({ executablePath: join(cache, piene[0], 'chrome-linux64', 'chrome') });
  }
  const pagina = await (await browser.newContext({ viewport: { width: L, height: H }, deviceScaleFactor: DSF })).newPage();
  await pagina.goto(`http://127.0.0.1:${PORTA}/`);

  // Pagina di sola scena: stessa vista 3D dell'app, su sfondo scuro, con titolo e legenda
  await pagina.evaluate(async ({ eventi, lunghezza, semilarghezza, classi, titolo, sotto }) => {
    const { vista3d } = await import('/js/layers/grafico-sezione-3d.js');
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;background:#0b1220;color:#e5e7eb;font-family:system-ui,sans-serif;overflow:hidden;--border-ui:#475569;--text-muted:#cbd5e1;--accent:#38bdf8';
    const cima = ((m) => { const p = 10 ** Math.floor(Math.log10(m)); const n = m / p; return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10].find(s => s >= n) ?? 10) * p; })(Math.max(10, ...eventi.map(e => e.prof)));
    const v = vista3d(eventi, lunghezza, semilarghezza, cima);
    const scena = document.createElement('div');
    scena.style.cssText = 'display:flex;flex-direction:column;height:100vh;padding:56px 28px 40px;box-sizing:border-box';
    const testata = document.createElement('div');
    testata.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:16px';
    const testi = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.style.cssText = 'margin:0;font-size:30px;line-height:1.15';
    h1.textContent = titolo;
    const p = document.createElement('p');
    p.style.cssText = 'margin:10px 0 0;font-size:16px;color:#94a3b8';
    p.textContent = sotto;
    testi.append(h1, p);
    const logo = document.createElement('img'); // stesso logo dell'app (#logo-ods in index.html), su tondo chiaro per leggersi sullo sfondo scuro
    logo.src = '/img/opendatasicilia.png';
    logo.alt = 'Open Data Sicilia';
    logo.style.cssText = 'width:54px;height:62px;object-fit:contain;flex:none;background:#fff;border-radius:10px;padding:6px;box-sizing:content-box';
    testata.append(testi, logo);
    scena.append(testata);
    await logo.decode();
    v.canvas.style.cssText = 'flex:1;width:100%;min-height:0;touch-action:none;cursor:grab';
    const legenda = document.createElement('div');
    legenda.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 16px;font-size:15px;margin-top:14px';
    let da = 0;
    for (const c of classi) { const s = document.createElement('span'); s.innerHTML = `<i style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${c.colore};margin-right:6px"></i>${da}${c.fino == null ? '+' : `–${c.fino}`} km`; da = c.fino; legenda.append(s); }
    const nota = document.createElement('p');
    nota.style.cssText = 'margin:10px 0 0;font-size:13px;color:#64748b';
    nota.textContent = 'Un punto = un terremoto · colore = profondità · grandezza = magnitudo · Dati: INGV · Open Data Sicilia';
    scena.append(v.canvas, legenda, nota);
    document.body.append(scena);
    v.disegna();
  }, {
    eventi, lunghezza, semilarghezza,
    classi: CLASSI_PROFONDITA.map(c => ({ fino: Number.isFinite(c.fino) ? c.fino : null, colore: c.colore })),
    titolo: 'Terremoti sotto la Calabria, in 3D',
    sotto: `${eventi.length.toLocaleString('it-IT')} eventi M ≥ ${MAG_MIN} dal ${DA.slice(0, 4)} · sezione dallo Ionio al Tirreno`,
  });

  // Rotazione completa + leggero beccheggio e zoom, guidati dal mouse: 1 px = 0.008 rad
  const n = Math.round(secondi * FPS);
  const giro = 2 * Math.PI / 0.008;
  const x0 = L / 2, y0 = 740; // punto di presa in una zona vuota, così il mouse non evidenzia alcun evento
  await pagina.mouse.move(x0, y0);
  await pagina.mouse.wheel(0, 90); // zoom ×0,87: durante la rotazione le etichette di profondità non toccano il bordo
  await pagina.mouse.down();
  let x = x0, y = y0;
  for (let f = 0; f < n; f++) {
    const t = f / n, dt = 1 / n;
    const dx = giro * dt;
    const dy = 0.18 / 0.008 * (Math.sin(2 * Math.PI * (t + dt)) - Math.sin(2 * Math.PI * t)); // beccheggio ±0,18 rad, ritorna al punto di partenza
    if (x + dx > L - 20) { await pagina.mouse.up(); x = 30; await pagina.mouse.move(x, y); await pagina.mouse.down(); }
    x += dx; y += dy;
    await pagina.mouse.move(x, y);
    await pagina.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await pagina.screenshot({ path: join(cartella, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  await pagina.mouse.up();

  mkdirSync(dirname(uscita), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(cartella, 'f%04d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', uscita]);
  console.log(`Video pronto: ${uscita}`);
} finally {
  await browser?.close();
  server.kill();
  rmSync(cartella, { recursive: true, force: true });
}
