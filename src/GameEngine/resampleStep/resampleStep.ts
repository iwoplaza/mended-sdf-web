import { BufferWriter, object } from 'typed-binary';

import { Vec2f32, Vec2i32 } from '../../schema/primitive';
import fullScreenQuadWGSL from '../../shaders/fullScreenQuad.wgsl?raw';
import resampleWGSL from './resample.wgsl?raw';

const CanvasSchema = object({
  size: Vec2i32,
  e_x: Vec2f32, // texel size in x direction
  e_y: Vec2f32, // texel size in y direction
});

/**
 * Lookup texture of `h` and `g` functions defined in https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering.
 * @param device
 * @param samples How frequently to sample the continuum. According to the source material, 128 is enough.
 */
const HGLookupTexture = (device: GPUDevice, samples = 128) => {
  const textureData = new Uint8Array(samples * 4);

  const texture = device.createTexture({
    label: 'HG Lookup Texture',
    format: 'rgba8unorm',
    size: [samples],
    dimension: '1d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });

  // Generating lookup data
  for (let i = 0; i < samples; ++i) {
    const x = i / samples;

    const x2 = x ** 2;
    const x3 = x ** 3;
    const w0 = (1 / 6) * (-x3 + 3 * x2 - 3 * x + 1);
    const w1 = (1 / 6) * (3 * x3 - 6 * x2 + 4);
    const w2 = (1 / 6) * (-3 * x3 + 3 * x2 + 3 * x + 1);
    const w3 = (1 / 6) * x3;

    // h0
    textureData[i * 4 + 0] = Math.floor((1 - w1 / (w0 + w1) + x) * 255);
    // h1
    textureData[i * 4 + 1] = Math.floor((1 + w3 / (w2 + w3) - x) * 255);
    // g0
    textureData[i * 4 + 2] = Math.floor((w0 + w1) * 255);
    // g1
    textureData[i * 4 + 3] = Math.floor((w2 + w3) * 255);
  }

  device.queue.writeTexture(
    { texture },
    textureData,
    { bytesPerRow: samples * 4 },
    { width: samples },
  );

  return texture;
};

type Options = {
  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  sourceTexture: GPUTextureView;
  targetTexture: GPUTextureView;
  sourceSize: [number, number];
};

export const ResampleStep = ({
  device,
  targetFormat,
  sourceTexture,
  targetTexture,
  sourceSize,
}: Options) => {
  const hgLookupTexture = HGLookupTexture(device);

  const wrappingSampler = device.createSampler({
    label: 'Resample - Wrapping Sampler',
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    addressModeW: 'repeat',
  });

  const clampingSampler = device.createSampler({
    label: 'Resample - Clamping Sampler',
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
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

  const canvas = {
    size: sourceSize,
    e_x: [1 / sourceSize[0], 0] as [number, number],
    e_y: [0, 1 / sourceSize[1]] as [number, number],
  };

  const canvasBuffer = device.createBuffer({
    size: CanvasSchema.sizeOf(canvas),
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });
  {
    const writer = new BufferWriter(canvasBuffer.getMappedRange());
    CanvasSchema.write(writer, canvas);
    canvasBuffer.unmap();
  }

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: wrappingSampler,
      },
      {
        binding: 1,
        resource: clampingSampler,
      },
      {
        binding: 2,
        resource: sourceTexture,
      },
      {
        binding: 3,
        resource: hgLookupTexture.createView(),
      },
    ],
  });

  const canvasBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: canvasBuffer,
        },
      },
    ],
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      const pass = commandEncoder.beginRenderPass(passDescriptor);
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setBindGroup(1, canvasBindGroup);
      pass.draw(6);
      pass.end();
    },
  };
};
