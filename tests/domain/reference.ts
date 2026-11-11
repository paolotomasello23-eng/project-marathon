/* Carica il codice originale del prototipo (CommonJS) per i test di parità. */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RP: any = require('../../reference/src/plan.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RE: any = require('../../reference/src/engine.js');
