import { mat3, mat4, vec3 } from 'wgpu-matrix';

type GPUPresence = {
  readonly maxBufferSize: number;
};

export class Camera implements GPUPresence {
  constructor() {}

  get maxBufferSize() {
    // 4x4 matrix, 3x3 matrix, 4-byte elements
    return 16 * 4 + 9 * 4;
  }

  writeToBuffer(device: GPUDevice, buffer: GPUBuffer, offset: number) {
    const origin = vec3.fromValues(0, 0, 0);
    const eyePosition = vec3.fromValues(0, 50, -100);
    const upVector = vec3.fromValues(0, 1, 0);

    const rad = Math.PI * (Date.now() / 5000);
    const rotation = mat4.rotateY(mat4.translation(origin), rad);
    vec3.transformMat4(eyePosition, rotation, eyePosition);

    const viewMatrix = mat4.lookAt(
      eyePosition,
      origin,
      upVector,
    ) as Float32Array;

    // Writing to buffer

    device.queue.writeBuffer(
      buffer,
      offset,
      viewMatrix.buffer,
      viewMatrix.byteOffset,
      viewMatrix.byteLength,
    );

    const normalViewMatrix = mat3.fromMat4(viewMatrix) as Float32Array;
    device.queue.writeBuffer(
      buffer,
      offset + 64,
      normalViewMatrix.buffer,
      normalViewMatrix.byteOffset,
      normalViewMatrix.byteLength,
    );
  }
}
