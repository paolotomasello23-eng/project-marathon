# Madrid 27

App personale per preparare la Maratona di Madrid del 25 aprile 2027: calendario, registrazione degli allenamenti, analisi, proposte di modifica del piano e storico. Si installa sulla schermata Home (PWA), funziona senza rete e, con un account, si sincronizza tra telefono e computer.

La logica di allenamento è quella del prototipo in `reference/`, portata in TypeScript senza cambiare numeri, soglie o testi.

## Stato

| Fase | Stato |
|---|---|
| 0 Lettura e piano | fatta |
| 1 Dominio in TypeScript | fatta |
| 2 App locale su IndexedDB | fatta |
| 3 PWA | fatta (verificata su Chromium; da provare su un iPhone vero) |
| 4 Account e sincronizzazione | account con email e password (più link via email, facoltativo); tabella e regole di accesso verificate sul progetto vero (`npm run test:supabase`: 5 su 5); **manca un accesso vero** da telefono e computer |
| 5 `.ics`, promemoria, cambio data di gara | fatta |
| 6 Pubblicazione | pubblicata su https://project-marathon-blush.vercel.app: installabile, funziona offline, configurata per la sincronizzazione (`npm run test:deploy`: 3 su 3) |

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

```bash
npm run test:supabase
```

Controlli sul progetto Supabase vero indicato in `.env`, con la sola chiave pubblica e senza scrivere nulla: la tabella esiste, le richieste dell'app sono accettate, chi non ha fatto l'accesso non vede e non scrive, l'accesso via email è attivo.

```bash
DEPLOY_URL=https://project-marathon-blush.vercel.app npm run test:deploy
```

Controlli sull'app pubblicata, in un browser pulito e senza fare l'accesso: indirizzi e intestazioni, installabilità, uso offline, e che la build contenga la configurazione di Supabase (scheda Account visibile).

## Account e sincronizzazione (Supabase)

Ognuno crea il proprio account con **email e password** e ritrova i propri dati su qualunque dispositivo. I dati di un account li vede solo quell'account (regole di accesso sulla tabella). In alternativa si può entrare con un link via email, che però richiede un servizio email configurato (vedi sotto).

Configurazione del progetto, una volta sola:

1. Crea un progetto su Supabase.
2. **SQL Editor** → incolla ed esegui `supabase/schema.sql`. Crea la tabella `docs` con le regole di accesso: ognuno vede e scrive solo le proprie righe.
3. **Authentication → Sign In / Providers → Email** → disattiva **Confirm email**. Così chi crea un account entra subito e non parte nessuna email: non serve alcun servizio di posta. (Con la conferma attiva, Supabase prova a scrivere a ogni nuovo iscritto, e con il servizio email incluso può scrivere solo ai membri del progetto.)
4. **Project Settings → API**: copia *Project URL* e la chiave pubblica (*anon* o *publishable*).
5. Copia `.env.example` in `.env` e riempi i due valori:

```bash
cp .env.example .env
```

In `VITE_SUPABASE_URL` va l'indirizzo base del progetto (`https://….supabase.co`); se lo copi con `/rest/v1/` in fondo viene sistemato da solo. Sull'hosting vanno bene anche i nomi senza prefisso (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). `.env` non va nel repository. I due valori sono pubblici per natura (finiscono nel codice inviato al browser): a proteggere i dati sono le regole di accesso della tabella, non la segretezza della chiave. La chiave `service_role` invece non va mai usata nell'app: se finisce per errore al posto di quella pubblica, la build si ferma.

Da sapere:

- **Password dimenticata.** Senza un servizio email non c'è recupero via email. I dati però restano sul dispositivo: Profilo → Dati → *Backup*, poi si crea un account nuovo e si ripristina il backup. Chi è collegato può cambiare password da Profilo → Account → *Password*.
- **Più account sullo stesso dispositivo.** Ogni account ha il suo archivio locale: uscendo ed entrando con un altro account l'app passa all'archivio di quello, e i dati non si mescolano.
- **Chiudere le iscrizioni.** Quando tu e i tuoi amici avete l'account, in Authentication → Sign In / Providers puoi disattivare *Allow new users to sign up*.

### Facoltativo: email (link di accesso, conferma dell'indirizzo)

Serve solo se vuoi usare "Accedi con un link via email" o la conferma dell'indirizzo. Supabase permette di modificare i modelli delle email solo con un servizio di posta proprio (**Authentication → Emails → SMTP Settings**), e quello incluso scrive solo ai membri del progetto. Con un servizio SMTP (per esempio Brevo, Resend o un account Gmail dedicato con una "password per le app"):

1. inserisci in *SMTP Settings* server, porta, utente, password e indirizzo del mittente forniti dal servizio;
2. nei modelli **Confirm signup** e **Magic Link** aggiungi `Codice: {{ .Token }}`: su iPhone il link si apre in Safari, non nell'app installata, quindi lì si entra scrivendo il codice;
3. in **Authentication → URL Configuration** metti l'indirizzo pubblico dell'app in *Site URL* e lo stesso seguito da `/profilo` in *Redirect URLs*.

Come funziona:

- l'app legge e scrive sempre in IndexedDB; ogni scrittura entra in una coda che si svuota quando c'è rete;
- ogni documento porta l'orario in cui è stato scritto: se telefono e computer modificano lo stesso documento vince la scrittura più recente;
- a ogni giro l'app confronta l'elenco dei documenti dell'account con quello locale e scarica solo quelli cambiati;
- eliminare un allenamento lo marca come eliminato (resta ripristinabile); le copie del piano oltre le ultime 40 diventano righe con `data` nullo;
- al primo accesso su un dispositivo che ha già un piano diverso da quello dell'account, l'app chiede quale tenere; gli allenamenti presenti da una sola parte restano comunque;
- se sul dispositivo ci sono i dati di un altro account, l'app non li unisce né li invia: apre un archivio locale separato per l'account nuovo.

## Pubblicazione

L'app è un sito statico: `npm run build` produce la cartella `dist/`.

```bash
npm run build
```

Su qualunque hosting servono tre cose: le due variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` impostate **prima** della build (vengono lette in quel momento), il comando di build `npm run build`, la cartella di uscita `dist`.

**Vercel (consigliato se non hai già un account altrove)** — si entra con GitHub, è gratuito per uso personale:

1. vai su vercel.com e scegli *Continue with GitHub*;
2. *Add New… → Project*, poi *Import* accanto a `project-marathon`;
3. apri *Environment Variables* e aggiungi `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` con i valori del tuo `.env`;
4. *Deploy*. `vercel.json` contiene già build, cartella, reindirizzamento di tutti gli indirizzi su `index.html` e intestazioni di cache. Se le variabili le aggiungi dopo (*Settings → Environment Variables*), serve ripubblicare: *Deployments → ⋯ → Redeploy*. Le variabili vengono lette durante la build, non dopo;
5. copia l'indirizzo che Vercel ti assegna (tipo `https://project-marathon-….vercel.app`).

Da lì in poi ogni invio sul ramo principale del repository ripubblica l'app da solo.

Alternative equivalenti:

- **Netlify**: importa il repository; `netlify.toml` contiene build e cartella, `public/_redirects` e `public/_headers` il resto. Variabili in *Site configuration → Environment variables*.
- **Cloudflare Pages**: collega il repository, comando `npm run build`, cartella `dist`; usa gli stessi `_redirects` e `_headers`. Variabili in *Settings → Environment variables*.

Serve HTTPS (tutti e tre lo danno): senza, il service worker non si installa.

## Su iPhone

1. Apri l'indirizzo dell'app in **Safari** → Condividi → *Aggiungi alla schermata Home*. Da quel momento usala dall'icona: è lì che vivono i dati e le notifiche.
2. **Account**: Profilo → Account → email e password → *Crea account* la prima volta, *Accedi* le successive e sugli altri dispositivi. Chi apre l'app su un dispositivo nuovo trova la stessa scheda nella schermata iniziale.
3. **Promemoria**: Profilo → Promemoria → *Attiva* (solo dall'app installata, iOS 16.4 o successivo). La notifica dell'allenamento arriva quando apri l'app, non prima dell'ora scelta in *Non prima delle*.
4. **Avviso a orario anche ad app chiusa**: con i promemoria attivi, Profilo → Dati → *Calendario (.ics)* esporta il piano con un avviso all'ora scelta. Aggiungilo al Calendario di iPhone: a far suonare l'avviso è il Calendario, quindi funziona sempre. Dopo modifiche importanti al piano conviene esportarlo di nuovo.
5. **File** (backup, CSV, calendario): su iPhone si apre il foglio di condivisione; scegli *Salva su File* o l'app con cui aprirli.

Quando esce una versione nuova, in *Oggi* compare "Aggiornamento pronto": un tocco e l'app si ricarica aggiornata.

Su computer basta aprire l'indirizzo nel browser ed entrare con la stessa email e password.

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

- **Promemoria**: senza un server di push una web app non può programmare una notifica a orario. Su iPhone la notifica dell'allenamento arriva aprendo l'app (dall'ora scelta in poi) ed esiste solo con l'app aggiunta alla Home. Per un avviso a orario ad app chiusa c'è il calendario esportato con gli avvisi. (Su Android con l'app installata il sistema può svegliarla in background, all'orario che decide lui.)
- **Versione 1 del piano**: il piano ufficiale è quello che parte il 16 novembre. Il backup del prototipo elenca anche la versione 1 (inizio 9 novembre) ma senza le sessioni: resta nello storico come nota, senza pulsante di ripristino.
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
