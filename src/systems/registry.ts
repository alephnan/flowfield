import type { SystemDefinition } from '../types';
import { lorenz } from './lorenz';
import { rossler } from './rossler';
import { aizawa } from './aizawa';
import { thomas } from './thomas';
import { halvorsen } from './halvorsen';
import { chen } from './chen';
import { dadras } from './dadras';
import { vanderpol } from './vanderpol';
import { duffing } from './duffing';

export const systems: SystemDefinition[] = [
  lorenz,
  rossler,
  aizawa,
  thomas,
  halvorsen,
  chen,
  dadras,
  vanderpol,
  duffing,
];

const byId = new Map(systems.map((s) => [s.id, s]));

export function getSystem(id: string): SystemDefinition {
  const sys = byId.get(id);
  if (!sys) throw new Error(`Unknown system: ${id}`);
  return sys;
}

export function hasSystem(id: string): boolean {
  return byId.has(id);
}

export const DEFAULT_SYSTEM_ID = 'aizawa';
