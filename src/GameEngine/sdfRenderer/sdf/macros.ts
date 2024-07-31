import { wgsl, type Wgsl } from 'typegpu';

export const dd = (code: Wgsl) => wgsl`dot(${code}, ${code})`;
export const clamp01 = (inner: Wgsl) => wgsl`max(0., min(${inner}, 1.))`;
export const union = (values: Wgsl[]) => {
  if (values.length === 1) {
    return values[0];
  }

  return wgsl`${values.map((v, idx) =>
    idx < values.length - 1 ? wgsl`min(${v}, ` : wgsl`(${v}`,
  )}${values.map(() => ')')}`;
};
