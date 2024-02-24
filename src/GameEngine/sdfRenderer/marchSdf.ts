import { WGSLFunction, f32, ptr, struct, u32, vec3f, wgsl } from 'wigsill';
import worldSdf, { FAR, ShapeContext } from './worldSdf';

export const MarchResult = struct({
  steps: u32,
  position: vec3f,
});

export const march = (
  distThresholdFn: WGSLFunction<[typeof ShapeContext], typeof f32>,
) =>
  wgsl.fun([vec3f, u32, ptr(ShapeContext), ptr(MarchResult)])(
    (pos, limit, ctx, out) => wgsl`
    var pos = ${pos};
    var prev_dist = -1.;
    var min_dist = ${FAR};
  
    var step = 0u;
    var progress = 0.;
  
    for (; step <= ${limit}; step++) {
      pos = ${pos} + (*${ctx}).ray_dir * progress;
      min_dist = ${worldSdf}(pos);
  
      // Inside volume?
      if (min_dist <= 0.) {
        // No need to check more objects.
        break;
      }
  
      if (min_dist < ${distThresholdFn(
        wgsl`*${ctx}`,
      )} && min_dist < prev_dist) {
        // No need to check more objects.
        break;
      }
  
      // march forward safely
      progress += min_dist;
      (*${ctx}).ray_distance += min_dist;
  
      if (progress > ${FAR}) {
        // Stop checking.
        break;
      }
  
      prev_dist = min_dist;
    }
  
    (*${out}).position = pos;
  
    // Not near surface or distance rising?
    if (min_dist > ${distThresholdFn(
      wgsl`*${ctx}`,
    )} * 2. || min_dist > prev_dist) {
      // Sky
      (*${out}).steps = MAX_STEPS + 1u;
      return;
    }
  
    (*${out}).steps = step;
  `,
  );
