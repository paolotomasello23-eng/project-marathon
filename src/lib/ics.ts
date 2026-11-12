/* Esportazione del piano in formato iCalendar (.ics), da importare in Google Calendar o Apple Calendar.
   Un evento di giornata intera per ogni sessione, con ritmo, sforzo e schema nella descrizione. */
import * as P from '../domain/plan';
import type { Description, Iso, Session } from '../domain/types';

const enc = new TextEncoder();
/** Testo secondo RFC 5545: barra, punto e virgola, virgola e a capo vanno protetti. */
export function icsText(s: string): string { return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
/** Le righe non superano i 75 byte: quelle più lunghe continuano a capo con uno spazio davanti. */
export function icsFold(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length, max = out.length ? 74 : 75; // le righe di continuazione iniziano con uno spazio
    if (bytes + n > max) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const day = (d: Iso) => d.replace(/-/g, '');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

export function sessionSummary(s: Session): string { return P.title(s) + (s.km ? ' ' + P.nf(s.km) + ' km' : ''); }
export function sessionNotes(d: Description): string {
  const rows: string[] = [];
  if (d.pace) rows.push('Ritmo: ' + d.pace);
  if (d.intensity && d.intensity !== '—') rows.push('Sforzo: ' + d.intensity);
  if (d.structure) rows.push('Schema: ' + d.structure);
  if (d.dur) rows.push('Durata: ' + P.fmtDur(d.dur));
  if (d.goal) rows.push('Obiettivo: ' + d.goal);
  if (d.fuel) rows.push('Alimentazione: ' + d.fuel);
  return rows.join('\n');
}

/**
 * Calendario con le sessioni non di riposo e non saltate. `now` è l'istante dell'esportazione.
 * alarmHour: se indicata, ogni evento porta un avviso a quell'ora del giorno (0–23). È il modo per avere un
 * promemoria a orario su iPhone anche ad app chiusa: lo fa suonare l'app Calendario, non questa.
 */
export function planIcs(sessions: Session[], describe: (s: Session) => Description, now: Date, name = 'Madrid 27', alarmHour: number | null = null): string {
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Madrid 27//Piano di allenamento//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText(name)];
  sessions.filter(s => s.k !== 'rest' && s.st !== 'skipped').forEach(s => {
    const d = describe(s), notes = sessionNotes(d);
    L.push('BEGIN:VEVENT', 'UID:' + s.id + '@madrid27', 'DTSTAMP:' + stamp(now), 'DTSTART;VALUE=DATE:' + day(s.d), 'DTEND;VALUE=DATE:' + day(P.addDays(s.d, 1)), 'SUMMARY:' + icsText(sessionSummary(s)));
    if (notes) L.push('DESCRIPTION:' + icsText(notes));
    L.push('CATEGORIES:' + icsText(P.KIND_LABEL[s.k] || 'Allenamento'), 'TRANSP:TRANSPARENT');
    // l'evento dura tutto il giorno e inizia a mezzanotte: l'avviso scatta alarmHour ore dopo
    if (alarmHour != null) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(sessionSummary(s)), 'TRIGGER:' + (alarmHour > 0 ? 'PT' + Math.round(alarmHour) + 'H' : 'PT0S'), 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
