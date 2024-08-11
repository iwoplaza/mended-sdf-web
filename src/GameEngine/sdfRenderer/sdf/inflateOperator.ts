import { wgsl } from 'typegpu';

/**
 * Inflates the passed in field, and makes it rounded as
 * a side-effect.

 * @returns 3d sdf
 */
export const inflateWGSL = wgsl.fn`(d: f32, r: f32) -> f32 {
  return d - r;
}`.$name('op_inflate');

export function inflate(d: number, r: number) {
  return d - r;
}
