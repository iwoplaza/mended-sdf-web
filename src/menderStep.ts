import { vec2f } from 'typegpu/data/index';
import { type Wgsl, wgsl, type TypeGpuRuntime, builtin } from 'typegpu';

import { Model7 } from './model7';
import type { GBuffer } from './gBuffer';
import { NetworkLayer } from './networkLayer';
import { fullScreenQuadVertexShader } from './shaders/fullScreenQuad';
import { convertRgbToY } from './GameEngine/sdfRenderer/colorUtils';
import { convolveFn } from './GameEngine/convolve';

const blockDim = 8;

const FIRST_DEPTH = 8;
const SECOND_DEPTH = 8;

type Options = {
  runtime: TypeGpuRuntime;
  gBuffer: GBuffer;
  targetTexture: () => GPUTextureView;
};

const rgbToYcbcrMatrix = wgsl.constant(`mat3x3f(
   0.299,     0.587,     0.114,
  -0.168736, -0.331264,  0.5,
   0.5,      -0.418688, -0.081312,
)`);

const ycbcrToRgbMatrix = wgsl.constant(`mat3x3f(
  1.0,  0,         1.402,
  1.0, -0.344136, -0.714136,
  1.0,  1.772,     0,
)`);

const canvasSizeBuffer = wgsl
  .buffer(vec2f)
  .$name('canvas_size')
  .$allowUniform();
const canvasSizeUniform = canvasSizeBuffer.asUniform();

const kernelRadiusSlot = wgsl.slot<number>().$name('kernel_radius');
/**
 * Has to be divisible by 4
 */
const inChannelsSlot = wgsl.slot<number>().$name('in_channels');
const outChannelsSlot = wgsl.slot<number>().$name('out_channels');
const reluSlot = wgsl.slot<boolean>().$name('relu');
const inputFromGBufferSlot = wgsl.slot<boolean>().$name('input_from_gbuffer');
const weightCount = wgsl
  .constant(
    wgsl`${outChannelsSlot} * (2 * ${kernelRadiusSlot} + 1) * (2 * ${kernelRadiusSlot} + 1) * ${inChannelsSlot}`,
  )
  .$name('weight_count');
const BLOCK_SIZE = 8;
const TILE_PADDING = 4;

// const convolveLocalFn = wgsl.fn`(local: vec2u, result: ptr<function, array<f32, ${outChannelsSlot}>>) {
//   var weight_idx: u32 = 0;

//   for (var out_c: u32 = 0; out_c < ${outChannelsSlot}; out_c++) {
//     let result_channel = &(*result)[out_c];

//     for (var i: u32 = ${TILE_PADDING}-${kernelRadiusSlot}; i <= ${TILE_PADDING}+${kernelRadiusSlot}; i++) {
//       for (var j: u32 = ${TILE_PADDING}-${kernelRadiusSlot}; j <= ${TILE_PADDING}+${kernelRadiusSlot}; j++) {
//         let tile_slice = &(tile[local.x + i][local.y + j]);

//         for (var in_c: u32 = 0; in_c < ${inChannelsSlot} / 4; in_c++) {
//           let some = tile[local.x + i][local.y + j][in_c];
//           (*result_channel) += dot((*tile_slice)[in_c], conv_weights[weight_idx]);
//           // (*result_channel) = conv_weights[weight_idx].x * f32(i * j) / 10.0;
//           weight_idx++;
//         }
//       }
//     }
//   }
// }`;

const sampleGlobal =
  wgsl.fn`(x: i32, y: i32, result: ptr<function, array<vec4f, ${inChannelsSlot} / 4>>) {
  let coord = vec2u(
    u32(max(0, min(x, i32(${canvasSizeUniform}.x) - 1))),
    u32(max(0, min(y, i32(${canvasSizeUniform}.y) - 1))),
  );

  if (${inputFromGBufferSlot}) {
    let blurred = textureLoad(
      blurred_tex,
      coord,
      0
    );

    var aux = textureLoad(
      aux_tex,
      coord,
      0
    );

    (*result)[0] = vec4f(
      ${convertRgbToY}(blurred.rgb),
      aux.z, // albedo luminance
      aux.x, // normal.x
      aux.y, // normal.y
    );
    (*result)[1] = vec4f(
      aux.w, // emission luminance
      0,     // zero padding
      0,     // zero padding
      0,     // zero padding
    );
  }
  else {
    for (var i: u32 = 0; i < ${inChannelsSlot} / 4; i++) {
      let index =
        (coord.y * u32(${canvasSizeUniform}.x) +
        coord.x) * ${inChannelsSlot}/4 +
        i;
      
      (*result)[i] = input_buffer[index];
    }
  }
}`.$name('sample_global');

const applyReLU = wgsl.fn`
  (result: ptr<function, array<f32, ${outChannelsSlot}>>) {
    for (var i = 0u; i < ${outChannelsSlot}; i++) {
      (*result)[i] = max(0, (*result)[i]);
    }
  }
`.$name('apply_relu');

const menderConvolveFn = convolveFn({
  inChannels: inChannelsSlot,
  outChannels: outChannelsSlot,
  kernelRadius: kernelRadiusSlot,
  sampleFiller: (x: Wgsl, y: Wgsl, outSamplePtr: Wgsl) =>
    wgsl`${sampleGlobal}(${x}, ${y}, ${outSamplePtr});`,
  kernelReader: (idx: Wgsl) => wgsl`conv_weights[${idx}]`,
});

const convolveMainFn = wgsl.fn`(coord: vec3<u32>) {
  var result = conv_bias;

  ${menderConvolveFn}(coord.xy, &result);

  if (${reluSlot}) {
    ${applyReLU}(&result);
  }

  let output_buffer_begin =
    (coord.y * u32(${canvasSizeUniform}.x) +
    coord.x) * ${outChannelsSlot};

  for (var i: u32 = 0; i < ${outChannelsSlot}; i++) {
    output_buffer[output_buffer_begin + i] = result[i];
  }
}`;

const combineFn = wgsl.fn`(coord_f: vec4f) -> vec4f {
  var coord = vec2u(floor(coord_f.xy));

  let blurred = textureLoad(
    blurred_texture,
    coord,
    0
  );

  let blurred_ycbcr = blurred.rgb * ${rgbToYcbcrMatrix};

  let buffer_idx = coord.y * u32(${canvasSizeUniform}.x) + coord.x;
  let mended_lumi = mendedBuffer[buffer_idx];

  let combined_ycbcr = vec3f(
    blurred_ycbcr.r + mended_lumi, // Y
    blurred_ycbcr.g, // Cb
    blurred_ycbcr.b, // Cr
  );

  let combined = combined_ycbcr * ${ycbcrToRgbMatrix};

  return vec4f(combined, 1.0);
}`;

export const MenderStep = ({ runtime, gBuffer, targetTexture }: Options) => {
  const device = runtime.device;
  // Textures

  const firstWorkBuffer = runtime.device.createBuffer({
    label: 'First Work Buffer',
    size:
      gBuffer.size[0] *
      gBuffer.size[1] *
      FIRST_DEPTH *
      Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  const secondWorkBuffer = runtime.device.createBuffer({
    label: 'Second Work Buffer',
    size:
      gBuffer.size[0] *
      gBuffer.size[1] *
      SECOND_DEPTH *
      Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  const mendedResultBuffer = runtime.device.createBuffer({
    label: 'Mender Result Buffer',
    size: gBuffer.size[0] * gBuffer.size[1] * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  //
  // Weights & Biases
  //

  const convLayers = [
    new NetworkLayer(device, Model7.Conv1Weight, Model7.Conv1Bias),
    new NetworkLayer(device, Model7.Conv2Weight, Model7.Conv2Bias),
    new NetworkLayer(device, Model7.Conv3Weight, Model7.Conv3Bias),
  ];

  const ioBindGroupLayout = device.createBindGroupLayout({
    label: 'Mender IO BindGroup Layout',
    entries: [
      // output_buffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'storage',
        },
      },
      // input_buffer
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // blurred_tex
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: 'unfilterable-float',
        },
      },
      // aux_tex
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: 'unfilterable-float',
        },
      },
    ],
  });

  const makeLayerPipeline = (options: {
    label: string;
    kernelRadius: number;
    inChannels: number;
    outChannels: number;
    relu: boolean;
    inputFromGBuffer: boolean;
    layout: GPUBindGroupLayout;
  }) => {
    const pipeline = runtime.makeComputePipeline({
      workgroupSize: [BLOCK_SIZE, BLOCK_SIZE],
      code: wgsl`
        ${wgsl.declare`@group(0) @binding(0) var<storage, read_write> output_buffer: array<f32>;`}
        ${wgsl.declare`@group(0) @binding(1) var<storage, read> input_buffer: array<vec4f>;`}
        ${wgsl.declare`@group(0) @binding(2) var blurred_tex: texture_2d<f32>;`}
        ${wgsl.declare`@group(0) @binding(3) var aux_tex: texture_2d<f32>;`}

        ${wgsl.declare`@group(1) @binding(0) var<storage, read> conv_weights: array<vec4f, ${weightCount} / 4>;`}
        ${wgsl.declare`@group(1) @binding(1) var<storage, read> conv_bias: array<f32, ${outChannelsSlot}>;`}
        ${wgsl.declare`
          // BLOCK_SIZExBLOCK_SIZE tile extended by 4 pixel padding to accommodate the 9x9 kernel.
          // Layout: Width x Height x Channel
          var<workgroup> tile: array<array<array<vec4f, ${inChannelsSlot} / 4>, ${BLOCK_SIZE} + ${TILE_PADDING} * 2>, ${BLOCK_SIZE} + ${TILE_PADDING} * 2>;
        `}

        ${convolveMainFn}(${builtin.globalInvocationId});
      `
        // filling slots
        .with(kernelRadiusSlot, options.kernelRadius)
        .with(inChannelsSlot, options.inChannels)
        .with(outChannelsSlot, options.outChannels)
        .with(reluSlot, options.relu)
        .with(inputFromGBufferSlot, options.inputFromGBuffer),
      // ---
      label: options.label,
      externalLayouts: [ioBindGroupLayout, options.layout],
    });

    return pipeline;
  };

  const pipelines = [
    makeLayerPipeline({
      label: 'Layer #1 Pipeline',
      kernelRadius: 4,
      inChannels: 8,
      outChannels: FIRST_DEPTH,
      relu: true,
      inputFromGBuffer: true,
      layout: convLayers[0].bindGroupLayout,
    }),
    makeLayerPipeline({
      label: 'Layer #2 Pipeline',
      kernelRadius: 2,
      inChannels: FIRST_DEPTH,
      outChannels: SECOND_DEPTH,
      relu: true,
      inputFromGBuffer: false,
      layout: convLayers[1].bindGroupLayout,
    }),
    makeLayerPipeline({
      label: 'Layer #3 Pipeline',
      kernelRadius: 2,
      inChannels: SECOND_DEPTH,
      outChannels: 1,
      relu: false,
      inputFromGBuffer: false,
      layout: convLayers[2].bindGroupLayout,
    }),
  ];

  const ioBindGroups = [
    device.createBindGroup({
      label: 'Layer #1 IO BindGroup',
      layout: ioBindGroupLayout,
      entries: [
        // blurred_tex
        {
          binding: 2,
          resource: gBuffer.upscaledView,
        },
        // aux_tex
        {
          binding: 3,
          resource: gBuffer.auxView,
        },
        // output_buffer
        {
          binding: 0,
          resource: {
            buffer: firstWorkBuffer,
          },
        },

        // UNUSED input_buffer
        {
          binding: 1,
          resource: { buffer: secondWorkBuffer },
        },
      ],
    }),
    device.createBindGroup({
      label: 'Layer #2 IO BindGroup',
      layout: ioBindGroupLayout,
      entries: [
        // input_buffer
        {
          binding: 1,
          resource: {
            buffer: firstWorkBuffer,
          },
        },
        // output_buffer
        {
          binding: 0,
          resource: {
            buffer: secondWorkBuffer,
          },
        },

        // UNUSED blurred_tex
        {
          binding: 2,
          resource: gBuffer.upscaledView,
        },
        // UNUSED aux_tex
        {
          binding: 3,
          resource: gBuffer.auxView,
        },
      ],
    }),
    device.createBindGroup({
      label: 'Layer #3 IO BindGroup',
      layout: ioBindGroupLayout,
      entries: [
        // input_buffer
        {
          binding: 1,
          resource: {
            buffer: secondWorkBuffer,
          },
        },
        // output_buffer
        {
          binding: 0,
          resource: {
            buffer: mendedResultBuffer,
          },
        },

        // UNUSED blurred_tex
        {
          binding: 2,
          resource: gBuffer.upscaledView,
        },
        // UNUSED aux_tex
        {
          binding: 3,
          resource: gBuffer.auxView,
        },
      ],
    }),
  ];

  // ---
  // Combination pass
  // ---

  const combinationBindGroupLayout = device.createBindGroupLayout({
    label: 'Combination Pipeline - bind group layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'read-only-storage',
        },
      },
    ],
  });

  const combinationPipeline = runtime.makeRenderPipeline({
    label: 'Combination Pipeline',
    vertex: fullScreenQuadVertexShader,
    fragment: {
      code: wgsl`
        ${wgsl.declare`@group(0) @binding(0) var blurred_texture: texture_2d<f32>;`}
        ${wgsl.declare`@group(0) @binding(1) var<storage, read> mendedBuffer: array<f32>;`}

        let coord_f = ${builtin.position};
        return ${combineFn}(coord_f);
      `,
      target: [{ format: 'rgba8unorm' }],
    },
    primitive: { topology: 'triangle-list' },
    externalLayouts: [combinationBindGroupLayout],
  });

  const combinationBindGroup = device.createBindGroup({
    layout: combinationBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: gBuffer.upscaledView,
      },
      {
        binding: 1,
        resource: {
          buffer: mendedResultBuffer,
        },
      },
    ],
  });

  runtime.writeBuffer(canvasSizeBuffer, gBuffer.size);

  return {
    perform() {
      for (let i = 0; i < 3; ++i) {
        pipelines[i].execute({
          workgroups: [
            Math.ceil(gBuffer.size[0] / blockDim),
            Math.ceil(gBuffer.size[1] / blockDim),
          ],
          externalBindGroups: [ioBindGroups[i], convLayers[i].bindGroup],
        });
      }

      // Combining the convolved result with the initial blurry render

      combinationPipeline.execute({
        vertexCount: 6,
        colorAttachments: [
          {
            view: targetTexture(),

            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        externalBindGroups: [combinationBindGroup],
      });
    },
  };
};
