import { wgsl } from 'typegpu';

export const PI = wgsl.constant(3.14159265359);
export const TWO_PI = wgsl.constant(6.28318530718);

export const ONES_3F = wgsl.constant(`vec3f(1., 1., 1.)`);
export const ZEROS_3F = wgsl.constant(`vec3f(0., 0., 0.)`);
