import fullScreenQuadWGSL from '../../shaders/fullScreenQuad.wgsl?raw';
import blipDifferenceWGSL from './blipDifference.wgsl?raw';

type Options = {
  device: GPUDevice;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  textures: [GPUTextureView, GPUTextureView];
};

export const BlipDifferenceStep = ({
  device,
  context,
  presentationFormat,
  textures,
}: Options) => {
  const LABEL_BASE = `Blip Difference`;

  const fullScreenQuadShader = device.createShaderModule({
    label: `${LABEL_BASE} - Full Screen Quad Shader`,
    code: fullScreenQuadWGSL,
  });

  const blipDifferenceShader = device.createShaderModule({
    label: `${LABEL_BASE} - Shader`,
    code: blipDifferenceWGSL,
  });

  const pipeline = device.createRenderPipeline({
    label: `${LABEL_BASE} - Pipeline`,
    layout: 'auto',
    vertex: {
      module: fullScreenQuadShader,
      entryPoint: 'main',
    },
    fragment: {
      module: blipDifferenceShader,
      entryPoint: 'main',
      targets: [{ format: presentationFormat }],
    },
  });

  const passColorAttachment: GPURenderPassColorAttachment = {
    // view is acquired and set in render loop.
    view: undefined as unknown as GPUTextureView,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };

  const passDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [passColorAttachment],
  };

  const bindGroup = device.createBindGroup({
    label: `${LABEL_BASE} - Bind Group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: textures[0],
      },
      {
        binding: 1,
        resource: textures[1],
      },
    ],
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      // Updating color attachment
      const textureView = context.getCurrentTexture().createView();
      passColorAttachment.view = textureView;

      const pass = commandEncoder.beginRenderPass(passDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
    },
  };
};
