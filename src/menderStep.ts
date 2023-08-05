import { BufferWriter } from 'typed-binary';

import { GBuffer } from './gBuffer';
import { SceneSchema } from './schema/scene';
import menderWGSL from './shaders/mender.wgsl?raw';
import { Model3 } from './model3';
import { NetworkLayer } from './networkLayer';

export class MenderStep {
  private _pipeline: GPURenderPipeline;
  private _passDescriptor: GPURenderPassDescriptor;
  private _passColorAttachment: GPURenderPassColorAttachment;

  private _bindGroup: GPUBindGroup;
  private conv1: NetworkLayer;
  private conv2: NetworkLayer;
  private conv3: NetworkLayer;

  constructor(
    device: GPUDevice,
    presentationFormat: GPUTextureFormat,
    gBuffer: GBuffer,
  ) {
    this._passColorAttachment = {
      // view is acquired and set in render loop.
      view: undefined as unknown as GPUTextureView,

      clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      loadOp: 'clear',
      storeOp: 'store',
    };

    this._passDescriptor = {
      colorAttachments: [this._passColorAttachment],
    };

    //
    // Weights & Biases
    //

    this.conv1 = new NetworkLayer(device, Model3.Conv1Weight, Model3.Conv1Bias);
    this.conv2 = new NetworkLayer(device, Model3.Conv2Weight, Model3.Conv2Bias);
    this.conv3 = new NetworkLayer(device, Model3.Conv3Weight, Model3.Conv3Bias);

    //
    // SCENE
    //

    const scene = {
      canvasSize: [gBuffer.size[0], gBuffer.size[1]] as [number, number],
    };

    const sceneUniformBuffer = device.createBuffer({
      size: 2 * 4 /* vec2<i32> */,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Eagerly filling the buffer
    const sceneUniformData = new ArrayBuffer(SceneSchema.sizeOf(scene));
    const bufferWriter = new BufferWriter(sceneUniformData);
    SceneSchema.write(bufferWriter, scene);

    device.queue.writeBuffer(
      sceneUniformBuffer,
      0,
      sceneUniformData,
      0,
      sceneUniformData.byteLength,
    );

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'unfilterable-float',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'unfilterable-float',
          },
        },
      ],
    });

    const shaderModule = device.createShaderModule({
      code: menderWGSL,
    });

    this._pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout, this.conv1.bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: 'main_vert',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'main_frag',
        targets: [
          {
            format: presentationFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this._bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: sceneUniformBuffer },
        },
        {
          binding: 1,
          resource: gBuffer.blurredAndAlbedoView,
        },
        {
          binding: 2,
          resource: gBuffer.normalsAndDepthView,
        },
      ],
    });
  }

  getPassDescriptor(context: GPUCanvasContext) {
    const textureView = context.getCurrentTexture().createView();
    this._passColorAttachment.view = textureView;

    return this._passDescriptor;
  }

  perform(ctx: GPUCanvasContext, commandEncoder: GPUCommandEncoder) {
    const pass = commandEncoder.beginRenderPass(this.getPassDescriptor(ctx));
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, this._bindGroup);
    pass.setBindGroup(1, this.conv1.bindGroup);
    pass.setBindGroup(2, this.conv2.bindGroup);
    pass.setBindGroup(3, this.conv3.bindGroup);
    pass.draw(6);
    pass.end();
  }
}
