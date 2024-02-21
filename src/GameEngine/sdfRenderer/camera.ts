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

    const rad = Math.PI * (Date.now() / 5000);
    const rotation = mat4.rotateY(mat4.translation(origin), rad);
    vec3.transformMat4(eyePosition, rotation, eyePosition);

    // const viewMatrix = mat4.lookAt(
    //   eyePosition,
    //   origin,
    //   upVector,
    // ) as Float32Array;

    // const invViewMatrix = mat4.inverse(viewMatrix) as Float32Array;

    const invViewMatrix = [
      ...mat4
        .translation(vec3.fromValues(Math.abs(Math.sin(rad * 2) * 0.2), 0, 0))
        .values(),
    ];

    // const invViewMatrix = [...mat4.identity().values()];

    // Writing to buffer
    this.memory.write(runtime, { inv_view_matrix: invViewMatrix });
  }
}
