# Piano di lavoro — Madrid 27

Stato: vedi la tabella delle fasi. Fonte dei requisiti: `PROMPT.md` (prevale) e `reference/docs/brief.md`.

## Cosa ho verificato nella fase 0

- `node reference/test/recovery.js` → `RECOVERY_OK (settimana dopo il 32 km: 63 km, picco 63)`.
- `node reference/test/logic.js` → gira senza errori (168 sessioni dal 9 novembre, stima centrale 4:07:05, ecc.).
- `reference/data/backup.json`: 161 sessioni dal 16 novembre 2026 (23 settimane), identiche a `generate({ raceDate: '2027-04-25', startDate: '2026-11-16', idp: 'b' })`; 8 modifiche nello storico, nessun allenamento.

## Struttura

```
src/domain/     plan.ts, engine.ts, types.ts      logica pura portata 1:1 (nessun DOM, nessuna rete)
src/data/       db.ts (Dexie), store.ts, actions.ts, sync.ts, remote.ts (Supabase)
src/lib/        ics.ts, reminders.ts, pwa.ts, format.ts, clock.ts, download.ts
src/ext/        activityImport.ts, aiCoach.ts     punti di estensione, solo interfacce
src/ui/         cornice, fogli, una vista per schermata
src/sw.ts       service worker (precache + promemoria)
tests/domain/   Vitest: parità con reference/src, recovery, scenari, una regola = almeno un test
tests/data/     Vitest: azioni, backup, sincronizzazione con un server finto, .ics, promemoria, cambio data
tests/e2e/      Playwright: flussi principali, offline, installabilità, sincronizzazione, promemoria
supabase/       schema.sql
```

Scelte tecniche dentro i paletti del prompt:

- **Dominio**: `plan.js` ed `engine.js` tradotti riga per riga in TypeScript. Oltre ai test scritti a mano, un test di parità esegue il codice originale di `reference/src` e il port sugli stessi input (stagione simulata) e confronta i risultati.
- **Stato**: uno store in memoria con la stessa forma del prototipo (`core`, `plan`, `workouts`, `checkins`, `changes`, `versions`); ogni scrittura va in IndexedDB (tabella `docs`) e nella coda (`outbox`) nella stessa transazione.
- **Sincronizzazione**: a ogni giro si confronta l'elenco dei documenti dell'account con quello locale, si scaricano quelli cambiati, poi si svuota la coda. Conflitto sullo stesso documento: vince la scrittura più recente. La logica è scritta contro un'interfaccia (`RemoteDocs`); l'adattatore Supabase è l'unico punto che parla con la rete.
- **Routing**: `react-router-dom`, URL veri (`/`, `/calendario`, `/registra`, `/analisi/:id`, `/progressi`, `/obiettivi`, `/coach`, `/guida`, `/profilo`, `/altro`).
- **Caratteri**: Barlow e Barlow Condensed inclusi nell'app (pacchetti `@fontsource`), non più da Google Fonts: servono offline e non c'è un servizio esterno in più.

## Fasi

| Fase | Contenuto | Fatto quando | Stato |
|---|---|---|---|
| 0 | Lettura, test di riferimento, questo piano | elenco dubbi e richieste | fatta |
| 1 | Dominio in TypeScript con test | Vitest riproduce `recovery.js` e gli scenari di `logic.js` | fatta |
| 2 | App locale su IndexedDB, importazione del backup | flusso completo con i dati importati | fatta (`tests/e2e/flow.spec.ts`) |
| 3 | PWA: manifest, icone, service worker | installabile; in modalità aereo si apre e salva | fatta su Chromium: Lighthouse 11.7.1 PWA 100, `tests/e2e/pwa.spec.ts`. Da provare su telefoni veri |
| 4 | Account e sincronizzazione Supabase | telefono → computer; offline → online | tabella e regole verificate sul progetto vero; **accesso vero da provare** |
| 5 | `.ics`, promemoria locali, cambio data di gara | — | fatta |
| 6 | Build, variabili d'ambiente, deploy, README | — | pubblicata su Vercel; **build da rifare con le variabili di Supabase** |

## Decisioni prese lungo la strada (dimmi se una non ti va)

1. **`updated_at`: nessun trigger, tabella identica alla tua.** `updated_at` è l'orario in cui il documento è stato scritto sul dispositivo (corretto sull'orologio del server quando è leggibile): serve a far vincere la scrittura più recente. Per scoprire che cosa è cambiato l'app non usa "updated_at più recente dell'ultimo allineamento" ma confronta l'elenco (coll, id, updated_at) dell'account con quello locale e scarica solo i documenti diversi. Motivo: una corsa registrata offline alle 10 e inviata alle 12 ha un orario più vecchio di quello a cui l'altro dispositivo si è già allineato, e con il cursore non verrebbe mai vista. C'è un test che lo dimostra.
2. **Accesso su iPhone.** Il link via email si apre in Safari, che ha un archivio separato dall'app installata: lì il link non può funzionare. Per questo, dopo "Invia link", l'app accetta anche il codice a 6 cifre della stessa email. Richiede di aggiungere `{{ .Token }}` al modello dell'email in Supabase (README, punto 4).
3. **Registro sincrono delle scritture.** IndexedDB è asincrono: i test hanno mostrato che chiudere la pagina un istante dopo un salvataggio poteva perdere il dato. Ogni scrittura passa prima da localStorage (come faceva il prototipo) e viene riapplicata al prossimo avvio se IndexedDB non l'ha confermata.
4. **Cambio della data di gara.** Le sessioni future ancora pianificate vengono sostituite da quelle dello schema riallineato all'indietro dalla nuova data; restano quelle passate, fatte, saltate e quelle aggiunte da te. Le modifiche del coach su sessioni future non ancora corse si perdono (restano nello storico e nella copia del piano). Se anticipando la gara il carico salta in avanti, interviene la regola esistente del tetto al carico settimanale. È una modifica come le altre: annullabile.
5. **Primo accesso con dati diversi.** Se dispositivo e account hanno piani diversi l'app chiede quale tenere; gli allenamenti presenti da una sola parte restano.
6. **Promemoria.** Notifica alla prima apertura della giornata (non prima delle 6) e mentre l'app è aperta; ad app chiusa solo dove il sistema lo concede (Android, app installata). Se in un giorno ci sono più sessioni si ricorda prima la corsa, poi la forza.
7. **Due difetti del prototipo corretti.** Nella pagina Registra il "+" del pulsante centrale spariva (blu su blu); nel foglio "Salta" la scelta del giorno di recupero restava visibile anche con motivo dolore o malattia.
8. **Testi.** Cambiata solo la sezione "Limiti" del Profilo (diceva "Non è installabile" e "niente notifiche"). Etichette nuove, per le funzioni nuove: Gara, Sposta, "Conferma: riallinea il piano", Account, Email, "Invia link", Codice, Accedi, Sincronizza, Esci, "Usa l'account", "Usa questo dispositivo", Promemoria, Attiva, Disattiva, "Calendario (.ics)", "Aggiornamento pronto".
9. **Pulsanti.** I controlli che nel prototipo erano più bassi di 44 px (pulsanti piccoli, link, schede) sono stati portati a 44.
10. **Caratteri.** Barlow incluso nell'app invece che caricato da Google Fonts: funziona offline e non c'è un servizio esterno in più.

## Risposte ricevute (12 novembre)

- Supabase: progetto indicato; i valori stanno in `.env` (non nel repository). Dal controllo del 12 novembre: il progetto risponde, l'accesso via email è attivo, **la tabella `docs` non esiste ancora** (va eseguito `supabase/schema.sql`).
- Hosting: nessun account esistente → consigliato Vercel con accesso GitHub (passi nel README).
- Nome e icona: confermati.
- Versione 1 del piano: non serve; il piano ufficiale parte il 16 novembre. Le copie senza contenuto non offrono più il ripristino.
- Ora dei promemoria: si sceglie dal Profilo ("Non prima delle"). Con i promemoria attivi il calendario esportato porta un avviso alla stessa ora: su iPhone è il modo per avere un promemoria a orario ad app chiusa.
- Serve solo iPhone: i file si consegnano con il foglio di condivisione di iOS; l'accesso nell'app installata usa il codice dell'email.

## Stato al 12 novembre, dopo il deploy

- Supabase: tabella `docs` creata; `npm run test:supabase` passa 5 su 5 (richieste dell'app accettate dall'API vera, chi non ha fatto l'accesso non vede e non scrive, accesso via email attivo, orario del server leggibile).
- App pubblicata su https://project-marathon-blush.vercel.app: indirizzi, installabilità e uso offline verificati (`npm run test:deploy`: 2 su 3).
- **La build pubblicata non contiene le variabili di Supabase**: la scheda Account non compare e l'app resta locale.

## Cosa manca per chiudere

1. Vercel → Settings → Environment Variables: aggiungere `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, poi Deployments → ⋯ → Redeploy.
2. Supabase → Authentication: *Site URL* = indirizzo di Vercel, *Redirect URLs* = lo stesso seguito da `/profilo`; `{{ .Token }}` nei modelli email *Confirm signup* e *Magic Link*.
3. Prova vera su iPhone: installazione, accesso con codice, allenamento che compare sul computer, uno registrato in modalità aereo che si sincronizza al ritorno della rete, notifica.
