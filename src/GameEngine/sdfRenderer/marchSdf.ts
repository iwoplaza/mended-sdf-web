import wgsl, { type WgslFn } from 'typegpu';
import { struct, u32, vec3f } from 'typegpu/data';
import worldSdf, { FAR, ShapeContext } from './worldSdf';

export const MAX_STEPS = 500;

export const MarchResult = struct({
  steps: u32,
  position: vec3f,
});

export const march = (
  distThresholdFn: WgslFn,
) =>
  wgsl.fn()`(ctx: ptr<function, ${ShapeContext}>, limit: u32, out: ptr<function, ${MarchResult}>) {
    var pos = (*ctx).ray_pos;
    var prev_dist = -1.;
    var min_dist = ${FAR};
  
    var step = 0u;
    var progress = 0.;
  
    for (; step <= limit; step++) {
      pos = (*ctx).ray_pos + (*ctx).ray_dir * progress;
      min_dist = ${worldSdf}(pos);
  
      // Inside volume?
      if (min_dist <= 0.) {
        // No need to check more objects.
        break;
      }
  
      if (min_dist < ${distThresholdFn}(*ctx) && min_dist < prev_dist) {
        // No need to check more objects.
        break;
      }
  
      // march forward safely
      progress += min_dist;
      (*ctx).ray_distance += min_dist;
  
      if (progress > ${FAR}) {
        // Stop checking.
        break;
      }
  
      prev_dist = min_dist;
    }
  
    (*out).position = pos;
  
    // Not near surface or distance rising?
    if (min_dist > ${distThresholdFn}(*ctx) * 2. || min_dist > prev_dist) {
      // Sky
      (*out).steps = ${MAX_STEPS} + 1u;
      return;
    }
  
    (*out).steps = step;
  }`;
