import { f32, vec2f, vec3f, wgsl } from 'wigsill';

// prettier-ignore
export const sphere = wgsl.fun([vec3f, vec3f, f32], f32)(
  (pos, origin, radius) => wgsl`
    return distance(${pos}, ${origin}) - ${radius};
`);

// prettier-ignore
export const circle = wgsl.fun([vec2f, vec2f, f32], f32)(
  (pos, origin, radius) => wgsl`
    return distance(${pos}, ${origin}) - ${radius};
`);
