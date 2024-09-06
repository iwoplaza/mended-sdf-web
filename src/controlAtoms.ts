import { atomWithStorage } from 'jotai/utils';

export const DisplayModes = [
  { key: 'mended', label: 'Mended' },
  { key: 'traditional', label: 'Traditional' },
  { key: 'g-buffer', label: 'G-Buffer Split View' },
  { key: 'g-buffer-color', label: 'G-Buffer - Color' },
  { key: 'g-buffer-albedo', label: 'G-Buffer - Albedo' },
  { key: 'g-buffer-normal', label: 'G-Buffer - Normal' },
  { key: 'blur-diff', label: 'Blur Diff' },
] as const;

export type DisplayMode = (typeof DisplayModes)[number]['key'];

export const measurePerformanceAtom = atomWithStorage(
  'MEASURE_PERFORMANCE',
  false,
);

export const cameraOrientationControlAtom = atomWithStorage(
  'CAMERA_ORIENTATION',
  0,
);

export const cameraYControlAtom = atomWithStorage('CAMERA_Y', 0);

export const cameraZoomControlAtom = atomWithStorage('CAMERA_ZOOM', 2);

export const cameraFovControlAtom = atomWithStorage('CAMERA_FOV', 90);

export const autoRotateControlAtom = atomWithStorage('AUTO_ROTATE', true);

export const targetResolutionAtom = atomWithStorage('TARGET_RESOLUTION', 256);

export const displayModeAtom = atomWithStorage<DisplayMode>(
  'DISPLAY_MODE',
  'mended',
);
