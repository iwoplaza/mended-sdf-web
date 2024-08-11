import { wgsl } from 'typegpu';

export const sphere = wgsl.fn`(pos: vec3f, origin: vec3f, radius: f32) -> f32 {
  return distance(pos, origin) - radius;
}`;

export const circle = wgsl.fn`(pos: vec2f, origin: vec2f, radius: f32) -> f32 {
  return distance(pos, origin) - radius;
}`;
