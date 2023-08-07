import { mat4 } from 'wgpu-matrix';

import renderMeshGBufferWGSL from './shaders/renderMeshGBuffer.wgsl?raw';
import { Camera } from './camera';
import { GBuffer } from './gBuffer';
import { StanfordDragon } from './models/stanfordDragon';
import { store } from './store';
import { projectionMatrixAtom } from './projection';

const vertexBufferLayouts: Iterable<GPUVertexBufferLayout> = [
  {
    arrayStride: Float32Array.BYTES_PER_ELEMENT * 8,
    attributes: [
      {
        // position
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3',
      },
      {
        // normal
        shaderLocation: 1,
        offset: Float32Array.BYTES_PER_ELEMENT * 3,
        format: 'float32x3',
      },
      {
        // uv
        shaderLocation: 2,
        offset: Float32Array.BYTES_PER_ELEMENT * 6,
        format: 'float32x2',
      },
    ],
  },
];

export class GBufferMeshRenderer {
  writePipeline: GPURenderPipeline;
  passDescriptor: GPURenderPassDescriptor;
  sceneUniformBindGroup: GPUBindGroup;

  camera: Camera;
  dragon: StanfordDragon;

  cameraUniformBuffer: GPUBuffer;

  constructor(device: GPUDevice, private gBuffer: GBuffer) {
    this.camera = new Camera();
    this.dragon = new StanfordDragon(device);

    const depthTexture = device.createTexture({
      size: [gBuffer.size[0], gBuffer.size[1]],
      format: 'depth16unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.passDescriptor = {
      colorAttachments: [
        {
          view: gBuffer.blurredView,

          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: gBuffer.auxView,

          clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthTexture.createView(),

        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };

    const writeGBufferShader = device.createShaderModule({
      label: 'Mesh Renderer',
      code: renderMeshGBufferWGSL,
    });

    this.writePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: writeGBufferShader,
        entryPoint: 'main_vert',
        buffers: vertexBufferLayouts,
      },
      fragment: {
        module: writeGBufferShader,
        entryPoint: 'main_frag',
        targets: [
          // albedo
          { format: 'rgba8unorm' },
          // normal
          { format: 'rgba16float' },
        ],
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth16unorm',
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    });

    const modelUniformBuffer = device.createBuffer({
      size: 4 * 16 * 2, // two 4x4 matrix
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const projectionUniformBuffer = device.createBuffer({
      size: 4 * 16, // one 4x4 matrix
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const projectionMatrix = store.get(projectionMatrixAtom) as Float32Array;
    device.queue.writeBuffer(
      projectionUniformBuffer,
      0,
      projectionMatrix.buffer,
      projectionMatrix.byteOffset,
      projectionMatrix.byteLength,
    );

    this.cameraUniformBuffer = device.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sceneUniformBindGroup = device.createBindGroup({
      layout: this.writePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: modelUniformBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: projectionUniformBuffer,
          },
        },
        {
          binding: 2,
          resource: {
            buffer: this.cameraUniformBuffer,
          },
        },
      ],
    });

    //
    // Scene matrices
    //

    // Move the model so it's centered.
    const modelMatrix = mat4.translation([0, -45, 0]);

    const modelData = modelMatrix as Float32Array;
    device.queue.writeBuffer(
      modelUniformBuffer,
      0,
      modelData.buffer,
      modelData.byteOffset,
      modelData.byteLength,
    );
    const invertTransposeModelMatrix = mat4.invert(modelMatrix);
    mat4.transpose(invertTransposeModelMatrix, invertTransposeModelMatrix);
    const normalModelData = invertTransposeModelMatrix as Float32Array;
    device.queue.writeBuffer(
      modelUniformBuffer,
      64,
      normalModelData.buffer,
      normalModelData.byteOffset,
      normalModelData.byteLength,
    );
  }

  perform(device: GPUDevice, commandEncoder: GPUCommandEncoder) {
    this.camera.writeToBuffer(device, this.cameraUniformBuffer, 0);

    // Write position, normal, albedo etc. data to gBuffers
    const gBufferPass = commandEncoder.beginRenderPass(this.passDescriptor);
    gBufferPass.setPipeline(this.writePipeline);
    gBufferPass.setBindGroup(0, this.sceneUniformBindGroup);

    this.dragon.draw(gBufferPass);

    gBufferPass.end();
  }
}
