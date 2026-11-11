# Piano di lavoro — Madrid 27

Stato: vedi la tabella in fondo. Fonte dei requisiti: `PROMPT.md` (prevale) e `reference/docs/brief.md`.

## Cosa ho verificato nella fase 0

- `node reference/test/recovery.js` → `RECOVERY_OK (settimana dopo il 32 km: 63 km, picco 63)`.
- `node reference/test/logic.js` → gira senza errori (168 sessioni dal 9 novembre, stima centrale 4:07:05, ecc.).
- `reference/data/backup.json`: 161 sessioni dal 16 novembre 2026 (23 settimane), identiche a `generate({ raceDate: '2027-04-25', startDate: '2026-11-16', idp: 'b' })`; 8 modifiche nello storico, nessun allenamento.

## Struttura

```
src/domain/     plan.ts, engine.ts, types.ts      logica pura portata 1:1 (nessun DOM, nessuna rete)
src/data/       db.ts (Dexie), store.ts, actions.ts, backup.ts, sync.ts, remote.ts (Supabase)
src/lib/        ics.ts, reminders.ts, format.ts, raceDate.ts
src/ext/        activityImport.ts, aiCoach.ts     punti di estensione, solo interfacce
src/ui/         cornice, componenti, una vista per schermata
src/sw.ts       service worker (precache + promemoria)
tests/domain/   Vitest: parità con reference/src, recovery, scenari, una regola = almeno un test
tests/data/     Vitest: azioni, backup, sincronizzazione con un remoto finto, .ics, cambio data
tests/e2e/      Playwright: flussi principali, offline, installabilità
supabase/       schema.sql
```

Scelte tecniche dentro i paletti del prompt:

- **Dominio**: `plan.js` ed `engine.js` tradotti riga per riga in TypeScript. Oltre ai test scritti a mano, un test di parità esegue il codice originale di `reference/src` e il port sugli stessi input (stagione simulata) e confronta i risultati.
- **Stato**: uno store in memoria con la stessa forma del prototipo (`core`, `plan`, `workouts`, `checkins`, `changes`, `versions`); ogni scrittura va in IndexedDB (tabella `docs`) e nella coda (`outbox`) nella stessa transazione.
- **Sincronizzazione**: prima si scarica (documenti con `updated_at` successivo all'ultimo allineamento), poi si svuota la coda. Conflitto sullo stesso documento: vince la scrittura più recente. La logica è scritta contro un'interfaccia (`RemoteDocs`); l'adattatore Supabase è l'unico punto che parla con la rete.
- **Routing**: `react-router-dom`, URL veri (`/`, `/calendario`, `/registra`, `/analisi/:id`, `/progressi`, `/obiettivi`, `/coach`, `/guida`, `/profilo`, `/altro`).
- **Caratteri**: Barlow e Barlow Condensed inclusi nell'app (pacchetti `@fontsource`), non più da Google Fonts: servono offline e non c'è un servizio esterno in più.

## Fasi

| Fase | Contenuto | Fatto quando |
|---|---|---|
| 0 | Lettura, test di riferimento, questo piano | elenco dubbi e richieste |
| 1 | Dominio in TypeScript con test | Vitest riproduce `recovery.js` e gli scenari di `logic.js` |
| 2 | App locale su IndexedDB, importazione del backup | flusso completo con i dati importati |
| 3 | PWA: manifest, icone, service worker | installabile; in modalità aereo si apre e salva |
| 4 | Account e sincronizzazione Supabase | telefono → computer; offline → online |
| 5 | `.ics`, promemoria locali, cambio data di gara | — |
| 6 | Build, variabili d'ambiente, deploy, README | — |

## Dubbi (con la scelta che adotto se non mi dici altro)

1. **`updated_at` impostato dal server.** Con la tabella così com'è l'orario lo scrive il dispositivo: se telefono e computer hanno orologi diversi, lo scaricamento "più recente dell'ultimo allineamento" può saltare delle righe. Propongo di aggiungere allo schema un trigger che imposta `updated_at = now()` a ogni scrittura (la tabella resta identica). L'app funziona anche senza, con quel limite. *In attesa della tua risposta lo metto in `supabase/schema.sql` come blocco separato e commentato.*
2. **Versione 1 del piano.** `core.versions` nel backup elenca la versione 1 (inizio 9 novembre), ma il formato di esportazione non contiene le sessioni delle versioni: dopo l'importazione quella versione compare nello storico ma non è ripristinabile ("Versione non disponibile su questo dispositivo", come nel prototipo). Vuoi che il backup esportato includa anche le versioni (un campo in più, facoltativo in importazione)? *Per ora: formato identico al prototipo, senza versioni.*
3. **Promemoria senza server.** Una web app non può programmare una notifica a orario se è chiusa. Quello che si può fare davvero: notifica alla prima apertura della giornata e mentre l'app è aperta; in più, su Android con l'app installata, un controllo in background quando il sistema lo concede (orario non garantito). Su iPhone le notifiche esistono solo con l'app aggiunta alla Home (iOS 16.4+) e solo ad app aperta. *Lo realizzo così e lo scrivo nei Limiti.*
4. **Cambio della data di gara.** Regola che adotto: le sessioni future ancora pianificate vengono sostituite da quelle dello schema riallineato all'indietro dalla nuova data; restano com'erano quelle passate, fatte, saltate e quelle aggiunte da te. Le modifiche del coach su sessioni future non ancora corse si perdono (restano nello storico e nella copia del piano). È una modifica come le altre: valore precedente, valore nuovo, copia del piano, annullabile.
5. **Primo accesso su un dispositivo che ha già dati.** Se sia il dispositivo sia l'account hanno un piano e sono diversi, l'app chiede quale tenere invece di decidere da sola; gli allenamenti presenti da una sola parte vengono comunque conservati.
6. **Pulsanti da 44 px.** Nel prototipo alcuni controlli sono più bassi (pulsanti piccoli 38 px, link 32 px): li porto a 44 px.
7. **Testi non più veri.** La sezione "Limiti" del Profilo dice "Non è installabile" e "niente notifiche": la aggiorno a quello che l'app fa davvero. È l'unico punto in cui cambio testi del prototipo, più le etichette delle funzioni nuove (Account, Gara, Promemoria, Calendario esterno), tenute a una o due parole.
8. **Lighthouse.** Dalla versione 12 Lighthouse non ha più la categoria PWA. Verifico con Lighthouse 11 e con il controllo di installabilità di Chrome (`Page.getInstallabilityErrors`).
9. **Accesso.** Nessuna schermata di login obbligatoria: l'app funziona senza account e l'accesso sta in una scheda "Account" nel Profilo (e nella schermata iniziale, per chi apre un secondo dispositivo).

## Cosa mi serve da te

- URL e chiave pubblica (anon) del progetto Supabase, quando l'hai creato. Senza, la fase 4 resta provata solo contro un remoto finto e contro Postgres locale (schema e regole di accesso), non contro Supabase vero.
- Hosting: Vercel, Netlify o Cloudflare Pages, e con quale account.
- Conferma di nome breve e icona (uso "Madrid 27" e la linea blu su fondo asfalto).
- Risposta ai dubbi 1 e 2.
