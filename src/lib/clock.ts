import { iso } from '../domain/plan';
import type { Iso } from '../domain/types';

/** Data di oggi nel fuso del dispositivo. */
export function today(): Iso { return iso(new Date()); }
export function nowISO(): string { return new Date().toISOString(); }
export function uid(p: string): string { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
