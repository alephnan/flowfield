import type { ColormapId, RenderSettings } from '../types';

export const palettes: Array<{ id: ColormapId; name: string; colors: string }> = [
  { id: 'inferno', name: 'Inferno', colors: '#000004, #420a68, #932667, #dd513a, #fca50a, #fcffa4' },
  { id: 'viridis', name: 'Viridis', colors: '#440154, #414487, #2a788e, #22a884, #7ad151, #fde725' },
  { id: 'turbo', name: 'Turbo', colors: '#30123b, #466be3, #1bcfd4, #a4fc3c, #faba39, #e4450a, #7a0403' },
  { id: 'twocolor', name: 'Two-color', colors: '' },
];

export function paletteGradient(settings: RenderSettings, id = settings.colormap): string {
  const colors = id === 'twocolor' ? `${settings.colorA}, ${settings.colorB}` : palettes.find(p => p.id === id)!.colors;
  return `linear-gradient(90deg, ${colors})`;
}

export const colorLabels = { speed: 'Movement speed', position: 'Distance from center', age: 'Particle age' } as const;
