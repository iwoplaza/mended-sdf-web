import { mat4, vec3 } from 'wgpu-matrix';
import { WGSLMemory, WGSLRuntime, mat4f, struct } from 'wigsill';

export const CameraStruct = struct({
  inv_view_matrix: mat4f,
}).alias('CameraStruct');

export class Camera {
  constructor(private readonly memory: WGSLMemory<typeof CameraStruct>) {}

  update(runtime: WGSLRuntime) {
    const origin = vec3.fromValues(0, 0, 1);
    const eyePosition = vec3.fromValues(0, 0, 0);
    // const upVector = vec3.fromValues(0, 1, 0);

    // const rad = 2.5;
    const rad = Math.PI * (Date.now() / 5000);
    const rotation = mat4.rotateY(mat4.translation(origin), rad);
    vec3.transformMat4(eyePosition, rotation, eyePosition);

    const invViewMatrix = mat4.identity();

    mat4.translate(invViewMatrix, vec3.fromValues(0, 0, -2), invViewMatrix);
    mat4.rotateY(invViewMatrix, rad, invViewMatrix);
    mat4.translate(invViewMatrix, vec3.fromValues(0, 0, 2), invViewMatrix);

    // Writing to buffer
    this.memory.write(runtime, {
      inv_view_matrix: [...invViewMatrix.values()],
    });
  }
}
