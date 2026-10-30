---
name: Terremoti Italia
description: Mappa dei terremoti in Italia, sobria e leggibile, con pannelli bianchi flottanti e un solo accento ambra.
colors:
  accent: "#f5a623"
  accent-ink: "#1a1206"
  accent-strong: "#b45309"
  ink: "#1b1f24"
  ink-muted: "#5b6570"
  surface: "#ffffff"
  surface-alt: "#fafbfd"
  surface-hover: "#eaeaf0"
  border: "#d0d7de"
  border-ui: "#d6d6e8"
  link: "#2f5fc7"
  focus: "#0b5fff"
  data-blue: "#1971c2"
  danger: "#b42318"
  positive: "#22a55a"
  highlight: "#e6007e"
  mag-1: "#fde68a"
  mag-2: "#fbbf24"
  mag-3: "#f97316"
  mag-4: "#c2410c"
  mag-5: "#dc2626"
  age-hour: "#e03131"
  age-day: "#f08c00"
  age-three-days: "#f2c500"
  age-older: "#1e9be0"
typography:
  body:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
  caption:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.35
  title:
    fontFamily: "Montserrat, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
  data:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 14px"
  tool-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    size: "36px"
  tool-button-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px"
  magnitude-badge:
    typography: "{typography.data}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
  latest-event:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
---

# Design System: Terremoti Italia

## Overview

**Creative North Star: "Il Sismografo in piena luce"**

Strumento scientifico che si legge a colpo d'occhio. La mappa chiara occupa tutto lo schermo; i controlli sono fogli bianchi che galleggiano sopra di essa; un solo segnale ambra indica ciò che è attivo o primario. I numeri sono in un carattere pensato per la leggibilità. Niente decorazione: ogni elemento serve a leggere un dato o a muoversi fra i dati.

La densità è media: molti strati e filtri, ma un solo pannello laterale aperto alla volta. Il tono è sobrio e preciso, mai allarmistico: è informazione, non allerta. Il tema scuro sostituisce solo i token e mantiene la stessa struttura.

**Key Characteristics:**
- Mappa a tutto schermo, interfaccia come fogli sopra di essa.
- Un solo accento (ambra), usato per stato attivo e azione primaria.
- Colore dei dati ben distinto dal colore dell'interfaccia: la magnitudo ha la sua rampa.
- Testo UI almeno 12px; numeri in Atkinson Hyperlegible.
- Tema chiaro predefinito, tema scuro a token.

## Colors

Palette neutra fredda con un accento ambra caldo; il colore forte è riservato ai dati.

### Primary
- **Ambra Segnale** (#f5a623): riempimento di pulsanti primari (Filtri), stato attivo dei controlli, interruttori accesi. Il testo sopra è sempre **Inchiostro Ambra** (#1a1206), contrasto superiore a 9:1.
- **Ambra Bruciato** (#b45309): icone, chevron e testo accentato su fondo bianco (contrasto oltre 4,5:1). Nel tema scuro diventa l'ambra chiaro.

### Secondary
- **Blu Dati** (#1971c2): valori in evidenza nei grafici della scheda.
- **Blu Fuoco** (#0b5fff): solo anello di focus da tastiera.
- **Blu Collegamento** (#2f5fc7): link.

### Neutral
- **Inchiostro Notte** (#1b1f24): testo principale.
- **Grigio Strumento** (#5b6570): testo secondario e icone.
- **Carta Piena Luce** (#ffffff): pannelli e controlli.
- **Carta Fredda** (#fafbfd) e **Carta Premuta** (#eaeaf0): superfici alternate e hover.
- **Filo Grigio** (#d0d7de) e **Filo Lilla** (#d6d6e8): bordi di controlli e di pannelli.

### Dati sismici
- **Rampa magnitudo** (#fde68a → #fbbf24 → #f97316 → #c2410c → #dc2626): cinque classi, da M<2 a M≥5. È l'unica scala per cerchi in mappa, badge, istogrammi e riepiloghi.
- **Fasce d'età** (#e03131 ultima ora, #f08c00 24 ore, #f2c500 72 ore, #1e9be0 oltre): colore dei cerchi nel tempo reale.
- **Evidenza** (#e6007e): l'elemento cercato o selezionato in mappa.

### Named Rules
**The One Signal Rule.** L'ambra marca ciò che è attivo o primario, e basta. Non si usa come decorazione né come colore di dato.
**The Data Owns Its Colors Rule.** Il colore forte vive nei dati (magnitudo, età). L'interfaccia resta neutra, così i cerchi si leggono sempre.
**The Two Ambers Rule.** Riempimento = Ambra Segnale con testo scuro; testo e icone su bianco = Ambra Bruciato. Mai testo ambra chiaro su bianco.

## Typography

**Interfaccia:** Montserrat (400, 500, 600, 700), con `system-ui` come ripiego.
**Dati:** Atkinson Hyperlegible (400, 700), per numeri nei badge e nei grafici.

**Carattere:** Montserrat dà il tono pulito e civico dell'interfaccia; Atkinson rende inequivocabili cifre e caratteri simili nei dati.

### Hierarchy
- **Titolo** (700, 1,125rem, 1,25): titoli di scheda e di modale.
- **Etichetta** (600, 0,8125rem, 1,2): pulsanti, intestazioni di gruppo, voci di legenda.
- **Corpo** (400, 0,875rem, 1,4): testo dei pannelli. Base di tutti i rem: 14px × scala scelta dall'utente nel pannello Tema.
- **Didascalia** (400, 0,75rem, 1,35): note, tempi trascorsi, assi. Minimo assoluto per testo UI: 12px.
- **Dati** (700, 0,75rem, 1,2, cifre tabulari): badge magnitudo, valori nei grafici.

### Named Rules
**The Twelve Pixel Floor Rule.** Il testo dell'interfaccia non scende sotto 12px. Le etichette di assi SVG possono arrivare a 10px, mai meno.
**The Tabular Numbers Rule.** Magnitudi, conteggi e orari usano cifre tabulari, così le colonne restano allineate.

## Layout

Mappa a tutto schermo; l'interfaccia è posizionata fissa sopra di essa: barra strumenti in alto a destra, ricerca centrata in basso, legenda a sinistra, riquadro titolo e coordinate in basso a destra, rail dei pannelli sul bordo destro. Un solo pannello laterale aperto alla volta (scheda, storico, confronto, mappe); gli altri si ripiegano nel rail.

Punti di rottura: telefono fino a 720px (barra tab in basso, scheda a tutto schermo, legenda ridotta all'avvio), tablet fino a 1099px, desktop stretto fino a 1180px. Su telefono i comandi toccabili sono almeno 44px.

I valori di spazio non sono tokenizzati: sono gap di 4–12px. Larghezze note: scheda 440px, legenda 260px (128px quando ridotta su telefono), rail 44px.

## Elevation & Depth

Profondità a ibrido: le superfici di sfondo sono piatte, i pannelli e i controlli che galleggiano sopra la mappa portano un'ombra ambientale diffusa con bordo sottile. Le ombre dei pannelli ancorati a un lato si proiettano verso la mappa.

### Shadow Vocabulary
- **Ombra flottante** (`box-shadow: 0 4px 24px rgba(0, 0, 0, .12)`): controlli e pannelli sopra la mappa. Nel tema scuro `.5`.
- **Ombra tooltip** (`0 4px 18px rgba(30, 50, 110, .12)`): tooltip e popup.
- **Ombra pannello** (`±8px 0 28px rgba(20, 30, 60, .14)`): scheda a destra, pannello a sinistra.

### Named Rules
**The Floating Sheet Rule.** Ombra solo su ciò che sta sopra la mappa. Dentro un pannello la separazione la fanno bordi sottili e superfici alternate, non altre ombre.

## Shapes

Forme morbide ma ordinate: pillola (999px) per ricerca, Filtri, badge e interruttori; cerchio per i pulsanti strumento; 8px per righe e campi, 12px per i pannelli, 16px per i fogli grandi, 4px per i campi minuti. Bordi da 1px; i segnalini laterali da 3–4px marcano note e avvisi nelle schede.

## Components

### Pulsante primario (Filtri)
- **Shape:** pillola (999px), altezza 36px.
- **Colore:** riempimento ambra (#f5a623), testo #1a1206, peso 600, 13px.
- **Stati:** hover leggermente più scuro; focus con anello blu 2px a 2px di distanza.

### Pulsante strumento
- **Shape:** cerchio 36px (44px con puntatore touch), bianco, bordo 1px, ombra flottante.
- **Hover:** bordo e fondo ambra tenue, icona Ambra Bruciato.
- **Attivo (`aria-pressed`):** fondo ambra pieno, icona #1a1206.

### Ricerca
- Pillola bianca flottante in basso al centro, 1px di bordo, icona lente, campo, ripristino e pulsante Filtri integrato.

### Badge magnitudo
- Pillola a tinta piena con il colore della classe, bordo più scuro del 30%, testo bianco o scuro secondo la luminanza, Atkinson 700 a 12px.

### Riga ultimo evento
- Riga cliccabile in legenda: badge, luogo (600, con ellissi) e tempo trascorso (grigio). Bordo sottile, raggio 8px, hover ambra tenue. Apre la scheda dell'evento.

### Pannelli e scheda
- Foglio bianco con raggio 12–16px, ombra flottante o laterale; scheda a tutto schermo su telefono (≤720px).

### Legenda
- Riquadro a sinistra, 260px, con scorrimento interno; su telefono parte ridotta a una barra «▸ Legenda» da 128px.

## Do's and Don'ts

### Do:
- **Do** usare l'ambra solo per stato attivo e azione primaria, con testo #1a1206 sopra.
- **Do** usare la rampa magnitudo per ogni elemento che rappresenta una magnitudo (cerchi, badge, istogrammi).
- **Do** mantenere ogni testo UI a 12px o più e i bersagli touch a 44px.
- **Do** dare ai nuovi livelli un token `--z-*` e ai nuovi valori un token `--fs-*` esistente.
- **Do** fornire ogni testo nuovo in italiano e inglese e citare ogni fonte nel modale Info.

### Don't:
- **Don't** usare l'ambra come colore di un dato o come decorazione.
- **Don't** aggiungere ombre dentro i pannelli: separare con bordi e superfici alternate.
- **Don't** usare testo ambra chiaro su fondo bianco (contrasto insufficiente).
- **Don't** introdurre colori fuori dalla palette (viola, magenta, indaco) senza un ruolo semantico: l'evidenza è magenta, il pulsante 3D è indaco, e basta.
- **Don't** usare toni sensazionalistici o rossi di allarme per dati ordinari: l'app informa, non allerta.
