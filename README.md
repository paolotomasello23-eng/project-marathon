# Madrid 27

App personale per preparare la Maratona di Madrid del 25 aprile 2027: calendario, registrazione degli allenamenti, analisi, proposte di modifica del piano e storico. Si installa sulla schermata Home (PWA), funziona senza rete e, con un account, si sincronizza tra telefono e computer.

La logica di allenamento è quella del prototipo in `reference/`, portata in TypeScript senza cambiare numeri, soglie o testi.

## Stato

| Fase | Stato |
|---|---|
| 0 Lettura e piano | fatta |
| 1 Dominio in TypeScript | fatta |
| 2 App locale su IndexedDB | fatta |
| 3 PWA | fatta (verificata su Chromium; da provare su iPhone e Android veri) |
| 4 Account e sincronizzazione | codice e test pronti; **manca la prova contro un progetto Supabase vero** |
| 5 `.ics`, promemoria, cambio data di gara | fatta |
| 6 Pubblicazione | configurazione pronta; **manca il deploy** (serve sapere quale hosting e quale account) |

## Avvio da zero

Serve Node 20 o più recente.

```bash
git clone https://github.com/paolotomasello23-eng/project-marathon.git
```

```bash
cd project-marathon && npm install
```

```bash
npm run dev
```

L'app si apre su `http://localhost:5173`. Senza altro funziona solo in locale: nella schermata iniziale si può creare un piano oppure ripristinare `reference/data/backup.json`.

## Test

```bash
npm run test:reference
```

I due script originali del prototipo (`recovery.js` deve stampare `RECOVERY_OK`).

```bash
npm test
```

Vitest: dominio (parità con il codice originale su stagioni simulate, casi A–I del recupero, scenari di `logic.js`, un test per regola), azioni e backup, sincronizzazione con due dispositivi e un server finto, `.ics`, promemoria, cambio data.

```bash
npm run test:e2e
```

Playwright sulla build di produzione: flussi principali, offline, installabilità, sincronizzazione tra due browser (il client Supabase è quello vero, le risposte sono simulate), promemoria. Usa Chromium; la prima volta può servire `npx playwright install chromium`.

```bash
npm run test:schema
```

Prova `supabase/schema.sql` e le regole di accesso su un Postgres locale usa-e-getta (servono i binari di PostgreSQL).

## Account e sincronizzazione (Supabase)

1. Crea un progetto su Supabase.
2. **SQL Editor** → incolla ed esegui `supabase/schema.sql`. Crea la tabella `docs` con le regole di accesso: ognuno vede e scrive solo le proprie righe.
3. **Authentication → URL Configuration**: in *Site URL* metti l'indirizzo pubblico dell'app; in *Redirect URLs* aggiungi lo stesso indirizzo seguito da `/profilo` (e `http://localhost:5173/profilo` per lo sviluppo).
4. **Authentication → Emails → Magic Link**: aggiungi al testo dell'email il codice a 6 cifre, per esempio `Codice: {{ .Token }}`. Serve su iPhone: il link si apre in Safari, non nell'app installata, quindi lì si entra scrivendo il codice.
5. **Project Settings → API**: copia *Project URL* e la chiave *anon public*.
6. Copia `.env.example` in `.env` e riempi i due valori:

```bash
cp .env.example .env
```

`.env` non va nel repository. I due valori sono pubblici per natura (finiscono nel codice inviato al browser): a proteggere i dati sono le regole di accesso della tabella, non la segretezza della chiave. La chiave `service_role` invece non va mai usata nell'app.

Come funziona:

- l'app legge e scrive sempre in IndexedDB; ogni scrittura entra in una coda che si svuota quando c'è rete;
- ogni documento porta l'orario in cui è stato scritto: se telefono e computer modificano lo stesso documento vince la scrittura più recente;
- a ogni giro l'app confronta l'elenco dei documenti dell'account con quello locale e scarica solo quelli cambiati;
- eliminare un allenamento lo marca come eliminato (resta ripristinabile); le copie del piano oltre le ultime 40 diventano righe con `data` nullo;
- al primo accesso su un dispositivo che ha già un piano diverso da quello dell'account, l'app chiede quale tenere; gli allenamenti presenti da una sola parte restano comunque.

## Pubblicazione

L'app è un sito statico: `npm run build` produce la cartella `dist/`.

```bash
npm run build
```

Su qualunque hosting servono tre cose: le due variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` impostate **prima** della build (vengono lette in quel momento), il comando di build `npm run build`, la cartella di uscita `dist`.

- **Vercel**: importa il repository; `vercel.json` contiene già build, cartella, reindirizzamento di tutti gli indirizzi su `index.html` e intestazioni di cache. Variabili in *Settings → Environment Variables*.
- **Netlify**: importa il repository; `netlify.toml` contiene build e cartella, `public/_redirects` e `public/_headers` il resto. Variabili in *Site configuration → Environment variables*.
- **Cloudflare Pages**: collega il repository, comando `npm run build`, cartella `dist`; usa gli stessi `_redirects` e `_headers`. Variabili in *Settings → Environment variables*.

Dopo il primo deploy: aggiorna *Site URL* e *Redirect URLs* in Supabase con l'indirizzo definitivo.

Serve HTTPS (tutti e tre lo danno): senza, il service worker non si installa.

## Installazione sul telefono

- **iPhone (Safari)**: Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome)**: menu → *Installa app* (o il banner che compare da solo).

Quando esce una versione nuova, in *Oggi* compare "Aggiornamento pronto": un tocco e l'app si ricarica aggiornata.

## Struttura

```
src/domain/     plan.ts, engine.ts, types.ts   logica pura portata 1:1 da reference/src (nessun DOM, nessuna rete)
src/data/       db.ts        IndexedDB (Dexie): documenti, coda di invio, impostazioni del dispositivo
                store.ts     stato in memoria, scrittura locale con registro sincrono
                actions.ts   registrare, saltare e recuperare, modifiche, versioni, backup, cambio data di gara
                sync.ts      motore di sincronizzazione (contro un'interfaccia)
                remote.ts    adattatore Supabase: l'unico file che parla con il server
src/lib/        ics.ts, reminders.ts, pwa.ts, format.ts, clock.ts, download.ts
src/ext/        activityImport.ts, aiCoach.ts  punti di estensione: solo interfacce
src/ui/         cornice, fogli, una vista per schermata
src/sw.ts       service worker: cache della shell, promemoria
supabase/       schema.sql
scripts/        make-icons.mjs (icone), check-schema.sh (prova dello schema)
tests/          domain/, data/ (Vitest), e2e/ (Playwright)
reference/      il prototipo: fonte delle regole e dei testi, usato dai test di parità
```

Regola per chi tocca il codice: numeri, soglie e testi del dominio non si cambiano senza una decisione esplicita. I test di parità (`tests/domain/parity.test.ts`) eseguono il codice originale e il port sugli stessi dati: se divergono, falliscono.

### Punti di estensione

- **Importazione attività** (`src/ext/activityImport.ts`): una sorgente (Strava, GPX, FIT) implementa `ActivitySource` e si registra con `registerActivitySource`; `toWorkoutDraft` porta l'attività nel modulo Registra.
- **Parere AI** (`src/ext/aiCoach.ts`): un fornitore implementa `AiCoach` e si registra con `registerAiCoach`; il testo del prompt è già quello del prototipo. La chiave di un modello non può stare nell'app: il fornitore deve passare da un server.

Finché nessuno è registrato l'interfaccia non mostra nulla.

## Limiti da conoscere

- **Promemoria**: senza un server di push una web app non può programmare una notifica a orario. La notifica dell'allenamento arriva alla prima apertura della giornata e mentre l'app è aperta. Ad app chiusa arriva solo dove il sistema concede il controllo periodico in background (Android con l'app installata), all'orario che decide il sistema. Su iPhone le notifiche esistono solo con l'app aggiunta alla Home e arrivano solo aprendola.
- **Versione 1 del piano**: il backup del prototipo elenca la versione 1 (inizio 9 novembre) ma non ne contiene le sessioni: compare nello storico, non è ripristinabile. Le versioni create da qui in poi lo sono.
- **Conflitti**: la regola è per documento. Se due dispositivi, uno dei quali senza rete, cambiano entrambi il piano, resta il piano scritto per ultimo; gli allenamenti, che sono documenti separati, si uniscono sempre e la sessione collegata torna "fatta".
- **Analisi e proposte** seguono regole fisse; carico, ritmo in piano e previsione sono stime e come tali sono indicate.
- L'app riduce il carico in caso di dolore o malattia e invita a farsi valutare: non fa diagnosi.

## Icone

```bash
npm run icons
```

Rigenera le icone in `public/` da `scripts/make-icons.mjs` (linea blu del percorso su fondo asfalto).

## Facoltativo: store

La stessa app si può impacchettare con Capacitor per App Store e Google Play. Per iOS servono un Mac con Xcode e un account sviluppatore Apple. Non è fatto.
