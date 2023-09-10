import { Parsed, object, u32 } from 'typed-binary';
import { Vec3f32, pad } from '../../schema/primitive';

export enum MarchDomainKind {
  AABB = 0,
  PLANE = 1,
}

export type MarchDomainStruct = Parsed<typeof MarchDomainStruct>;
export const MarchDomainStruct = object({
  kind: u32,
  _: pad(4 * 3),
  pos: Vec3f32,
  __: pad(4 * 1),
  extra: Vec3f32, // radius or normal
  ___: pad(4 * 1),
});
