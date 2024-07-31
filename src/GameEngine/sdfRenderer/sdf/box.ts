import { wgsl } from 'typegpu';

export const box2 = wgsl.fn('box2')`(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}`;

export const box3 = wgsl.fn('box3')`(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0., 0., 0.))) + min(max(q.x, max(q.y, q.z)), 0.0);
}`;
