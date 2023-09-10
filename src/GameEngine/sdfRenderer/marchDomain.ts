import { Parsed, object, u32 } from 'typed-binary';
import { Vec3f32, pad } from '../../schema/primitive';

export enum MarchDomainKind {
  AABB = 0,
  PLANE = 1,
}

export type MarchDomainStruct = Parsed<typeof MarchDomainStruct>;
export const MarchDomainStruct = object({
  kind: pad(u32, 16),
  pos: pad(Vec3f32, 16),
  extra: pad(Vec3f32, 16), // radius or normal
});
