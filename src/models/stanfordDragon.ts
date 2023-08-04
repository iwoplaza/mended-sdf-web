import { mesh } from '../meshes/stanfordDragon';

export class StanfordDragon {
  vertexBuffer: GPUBuffer;
  indexCount: number;
  indexBuffer: GPUBuffer;

  constructor(device: GPUDevice) {
    // Create the model vertex buffer.
    const kVertexStride = 8;
    this.vertexBuffer = device.createBuffer({
      // position: vec3, normal: vec3, uv: vec2
      size:
        mesh.positions.length * kVertexStride * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    {
      const mapping = new Float32Array(this.vertexBuffer.getMappedRange());
      for (let i = 0; i < mesh.positions.length; ++i) {
        mapping.set(mesh.positions[i], kVertexStride * i);
        mapping.set(mesh.normals[i], kVertexStride * i + 3);
        mapping.set(mesh.uvs[i], kVertexStride * i + 6);
      }
      this.vertexBuffer.unmap();
    }

    // Create the model index buffer.
    this.indexCount = mesh.triangles.length * 3;
    this.indexBuffer = device.createBuffer({
      size: this.indexCount * Uint16Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.INDEX,
      mappedAtCreation: true,
    });
    {
      const mapping = new Uint16Array(this.indexBuffer.getMappedRange());
      for (let i = 0; i < mesh.triangles.length; ++i) {
        mapping.set(mesh.triangles[i], 3 * i);
      }
      this.indexBuffer.unmap();
    }
  }

  draw(pass: GPURenderPassEncoder) {
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.setIndexBuffer(this.indexBuffer, 'uint16');
    pass.drawIndexed(this.indexCount);
  }
}
