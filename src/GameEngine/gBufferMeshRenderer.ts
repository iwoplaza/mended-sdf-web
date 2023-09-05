import { mat4 } from 'wgpu-matrix';

import renderSampleSceneWGSL from '../shaders/renderSampleScene.wgsl?raw';
import { Camera } from '../camera';
import { GBuffer } from '../gBuffer';
import { StanfordDragon } from '../models/stanfordDragon';
import { store } from '../store';
import { projectionMatrixAtom } from '../projection';

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
  writeBlurredPipeline: GPURenderPipeline;
  writeAuxPipeline: GPURenderPipeline;
  passDescriptor: GPURenderPassDescriptor;
  auxPassDescriptor: GPURenderPassDescriptor;
  sceneUniformBindGroup: GPUBindGroup;

  camera: Camera;
  dragon: StanfordDragon;

  cameraUniformBuffer: GPUBuffer;

  constructor(device: GPUDevice, gBuffer: GBuffer) {
    this.camera = new Camera();
    this.dragon = new StanfordDragon(device);

    const depthTexture = device.createTexture({
      size: gBuffer.quarterSize,
      format: 'depth16unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const auxDepthTexture = device.createTexture({
      size: gBuffer.size,
      format: 'depth16unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.passDescriptor = {
      colorAttachments: [
        {
          view: gBuffer.quarterView,

          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
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

    this.auxPassDescriptor = {
      colorAttachments: [
        {
          view: gBuffer.auxView,

          clearValue: gBuffer.auxClearValue,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: auxDepthTexture.createView(),

        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };

    const renderSceneShader = device.createShaderModule({
      label: 'Mesh Renderer - Render Scene Shader',
      code: renderSampleSceneWGSL,
    });

    const commonPipelineOptions = {
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth16unorm',
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
      },
    } as const;

    const layout = device.createBindGroupLayout({
      label: 'GBuffer Mesh Renderer Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
          },
        },
      ],
    });

    this.writeBlurredPipeline = device.createRenderPipeline({
      ...commonPipelineOptions,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [layout],
      }),
      vertex: {
        module: renderSceneShader,
        entryPoint: 'main_vert',
        buffers: vertexBufferLayouts,
      },
      fragment: {
        module: renderSceneShader,
        entryPoint: 'main_frag',
        targets: [
          { format: 'rgba8unorm' },
        ],
      },
    });

    this.writeAuxPipeline = device.createRenderPipeline({
      ...commonPipelineOptions,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [layout],
      }),
      vertex: {
        module: renderSceneShader,
        entryPoint: 'main_vert',
        buffers: vertexBufferLayouts,
      },
      fragment: {
        module: renderSceneShader,
        entryPoint: 'main_aux',
        targets: [
          { format: 'rgba16float' },
        ],
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
      layout: this.writeBlurredPipeline.getBindGroupLayout(0),
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

    // Write quarter-resolution image to gBuffers
    const gBufferPass = commandEncoder.beginRenderPass(this.passDescriptor);
    gBufferPass.setPipeline(this.writeBlurredPipeline);
    gBufferPass.setBindGroup(0, this.sceneUniformBindGroup);

    this.dragon.draw(gBufferPass);

    gBufferPass.end();

    // Write position, normal, albedo etc. data to gBuffers
    const auxPass = commandEncoder.beginRenderPass(this.auxPassDescriptor);
    auxPass.setPipeline(this.writeAuxPipeline);
    auxPass.setBindGroup(0, this.sceneUniformBindGroup);

    this.dragon.draw(auxPass);

    auxPass.end();
  }
}
