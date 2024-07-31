import { wgsl } from 'typegpu';

/**
 * polynomial smooth min 2
 * Source: https://iquilezles.org/articles/smin/
 */
export const smin = wgsl.fn('op_smin_p')`(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h*h*k*(1.0/4.0);
}`;
