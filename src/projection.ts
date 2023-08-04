import { atom } from 'jotai';
import { mat4 } from 'wgpu-matrix';

export const canvasAspectRatioAtom = atom(1);

export const projectionMatrixAtom = atom((get) => {
  const aspect = get(canvasAspectRatioAtom);
  return mat4.perspective((2 * Math.PI) / 5, aspect, 1, 2000.0);
});
