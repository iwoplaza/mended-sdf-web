import { wgsl } from 'typegpu';
import { clamp01 } from './macros';

export const lineSegment2 = wgsl.fn(
  'sdf_line_segment2',
)`(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = ${clamp01('dot(pa, ba)/dot(ba,ba)')};
  return length(pa - ba*h);
}`;

export const lineSegment3 = wgsl.fn(
  'sdf_line_segment3',
)`(p: vec3f, a: vec3f, b: vec3f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = ${clamp01('dot(pa, ba)/dot(ba,ba)')};
  return length(pa - ba*h);
}`;
