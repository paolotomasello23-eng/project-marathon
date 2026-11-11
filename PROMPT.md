# Marathon Project Madrid — da pagina web ad app vera

Sei l'unico sviluppatore di questo progetto. Devi trasformare un prototipo funzionante (una pagina HTML con tutta la logica già scritta e provata) in un'app installabile su telefono, utilizzabile offline e sincronizzata tra dispositivi.

Lavora in italiano: interfaccia, messaggi di commit e risposte a me. Codice e nomi tecnici in inglese.

## 1. Risultato atteso

Un'app personale per preparare la Maratona di Madrid del 25 aprile 2027 (obiettivo: finirla sano, possibilmente sotto le 4 ore). L'app:

- si installa sulla schermata Home di iPhone e Android e si apre a tutto schermo, come un'app (PWA);
- funziona senza rete: consultare il piano e registrare un allenamento non richiedono connessione;
- sincronizza i dati tra telefono e computer dietro un accesso personale;
- conserva calendario, risultati, analisi di ogni allenamento, proposte di modifica del piano e storico completo;
- è pubblicata su un indirizzo web mio.

Non è un rifacimento da zero: **la logica di allenamento esiste già e va portata, non reinventata**.

## 2. Cosa trovi in `reference/`

Leggi tutto prima di scrivere codice.

| Percorso | Contenuto |
|---|---|
| `reference/docs/brief.md` | Le mie richieste originali: ruolo del coach, dati da registrare, schermate, principi. È la fonte dei requisiti. |
| `reference/docs/piano.md` | Il piano attuale: 23 settimane, ritmi, test, regole di adattamento. |
| `reference/src/plan.js` | Generatore del piano (allineato all'indietro dalla data di gara), descrizione di ogni sessione, formati. Logica pura, senza DOM. |
| `reference/src/engine.js` | Analisi di un allenamento, stima del tempo in maratona, criteri (quarta corsa, lungo da 35 km), avvisi, proposte di modifica, **recupero delle sessioni saltate**, applicazione e annullamento delle modifiche. Logica pura. |
| `reference/src/app1.js` … `app4.js` | Stato, salvataggio con coda di scrittura, viste e gestione eventi del prototipo. Riferimento per comportamento e testi, non da copiare com'è. |
| `reference/src/app.css` | Token di colore e tipografia (tema chiaro e scuro) e stili dei componenti. |
| `reference/test/logic.js`, `reference/test/recovery.js` | Scenari eseguibili con `node`. `recovery.js` contiene asserzioni: deve restare verde. |
| `reference/data/backup.json` | I miei dati attuali nel formato di esportazione del prototipo. La nuova app deve importarlo. |
| `reference/screens/*.png` | Schermate del prototipo: sono il riferimento visivo. |
| `reference/marathon-project-madrid.html` | Il prototipo completo in un file, apribile in un browser. |

Prima cosa da fare: `node reference/test/recovery.js && node reference/test/logic.js`. Devono girare senza errori.

Dove `brief.md` e questo prompt dicono cose diverse vale questo prompt. I tre punti in cui ho cambiato idea dopo il brief: le corse saltate si recuperano (sezione 4, punto 6), l'interfaccia deve avere poche scritte (sezione 6), il piano parte dal 16 novembre 2026.

## 3. Decisioni già prese

Non rimetterle in discussione; se una ti sembra sbagliata, dimmelo e aspetta la mia risposta.

- **Tipo di app:** PWA. Niente store per ora (vedi la fase facoltativa in fondo).
- **Stack:** Vite + React + TypeScript. Stili in CSS semplice, partendo dai token di `reference/src/app.css`; nessuna libreria di componenti. Grafici con Chart.js.
- **Dati in locale:** IndexedDB tramite Dexie. L'app legge e scrive sempre in locale; la rete serve solo a sincronizzare.
- **Sincronizzazione e accesso:** Supabase (Postgres con Row Level Security, accesso con link via email). Una sola tabella di documenti, come nel prototipo (vedi sezione 5).
- **Offline:** `vite-plugin-pwa` con precache della shell; manifest con nome, icone 192/512 e maskable, `display: standalone`, colori del tema; icona e meta per iOS.
- **Test:** Vitest per il dominio, Playwright per i flussi principali.
- **Pubblicazione:** hosting statico (Vercel, Netlify o Cloudflare Pages: chiedimi quale account ho).

## 4. Regole del dominio: da portare 1:1

Porta `plan.js` e `engine.js` in moduli TypeScript sotto `src/domain/`, tipizzati, senza cambiare numeri, soglie o testi. Ogni regola deve avere un test. Elenco di controllo:

1. **Piano:** schema di 24 settimane allineato all'indietro dalla gara (se le settimane disponibili sono meno, si tagliano le prime); fasi base, costruzione, specifico, scarico, gara; settimane di scarico; test dei 5 km, 10 km e mezza; quarta corsa e lungo da 35 km come sessioni condizionali.
2. **Ritmi:** derivati dal tempo equivalente sui 10 km e dall'obiettivo (`pacesFromRef`).
3. **Analisi di un allenamento** (`evaluate`): completamento, ritmo corretto per dislivello e caldo, frequenza cardiaca sulla massima, RPE atteso per tipo di seduta, confronto con allenamenti simili, alimentazione nei lunghi, dolore, giudizio finale. Distinzione tra dato inserito, calcolato e stimato.
4. **Stima della maratona** (`predict`): intervallo e livello di fattibilità, confidenza, soglie dei test.
5. **Proposte** (`propose`): dolore e malattia (applicate subito, annullabili), fatica, tetto al carico settimanale rispetto ai km fatti davvero, ritmi facili su tendenza di più uscite, aggiornamento dopo un test, quarta corsa, lungo da 35 km, obiettivo. Mai una modifica per una sola corsa.
6. **Recupero di una corsa saltata** (`recoveryBlocked`, `recoveryOptions`, `recoveryChange`): la corsa va nel primo giorno adatto e il resto si tara (niente qualità il giorno dopo un recupero impegnativo, forza leggera nello stesso giorno, corse facili ridotte fino al 30% se la settimana supera di oltre il 15% i km previsti, lungo successivo accorciato se si supererebbe la settimana di picco). Non si recupera con dolore o malattia, negli ultimi 10 giorni, dopo due recuperi in 7 giorni, alla terza volta per la stessa sessione, o se non c'è un giorno adatto.
7. **Modifiche:** ogni modifica è un record con valore precedente, valore nuovo, motivo e impatto; si accetta, si rifiuta, si annulla. Prima di ogni modifica al calendario si salva una copia del piano (ultime 40).

Riscrivi `reference/test/recovery.js` e gli scenari di `logic.js` come test Vitest: stessi input, stessi risultati.

## 5. Dati e sincronizzazione

Documenti, identici al prototipo: `core` (profilo, gara, obiettivo, ritmi, riferimento, storici), `plan` (sessioni), e le raccolte `workouts`, `checkins`, `changes`, `versions`.

Tabella Supabase unica:

```sql
create table docs (
  user_id uuid not null references auth.users(id) on delete cascade,
  coll text not null,            -- 'app' | 'workouts' | 'checkins' | 'changes' | 'versions'
  id text not null,              -- 'core', 'plan' oppure l'id del documento
  data jsonb,                    -- null = eliminato
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);
alter table docs enable row level security;
create policy "own rows" on docs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Sincronizzazione: ogni scrittura va subito in IndexedDB e in una coda; la coda si svuota quando c'è rete; in lettura si scaricano i documenti con `updated_at` più recente dell'ultimo allineamento. Conflitti: vince la scrittura più recente per documento. Nessun dato storico si cancella in silenzio: eliminare un allenamento lo marca come eliminato e resta ripristinabile.

Importazione: la schermata Profilo importa `reference/data/backup.json` (formato `{ app: "marathon-project-madrid", v: 1, core, plan, workouts, checkins, changes }`) ed esporta nello stesso formato, più un CSV degli allenamenti.

## 6. Schermate

Le stesse del prototipo: Oggi, Calendario (giorno, settimana, mese), Registra, Analisi, Progressi (grafici), Obiettivi, Coach (proposte, storico, versioni), Guida, Profilo. Navigazione a schede in basso su telefono con il pulsante Registra al centro; barra laterale su schermi larghi. Routing con URL veri.

**Regola dell'interfaccia: poche scritte.** Titoli brevi, numeri in evidenza, nessun paragrafo di spiegazione nelle schermate principali. I dettagli stanno dietro un tocco ("Dettagli", "Perché", "Analisi e dati"). Usa i testi del prototipo così come sono; non aggiungere sottotitoli, suggerimenti o testi di benvenuto. Pulsanti di almeno 44 px, tema chiaro e scuro, contrasto leggibile, focus visibile, etichette per ogni campo.

## 7. Cosa aggiungere rispetto al prototipo

- Installazione e funzionamento offline (sezione 3).
- Accesso personale e sincronizzazione (sezione 5).
- **Calendario esterno:** esportazione del piano in un file `.ics` da importare in Google Calendar o Apple Calendar.
- **Promemoria:** notifica locale il giorno dell'allenamento, se il dispositivo lo consente; nessun server di push in questa fase.
- **Cambio della data di gara** dal Profilo, con riallineamento delle sessioni future e copia del piano precedente.

Lascia predisposti, senza implementarli, due punti di estensione dietro un'interfaccia: importazione delle attività da Strava o da file GPX/FIT, e un parere scritto da un modello AI sull'allenamento (il prototipo ha già il testo del prompt in `app4.js`, funzione `aiPrompt`).

## 8. Fasi e criteri di accettazione

Procedi una fase alla volta. Alla fine di ogni fase: test verdi, commit, due righe su cosa hai fatto e cosa serve da me.

0. **Lettura.** Leggi `reference/`, esegui i due test, scrivi un piano breve in `PLAN.md`. *Fatto quando:* mi elenchi dubbi e cose che ti servono.
1. **Dominio.** Porta `plan.js` ed `engine.js` in TypeScript con i test. *Fatto quando:* i test Vitest riproducono gli scenari di riferimento, compresi tutti i casi di `recovery.js`.
2. **App locale.** Interfaccia completa su IndexedDB, senza rete. Importa `backup.json`. *Fatto quando:* con i miei dati importati vedo il piano dal 16 novembre 2026, registro una corsa, la vedo analizzata, salto una sessione e la ritrovo recuperata nel giorno giusto, annullo la modifica.
3. **PWA.** Manifest, icone, service worker. *Fatto quando:* Lighthouse la considera installabile e, in modalità aereo, l'app si apre e salva un allenamento.
4. **Account e sincronizzazione.** Supabase, accesso con link via email, coda di scrittura. *Fatto quando:* un allenamento registrato sul telefono compare sul computer, e uno registrato offline si sincronizza al ritorno della rete.
5. **Extra.** Esportazione `.ics`, promemoria locali, cambio della data di gara.
6. **Pubblicazione.** Build, variabili d'ambiente, deploy, `README.md` con i passi per ripetere tutto da zero.

Facoltativa, solo se te lo chiedo: impacchettare la stessa app con Capacitor per pubblicarla sugli store (per iOS servono un Mac con Xcode e un account sviluppatore Apple).

## 9. Cosa devi chiedermi

- URL e chiave pubblica del progetto Supabase (ti dico io quando l'ho creato; fino ad allora lavora in locale).
- Quale hosting usare e con quale account.
- Nome breve dell'app e icona (in mancanza: "Madrid 27" e un'icona semplice con la linea blu del percorso su fondo asfalto, come nella barra in alto del prototipo).

## 10. Cosa non fare

- Non cambiare regole, soglie o testi del dominio senza chiedermelo.
- Non inserire chiavi o segreti nel codice: solo in `.env`, con un `.env.example`.
- Non aggiungere tracciamento, pubblicità o servizi esterni non elencati qui.
- Non dichiarare finita una fase con test rossi o funzioni simulate: se qualcosa non è realizzabile, scrivilo chiaramente.
- Non dare consigli medici nell'app: in caso di dolore l'app riduce il carico e invita a farsi valutare da un professionista.
