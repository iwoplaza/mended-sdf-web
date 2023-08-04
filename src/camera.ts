import { mat4, vec3 } from 'wgpu-matrix';
import { projectionMatrixAtom } from './projection';
import { store } from './store';

type GPUPresence = {
  readonly maxBufferSize: number;
};

export class Camera implements GPUPresence {
  constructor() {}

  get maxBufferSize() {
    // Two 4x4 matrices, 4-byte elements
    return 2 * 16 * 4;
  }

  writeToBuffer(device: GPUDevice, buffer: GPUBuffer, offset: number) {
    const origin = vec3.fromValues(0, 0, 0);
    const eyePosition = vec3.fromValues(0, 50, -100);
    const upVector = vec3.fromValues(0, 1, 0);

    const rad = Math.PI * (Date.now() / 5000);
    const rotation = mat4.rotateY(mat4.translation(origin), rad);
    vec3.transformMat4(eyePosition, rotation, eyePosition);

    const viewMatrix = mat4.inverse(mat4.lookAt(eyePosition, origin, upVector));
    const projMatrix = store.get(projectionMatrixAtom);

    const viewProjMatrix = mat4.multiply(
      projMatrix,
      viewMatrix,
    ) as Float32Array;

    // Writing to buffer

    device.queue.writeBuffer(
      buffer,
      offset,
      viewProjMatrix.buffer,
      viewProjMatrix.byteOffset,
      viewProjMatrix.byteLength,
    );

    const cameraInvViewProj = mat4.invert(viewProjMatrix) as Float32Array;
    device.queue.writeBuffer(
      buffer,
      offset + 64,
      cameraInvViewProj.buffer,
      cameraInvViewProj.byteOffset,
      cameraInvViewProj.byteLength,
    );
  }
}
