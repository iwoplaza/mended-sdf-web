import { wgsl } from 'wigsill';

/**
 * @returns 2d coordinates
 */
export const revolveX = wgsl.fn('revolve_x')`(p: vec3f, offset: f32) -> vec2f {
  return vec2(p.x, length(p.yz) - offset);
}`;

/**
 * @returns 2d coordinates
 */
export const revolveY = wgsl.fn('revolve_y')`(p: vec3f, offset: f32) -> vec2f {
  return vec2(length(p.xz) - offset, p.y);
}`;

/**
 * @returns 2d coordinates
 */
export const revolveZ = wgsl.fn('revolve_z')`(p: vec3f, offset: f32) -> vec2f {
  return vec2(p.z, length(p.xy) - offset);
}`;

// export function revolveX(p: [number, number, number], offset: number) {
//   const [x, y, z] = p;
//   return [x, vec2.len([y, z]) - offset];
// }

// export function revolveY(p: [number, number, number], offset: number) {
//   const [x, y, z] = p;
//   return [vec2.len([x, z]) - offset, y];
// }

// export function revolveZ(p: [number, number, number], offset: number) {
//   const [x, y, z] = p;
//   return [z, vec2.len([x, y]) - offset];
// }
