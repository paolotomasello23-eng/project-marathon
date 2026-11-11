import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const BACKUP = path.resolve('reference/data/backup.json');

/** Apre l'app in una data fissata (il tempo poi scorre) e importa il backup di riferimento. */
export async function start(page: Page, day = '2026-11-17', time = '08:00:00'): Promise<void> {
  await page.clock.install({ time: new Date(day + 'T' + time + '+01:00') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crea il piano' })).toBeVisible();
  await page.setInputFiles('#imp-file', BACKUP);
  await expect(page.getByText('161 sessioni, 0 allenamenti')).toBeVisible();
  await page.getByRole('button', { name: 'Ripristina questo backup' }).click();
  await expect(page.getByRole('heading', { name: 'Oggi', level: 1 })).toBeVisible();
}
export const toast = (page: Page, text: string | RegExp) => expect(page.locator('#toast').getByText(text).first()).toBeVisible();
export const tab = (page: Page, name: string) => page.locator('#tabs').getByRole('link', { name }).click();
/** Riga di un giorno nella vista settimanale (es. "gio", 19). */
export const dayRow = (page: Page, n: number) => page.locator('.day').filter({ has: page.locator('.dt b', { hasText: new RegExp('^' + n + '$') }) });
