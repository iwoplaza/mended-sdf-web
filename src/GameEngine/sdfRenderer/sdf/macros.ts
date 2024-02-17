import { wgsl, WGSLSegment } from 'wigsill';

export const dd = (code: WGSLSegment) => wgsl`dot(${code}, ${code})`;
export const clamp01 = (inner: WGSLSegment) => wgsl`max(0., min(${inner}, 1.))`;
export const union = (values: WGSLSegment[]) => {
  if (values.length === 1) {
    return values[0];
  }

  return wgsl`${values.map((v, idx) =>
    idx < values.length - 1 ? wgsl`min(${v}, ` : wgsl`(${v}`,
  )}${values.map(() => `)`)}`;
};
