import { atomWithStorage } from 'jotai/utils';

export type DisplayMode = 'mended' | 'traditional' | 'g-buffer';

export const displayModeAtom = atomWithStorage<DisplayMode>(
  'DISPLAY_MODE',
  'mended',
);

