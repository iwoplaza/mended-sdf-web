import { atomWithStorage } from 'jotai/utils';

export type DisplayMode = 'mended' | 'traditional' | 'g-buffer' | 'blur-diff';

export const displayModeAtom = atomWithStorage<DisplayMode>(
  'DISPLAY_MODE',
  'mended',
);
