import { mat4, vec3 } from 'wgpu-matrix';
import { wgsl, type TypeGpuRuntime } from 'typegpu';
import { mat4f, struct } from 'typegpu/data';
import { RenderTargetHeight, RenderTargetWidth } from './worldSdf';
import { store } from '@/store';
import {
  autoRotateControlAtom,
  cameraOrientationControlAtom,
} from '@/controlAtoms';

export const CameraStruct = struct({
  view_matrix: mat4f,
  inv_view_matrix: mat4f,
}).$name('CameraStruct');

export const cameraBuffer = wgsl
  .buffer(CameraStruct)
  .$name('Main Camera')
  .$allowUniform();

export const cameraUniform = cameraBuffer.asUniform();

export const constructRayPos = wgsl.fn`() -> vec3f {
  return (${cameraUniform}.inv_view_matrix * vec4(0., 0., 0., 1.)).xyz;
}`.$name('construct_ray_pos');

export const constructRayDir = wgsl.fn`(coord: vec2f) -> vec3f {
  let viewport_size = vec2f(${RenderTargetWidth}, ${RenderTargetHeight});
  var view_coords = (coord - viewport_size / 2.) / ${RenderTargetHeight};

  var view_ray_dir = vec3f(
    view_coords,
    -1.,
  );
  view_ray_dir.y *= -1.;
  view_ray_dir = normalize(view_ray_dir);

  return (${cameraUniform}.inv_view_matrix * vec4(view_ray_dir, 0.)).xyz;
}`.$name('construct_ray_dir');

export class Camera {
  update(runtime: TypeGpuRuntime) {
    const origin = vec3.fromValues(0, 0, 1);
    const eyePosition = vec3.fromValues(0, 0, 0);
    // const upVector = vec3.fromValues(0, 1, 0);

    // const rad = 2.5;
    const rad = store.get(autoRotateControlAtom)
      ? Math.PI * (Date.now() / 5000)
      : (store.get(cameraOrientationControlAtom) / 180) * Math.PI;
    const rotation = mat4.rotateY(mat4.translation(origin), rad);
    vec3.transformMat4(eyePosition, rotation, eyePosition);

    const invViewMatrix = mat4.identity();

    // transforming the camera

    mat4.translate(invViewMatrix, vec3.fromValues(0, 0, -2), invViewMatrix);
    mat4.rotateY(invViewMatrix, rad, invViewMatrix);
    mat4.translate(invViewMatrix, vec3.fromValues(0, 0, 2), invViewMatrix);

    // calculating the 'regular' view matrix

    const viewMatrix = mat4.inverse(invViewMatrix);

    // Writing to buffer
    runtime.writeBuffer(cameraBuffer, {
      view_matrix: [...viewMatrix.values()],
      inv_view_matrix: [...invViewMatrix.values()],
    });
  }
}
