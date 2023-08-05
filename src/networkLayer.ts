export class NetworkLayer {
  bindGroupLayout: GPUBindGroupLayout;
  weightBuffer: GPUBuffer;
  biasBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;

  constructor(device: GPUDevice, weightData: Float32Array, biasData: Float32Array) {
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'read-only-storage',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ]
    });

    this.weightBuffer = device.createBuffer({
      size: weightData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    {
      const mapping = new Float32Array(this.weightBuffer.getMappedRange());
      mapping.set(weightData);
      this.weightBuffer.unmap();
    }

    this.biasBuffer = device.createBuffer({
      size: biasData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    {
      const mapping = new Float32Array(this.biasBuffer.getMappedRange());
      mapping.set(biasData);
      this.biasBuffer.unmap();
    }

    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.weightBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.biasBuffer },
        },
      ],
    });
  }
}