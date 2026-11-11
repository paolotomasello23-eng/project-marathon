import type { ReactNode } from 'react';
import { Head } from '../bits';
import { useApp } from '../ctx';

function G({ t, children }: { t: string; children: ReactNode }) { return <details className="grp"><summary>{t}</summary><div className="body prose">{children}</div></details>; }

export default function Guida() {
  const { S } = useApp(), w = S.core!.profile.weight;
  const kg = (a: number, b?: number) => w ? ' (' + Math.round(a * w) + (b ? '–' + Math.round(b * w) : '') + ' g)' : '';
  return <>
    <Head title="Guida" />
    <div className="stack" style={{ gap: 10 }}>
      <G t="Prima di correre"><ul><li>Sotto 60–75 minuti facili: niente di particolare.</li><li>Qualità e lunghi: carboidrati 2–3 ore prima, 1–3 g per kg{kg(1, 3)}, pochi grassi e fibre.</li><li>Di mattina presto: banana o pane e miele 30–45 minuti prima.</li></ul></G>
      <G t="Gel e carboidrati"><ul><li>Fino a 75 minuti: solo acqua.</li><li>75–150 minuti: 30–60 g l’ora.</li><li>Oltre 150 minuti e in gara: 60 g l’ora (fino a 90 solo se allenato).</li><li>Un gel vale 22–25 g: uno ogni 25–30 minuti, con acqua.</li><li>Lo stomaco si allena: aumenta poco alla volta, stessi prodotti della gara.</li></ul></G>
      <G t="Acqua e sali"><ul><li>400–700 ml l’ora, di più con il caldo.</li><li>Oltre 90 minuti: 300–600 mg di sodio l’ora.</li><li>Pesati prima e dopo un lungo: oltre il 2% in meno hai bevuto poco.</li></ul></G>
      <G t="Dopo"><ul><li>Entro 1–2 ore: carboidrati (1 g per kg{kg(1)}) e 20–30 g di proteine.</li><li>Nella giornata 1,4–1,8 g di proteine per kg{kg(1.4, 1.8)}.</li><li>Dopo i lunghi oltre 26 km: il giorno dopo niente corsa.</li></ul></G>
      <G t="Sonno"><ul><li>7–9 ore per notte.</li><li>Tre notti storte di fila: alleggerisci.</li><li>Segnali: battito a riposo alto per giorni, gambe pesanti nelle corse facili, sonno disturbato.</li></ul></G>
      <G t="Quando fermarsi"><ul><li>Dolore su un osso o un tendine, che peggiora correndo o cambia l’appoggio.</li><li>Gonfiore, dolore di notte o che dura oltre 48–72 ore.</li><li>Dolore al petto, capogiri, fiato corto anomalo: fermati e chiama un medico.</li><li>Febbre: niente allenamento.</li></ul><p>La app riduce il carico ma non fa diagnosi.</p></G>
      <G t="Percorso di Madrid"><ul><li>Circa 400 m di salita. Partenza a 700 m (Castellana), arrivo a 630 m (Recoletos).</li><li>Km 0–3: leggera salita. Poi quasi 4 km di discesa: non strafare.</li><li>Fino a metà: strappi brevi e sottopassi.</li><li>Km 21–37: Calle Princesa in salita, poi Casa de Campo ondulata.</li><li>Dal km 37: salita quasi continua. Conta lo sforzo, non il ritmo.</li><li>Prima onda alle 8:45: orario e data 2027 da riconfermare sul sito ufficiale.</li></ul></G>
      <G t="Gara"><ul><li>Ultimi 2–3 giorni: 8–10 g di carboidrati per kg al giorno{kg(8, 10)}, poche fibre, niente di nuovo.</li><li>Colazione 3 ore prima, quella provata nei lunghi.</li><li>Un gel ogni 25–30 minuti dal km 5, acqua a ogni ristoro.</li><li>Caffeina solo se già provata.</li><li>Parti 5–10 secondi al km più piano: si decide dopo il km 30.</li></ul></G>
      <p className="tiny">Indicazioni generali, non mediche.</p>
    </div>
  </>;
}
