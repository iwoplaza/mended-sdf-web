import writeGBufferWGSL from './shaders/writeGBuffer.wgsl?raw';

import { GBuffer } from './gBuffer';

export class GBufferStep {
  writePipeline: GPURenderPipeline;
  passDescriptor: GPURenderPassDescriptor;

  constructor(device: GPUDevice, private gBuffer: GBuffer) {
    // const bindGroupLayout = device.createBindGroupLayout({
    //   entries: [
    //     {
    //       binding: 0,
    //       visibility: GPUShaderStage.FRAGMENT,
    //       buffer: {
    //         type: 'storage',
    //       },
    //     },
    //   ],
    // });

    const writeGBufferShader = device.createShaderModule({
      label: 'Rendering to GBuffer',
      code: writeGBufferWGSL,
    });

    this.writePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: writeGBufferShader,
        entryPoint: 'main_vert',
      },
      fragment: {
        module: writeGBufferShader,
        entryPoint: 'main_frag',
        targets: gBuffer.targets,
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.passDescriptor = {
      colorAttachments: [
        {
          view: gBuffer.blurredView,

          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
        {
          view: gBuffer.auxView,

          clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 0.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
  }

  perform(commandEncoder: GPUCommandEncoder) {
    // Write position, normal, albedo etc. data to gBuffers
    const gBufferPass = commandEncoder.beginRenderPass(this.passDescriptor);
    gBufferPass.setPipeline(this.writePipeline);
    // gBufferPass.setBindGroup(0, sceneUniformBindGroup);
    // gBufferPass.setVertexBuffer(0, vertexBuffer);
    // gBufferPass.setIndexBuffer(indexBuffer, 'uint16');
    gBufferPass.draw(6, 1);
    gBufferPass.end();
  }
}
