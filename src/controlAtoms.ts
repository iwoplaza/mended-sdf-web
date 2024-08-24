import { atomWithStorage } from 'jotai/utils';

export const DisplayModes = [
  { key: 'mended', label: 'Mended' },
  { key: 'traditional', label: 'Traditional' },
  { key: 'g-buffer', label: 'G-Buffer' },
  { key: 'blur-diff', label: 'Blur Diff' },
] as const;

export type DisplayMode = (typeof DisplayModes)[number]['key'];

export const cameraOrientationControlAtom = atomWithStorage(
  'CAMERA_ORIENTATION',
  0,
);

export const autoRotateControlAtom = atomWithStorage('AUTO_ROTATE', true);

export const targetResolutionAtom = atomWithStorage('TARGET_RESOLUTION', 256);

export const displayModeAtom = atomWithStorage<DisplayMode>(
  'DISPLAY_MODE',
  'mended',
);
