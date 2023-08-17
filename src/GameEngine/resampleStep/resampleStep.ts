import fullScreenQuadWGSL from '../../shaders/fullScreenQuad.wgsl?raw';
import resampleWGSL from './resample.wgsl?raw';

type Options = {
  device: GPUDevice;
  context: GPUCanvasContext;
  targetFormat: GPUTextureFormat;
  sourceTexture: GPUTextureView;
  targetTexture: GPUTextureView;
};

export const ResampleStep = ({
  device,
  targetFormat,
  sourceTexture,
  targetTexture,
}: Options) => {
  const sampler = device.createSampler({
    label: 'Resample - Sampler',
    minFilter: 'linear',
    magFilter: 'linear',
  });

  const fullScreenQuadShader = device.createShaderModule({
    label: 'Resample - Full Screen Quad Shader',
    code: fullScreenQuadWGSL,
  });

  const resampleShader = device.createShaderModule({
    label: 'Resample - Resample Shader',
    code: resampleWGSL,
  });

  const pipeline = device.createRenderPipeline({
    label: 'Resample Pipeline',
    layout: 'auto',
    vertex: {
      module: fullScreenQuadShader,
      entryPoint: 'main',
    },
    fragment: {
      module: resampleShader,
      entryPoint: 'main',
      targets: [{ format: targetFormat }],
    },
  });

  const passColorAttachment: GPURenderPassColorAttachment = {
    view: targetTexture,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };

  const passDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [passColorAttachment],
  };

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: sourceTexture,
      },
      {
        binding: 1,
        resource: sampler,
      },
    ],
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      const pass = commandEncoder.beginRenderPass(passDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
      pass.end();
    },
  };
};
