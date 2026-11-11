/* Formati di data e numeri usati dalle viste (dal prototipo, app1.js). */
import * as P from '../domain/plan';
import { MO, WD } from '../domain/engine';
import type { Iso } from '../domain/types';

export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export function dlong(s: Iso): string { const d = P.parse(s); return WD[P.dow(s)] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
export function dfull(s: Iso): string { const d = P.parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
export function dstamp(isoTime: string): string { const d = new Date(isoTime); return d.getDate() + ' ' + MO[d.getMonth()] + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
export function cap1(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
/** Numero scritto dall'utente (virgola o punto). null = vuoto, NaN = non valido. */
export function num(v: unknown): number | null { if (v == null || String(v).trim() === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? NaN : n; }
export function parsePace(s: string): number { const m = /^\s*(\d{1,2})[:.,'](\d{1,2})\s*$/.exec(String(s)); if (!m) return NaN; return +m[1] * 60 + +m[2]; }
/** Tempo senza secondi: 4:07:05 → 4:07 */
export function hm(sec: number): string { return P.fmtTime(sec).replace(/:\d\d$/, ''); }
export function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }
