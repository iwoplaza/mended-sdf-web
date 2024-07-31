import { arrayOf, struct, u32, vec3f } from 'typegpu';
import type { Parsed } from 'typed-binary';

export enum MarchDomainKind {
  AABB = 0,
  PLANE = 1,
}

export const MAX_DOMAINS = 64;

export type MarchDomainStruct = Parsed<typeof MarchDomainStruct>;
export const MarchDomainStruct = struct({
  kind: u32,
  pos: vec3f,
  extra: vec3f, // radius or normal
});
export const MarchDomainArray = arrayOf(MarchDomainStruct, MAX_DOMAINS);
