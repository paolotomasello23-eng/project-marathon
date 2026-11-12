/* Un archivio locale per account. Sullo stesso dispositivo i dati di due account non si mescolano mai:
   ogni account ha il proprio database IndexedDB e l'app apre quello dell'account in uso.
   Il primo archivio (quello usato prima di qualunque accesso) resta dell'account che vi si collega per primo. */
import { DB_NAME } from './db';

const CUR = 'madrid27.db', MAP = 'madrid27.dbs';

function read(): Record<string, string> { try { return JSON.parse(localStorage.getItem(MAP) || '{}') as Record<string, string>; } catch { return {}; } }
/** Nome dell'archivio locale da aprire all'avvio. */
export function currentDbName(): string { try { return localStorage.getItem(CUR) || DB_NAME; } catch { return DB_NAME; } }
/** Ricorda che questo archivio appartiene a questo account. */
export function rememberOwner(userId: string, name: string): void {
  try { const m = read(); if (m[userId] !== name) { m[userId] = name; localStorage.setItem(MAP, JSON.stringify(m)); } } catch { /* archivio non scrivibile */ }
}
export function dbFor(userId: string): string { return read()[userId] || DB_NAME + '-' + userId; }
/**
 * Passa all'archivio locale di un altro account e ricarica l'app. I dati dell'account precedente restano sul
 * dispositivo, intatti, e tornano quando quell'account rientra. false = non c'è nulla da cambiare.
 */
export function switchAccount(userId: string): boolean {
  const name = dbFor(userId);
  if (name === currentDbName()) return false;
  try { rememberOwner(userId, name); localStorage.setItem(CUR, name); } catch { return false; }
  window.location.reload();
  return true;
}
