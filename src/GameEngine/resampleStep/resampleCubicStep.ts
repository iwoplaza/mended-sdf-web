import { fullScreenQuadVertexShader } from '@/shaders/fullScreenQuad';
import { wgsl, type TypeGpuRuntime } from 'typegpu';
import { struct, vec2i, vec2f } from 'typegpu/data';

const Canvas = struct({
  size: vec2i,
  e_x: vec2f, // texel size in x direction
  e_y: vec2f, // texel size in y direction
});

const canvasBuffer = wgsl.buffer(Canvas).$name('canvas').$allowUniform();
const canvasUniform = canvasBuffer.asUniform();

/**
 * Implementation based on:
 * https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering
 */
const resampleCubic = wgsl.fn`(uv: vec2f) -> vec4f {
  // calc filter texture coordinates where [0,1] is a single texel
  // (can be done in vertex program instead)
  let coord_hg = uv * vec2f(${canvasUniform}.size) - vec2f(0.5f, 0.5f);      // fetch offsets and weights from filter texture
  var hg_x = textureSample(tex_hg, smplr, coord_hg.x).xyz;
  var hg_y = textureSample(tex_hg, smplr, coord_hg.y).xyz;      // determine linear sampling coordinates
  var coord_source10 = uv + hg_x.x * ${canvasUniform}.e_x;
  var coord_source00 = uv - hg_x.y * ${canvasUniform}.e_x;
  var coord_source11 = coord_source10 + hg_y.x * ${canvasUniform}.e_y;
  var coord_source01 = coord_source00 + hg_y.x * ${canvasUniform}.e_y;
  coord_source10 = coord_source10 - hg_y.y * ${canvasUniform}.e_y;
  coord_source00 = coord_source00 - hg_y.y * ${canvasUniform}.e_y;      // fetch four linearly interpolated inputs
  var tex_source00 = textureSample(texture, clamping_smplr, coord_source00);
  var tex_source10 = textureSample(texture, clamping_smplr, coord_source10);
  var tex_source01 = textureSample(texture, clamping_smplr, coord_source01);
  var tex_source11 = textureSample(texture, clamping_smplr, coord_source11);      // weight along y direction
  tex_source00 = mix(tex_source00, tex_source01, hg_y.z);
  tex_source10 = mix(tex_source10, tex_source11, hg_y.z);      // weight along x direction
  tex_source00 = mix(tex_source00, tex_source10, hg_x.z);
  
  return tex_source00;
  // Doing linear interpolation for now.
  // return textureSample(texture, clamping_smplr, uv);
}`;

/**
 * Lookup texture of `h` and `g` functions defined in https://developer.nvidia.com/gpugems/gpugems2/part-iii-high-quality-rendering/chapter-20-fast-third-order-texture-filtering.
 * @param device
 * @param samples How frequently to sample the continuum. According to the source material, 128 is enough.
 */
const HGLookupTexture = (runtime: TypeGpuRuntime, samples = 128) => {
  const textureData = new Uint8Array(samples * 4);

  const texture = runtime.device.createTexture({
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

  runtime.device.queue.writeTexture(
    { texture },
    textureData,
    { bytesPerRow: samples * 4 },
    { width: samples },
  );

  return texture;
};

type Options = {
  runtime: TypeGpuRuntime;
  targetFormat: GPUTextureFormat;
  sourceTexture: () => GPUTextureView;
  targetTexture: GPUTextureView;
  sourceSize: [number, number];
};

export const ResampleStep = ({
  runtime,
  targetFormat,
  sourceTexture,
  targetTexture,
  sourceSize,
}: Options) => {
  const hgLookupTexture = HGLookupTexture(runtime);

  const externalBindGroupLayout = runtime.device.createBindGroupLayout({
    label: 'Resample - external bind group layout',
    entries: [
      // wrapping_sampler
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {
          type: 'filtering',
        },
      },
      // clamping_sampler
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {
          type: 'filtering',
        },
      },
      // texture
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          viewDimension: '2d',
          sampleType: 'float',
        },
      },
      // tex_hg
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          viewDimension: '1d',
          sampleType: 'float',
        },
      },
    ],
  });

  const wrappingSampler = runtime.device.createSampler({
    label: 'Resample - Wrapping Sampler',
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    addressModeW: 'repeat',
  });

  const clampingSampler = runtime.device.createSampler({
    label: 'Resample - Clamping Sampler',
    minFilter: 'linear',
    magFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });

  const pipeline = runtime.makeRenderPipeline({
    label: 'Resample Pipeline',
    primitive: { topology: 'triangle-list' },
    vertex: fullScreenQuadVertexShader,
    fragment: {
      code: wgsl`
        ${wgsl.declare`@group(0) @binding(0) var smplr: sampler;`}
        ${wgsl.declare`@group(0) @binding(1) var clamping_smplr: sampler;`}
        ${wgsl.declare`@group(0) @binding(2) var texture: texture_2d<f32>; // source texture`}
        ${wgsl.declare`@group(0) @binding(3) var tex_hg: texture_1d<f32>;  // filter offsets and weights`}

        return ${resampleCubic}(vUV);
      `,
      target: [{ format: targetFormat }],
    },
    externalLayouts: [externalBindGroupLayout],
  });

  const passColorAttachment: GPURenderPassColorAttachment = {
    view: targetTexture,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };

  const canvas = {
    size: sourceSize,
    e_x: [1 / sourceSize[0], 0] as [number, number],
    e_y: [0, 1 / sourceSize[1]] as [number, number],
  };

  const hgLookupView = hgLookupTexture.createView();

  return {
    perform() {
      const externalBindGroup = runtime.device.createBindGroup({
        layout: externalBindGroupLayout,
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
            resource: sourceTexture(),
          },
          {
            binding: 3,
            resource: hgLookupView,
          },
        ],
      });

      runtime.writeBuffer(canvasBuffer, canvas);
      pipeline.execute({
        vertexCount: 6,
        colorAttachments: [passColorAttachment],
        externalBindGroups: [externalBindGroup],
      });
    },
  };
};
