import { wgsl } from 'wigsill';

export const sphere = wgsl.fn(
  'sdf_sphere',
)`(pos: vec3f, o: vec3f, r: f32) -> f32 {
  return distance(pos, o) - r;
}`;

export const circle = wgsl.fn(
  'sdf_circle',
)`(pos: vec2f, o: vec2f, r: f32) -> f32 {
  return distance(pos, o) - r;
}`;
