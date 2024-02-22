import { vec2f, wgsl } from 'wigsill';
import { PI, TWO_PI } from './mathConstants';

const randSeed = wgsl.var(vec2f).alias('rand_seed');

export const setupRandomSeed = wgsl.fn('setup_random_seed')`(coord: vec2f) {
  ${randSeed} = coord;
}`;

/**
 * Yoinked from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
export const rand01 = wgsl.fn('rand01')`() -> f32 {
  ${randSeed}.x = fract(cos(dot(${randSeed}, vec2<f32>(23.14077926, 232.61690225))) * 136.8168);
  ${randSeed}.y = fract(cos(dot(${randSeed}, vec2<f32>(54.47856553, 345.84153136))) * 534.7645);
  return ${randSeed}.y;
}`;

export const randInUnitCube = wgsl.fn('rand_in_unit_cube')`() -> vec3f {
  return vec3f(
    ${rand01}() * 2. - 1.,
    ${rand01}() * 2. - 1.,
    ${rand01}() * 2. - 1.,
  );
}`;

export const randInCircle = wgsl.fn('rand_in_circle')`() -> vec2f {
  let radius = sqrt(${rand01}());
  let angle = ${rand01}() * ${TWO_PI};

  return vec2f(
    cos(angle) * radius,
    sin(angle) * radius,
  );
}`;

export const randOnSphere = wgsl.fn('rand_on_sphere')`() -> vec3f {
  let z = 2. * ${rand01}() - 1.;
  let theta = ${TWO_PI} * ${rand01}() - ${PI};
  let x = sin(theta) * sqrt(1. - z*z);
  let y = cos(theta) * sqrt(1. - z*z);
  return vec3f(x, y, z);
}`;

export const randOnHemisphere = wgsl.fn(
  'rand_on_hemisphere',
)`(normal: vec3f) -> vec3f {
  let value = ${randOnSphere}();
  let alignment = dot(normal, value);

  return sign(alignment) * value;
}`;
