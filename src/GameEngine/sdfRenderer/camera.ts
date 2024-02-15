import { mat4, vec3 } from 'wgpu-matrix';

export class Camera {
  public gpuBuffer: GPUBuffer;

  constructor(private device: GPUDevice) {
    this.gpuBuffer = device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  update() {
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

    const invViewMatrix = mat4.translation(
      vec3.fromValues(Math.abs(Math.sin(rad * 2) * 0.2), 0, 0),
    ) as Float32Array;

    // Writing to buffer

    this.device.queue.writeBuffer(
      this.gpuBuffer,
      0,
      invViewMatrix.buffer,
      invViewMatrix.byteOffset,
      invViewMatrix.byteLength,
    );
  }

  dispose() {
    this.gpuBuffer.destroy();
  }
}
