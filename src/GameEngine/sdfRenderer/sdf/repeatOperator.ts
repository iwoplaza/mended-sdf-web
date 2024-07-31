import { wgsl } from 'typegpu';

export const repeatXYZ = wgsl.fn(
  'op_repeat_xyz',
)`(pos: vec3f, tile_size: vec3f) -> vec3f {
  return round(pos / tile_size) * tile_size;
}`;

export const repeatXZ = wgsl.fn(
  'op_repeat_xz',
)`(pos: vec3f, tile_size: vec2f) -> vec3f {
  let chunk_pos = round(pos.xz / tile_size) * tile_size;
  return vec3f(chunk_pos.x, 0, chunk_pos.y);
}`;
