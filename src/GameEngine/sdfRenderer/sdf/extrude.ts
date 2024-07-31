import { wgsl } from 'typegpu';

export const extrude = wgsl.fn(
  'op_extrude',
)`(dxy: f32, dz: f32, h: f32) -> f32 {
  let w = vec2f(dxy, abs(dz) - h);
  return min(max(w.x,w.y),0.0) + length(max(w, vec2f(0., 0.)));
}`;
