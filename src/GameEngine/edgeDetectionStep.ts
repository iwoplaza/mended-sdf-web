import { type Wgsl, wgsl, type TypeGpuRuntime } from 'typegpu';
import { i32, struct } from 'typegpu/data';

import type { GBuffer } from '../gBuffer';
import { SceneSchema } from '../schema/scene';
import { NetworkLayer } from '../networkLayer';
import { convolveFn } from './convolve';
import { convertRgbToY } from './sdfRenderer/colorUtils';

const blockDim = 8;

type Options = {
  runtime: TypeGpuRuntime;
  gBuffer: GBuffer;
  menderResultBuffer: GPUBuffer;
};

export const EdgeDetectionStep = ({
  runtime,
  gBuffer,
  menderResultBuffer,
}: Options) => {
  //
  // Weights & Biases
  //

  const noWorkBuffer = runtime.device.createBuffer({
    label: 'No Work Buffer',
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });

  const zeroInChannels = (firstVal: number) => {
    return [firstVal, 0, 0, 0, 0, 0, 0];
  };

  // edge detection in the Y direction
  const convLayer = new NetworkLayer(
    runtime.device,
    new Float32Array([
      ...zeroInChannels(-1),
      ...zeroInChannels(0),
      ...zeroInChannels(1),

      ...zeroInChannels(-1),
      ...zeroInChannels(0),
      ...zeroInChannels(1),

      ...zeroInChannels(-1),
      ...zeroInChannels(0),
      ...zeroInChannels(1),
    ]),
    new Float32Array([0]),
  );

  //
  // SCENE
  //

  const scene = {
    canvasSize: [gBuffer.size[0], gBuffer.size[1]] as [number, number],
  };

  const sceneUniformBuffer = device.createBuffer({
    size: SceneSchema.measure(scene).size,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });
  {
    const bufferWriter = new BufferWriter(sceneUniformBuffer.getMappedRange());
    SceneSchema.write(bufferWriter, scene);
    sceneUniformBuffer.unmap();
  }

  const uniformBindGroupLayout = device.createBindGroupLayout({
    label: 'Edge Detection Uniform BindGroup Layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'uniform',
        },
      },
    ],
  });

  const ioBindGroupLayout = device.createBindGroupLayout({
    label: 'Edge Detection IO BindGroup Layout',
    entries: [
      // outputBuffer
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'storage',
        },
      },
      // inputBuffer
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // blurredTex
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: 'unfilterable-float',
        },
      },
      // auxTex
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: 'unfilterable-float',
        },
      },
    ],
  });

  const canvasSizeBuffer = wgsl
    .buffer(struct({ x: i32, y: i32 }), {
      x: gBuffer.size[0],
      y: gBuffer.size[1],
    })
    .$name('canvas_size')
    .$allowUniform();

  const canvasSizeUniform = canvasSizeBuffer.asUniform();

  const sampleFn = wgsl.fn`(x: i32, y: i32, result: ptr<function, array<vec4f, 1>>) {
    let coord = vec2u(
      u32(max(0, min(x, i32(${canvasSizeUniform}.x) - 1))),
      u32(max(0, min(y, i32(${canvasSizeUniform}.y) - 1))),
    );
  
    let blurred = textureLoad(
      blurredTex,
      coord,
      0
    );

    (*result)[0] = vec4f(${convertRgbToY}(blurred.rgb), 0, 0, 0);
  }`;

  const edgeConvolveFn = convolveFn({
    inChannels: 4,
    outChannels: 1,
    kernelRadius: 1,
    sampleFiller: (x: Wgsl, y: Wgsl, outSamplePtr: Wgsl) =>
      wgsl`${sampleFn}(${x}, ${y}, ${outSamplePtr});`,
    kernelReader: (idx: Wgsl) => wgsl`conv1Weight[${idx}]`,
  });

  const weightCount = wgsl
    .constant(
      wgsl`${outChannelsSlot} * (2 * ${kernelRadiusSlot} + 1) * (2 * ${kernelRadiusSlot} + 1) * ${inChannelsSlot}`,
    )
    .$name('weight_count');

  const newPipeline = runtime.makeComputePipeline({
    label: 'Edge Detection Pipeline',
    workgroupSize: [blockDim, blockDim],
    args: [
      '@builtin(local_invocation_id) LocalInvocationID: vec3<u32>',
      '@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>',
    ],
    code: wgsl`
      ${wgsl.declare`@group(0) @binding(0) var<storage, read_write> outputBuffer: array<f32>;`}
      ${wgsl.declare`@group(0) @binding(1) var<storage, read> inputBuffer: array<vec4f>;`}
      ${wgsl.declare`@group(0) @binding(2) var blurredTex: texture_2d<f32>;`}

      ${wgsl.declare`@group(1) @binding(0) var<storage, read> conv1Weight: array<vec4f, ${weightCount} / 4>;`}

      let coord = GlobalInvocationID.xy;
      let lid = LocalInvocationID.xy;

      var result: array<vec4f, 1>;
      result[0] = vec4f();

      ${edgeConvolveFn}(coord, &result);

      let outputBufferBegin =
        (coord.y * u32(${canvasSizeUniform}.x) +
        coord.x);

      outputBuffer[outputBufferBegin] = result[0];
    `,
  });

  const pipeline = device.createComputePipeline({
    label: 'Edge Detection Pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        uniformBindGroupLayout,
        ioBindGroupLayout,
        convLayer.bindGroupLayout,
      ],
    }),
    compute: {
      module: device.createShaderModule({
        label: 'Edge Detection Shader',
        code: preprocessShaderCode(menderWGSL, {
          KERNEL_RADIUS: '1',
          IN_CHANNELS: '8',
          OUT_CHANNELS: '1',
          RELU: 'false',
          INPUT_FROM_GBUFFER: 'true',
        }),
      }),
      entryPoint: 'main',
    },
  });

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: sceneUniformBuffer },
      },
    ],
  });

  const ioBindGroup = device.createBindGroup({
    label: 'Layer #1 IO BindGroup',
    layout: ioBindGroupLayout,
    entries: [
      // blurredTex
      {
        binding: 2,
        resource: gBuffer.upscaledView,
      },
      // auxTex
      {
        binding: 3,
        resource: gBuffer.auxView,
      },
      // outputBuffer
      {
        binding: 0,
        resource: {
          buffer: menderResultBuffer,
        },
      },
      // UNUSED
      {
        binding: 1,
        resource: { buffer: noWorkBuffer },
      },
    ],
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      const computePass = commandEncoder.beginComputePass();

      computePass.setPipeline(pipeline);
      computePass.setBindGroup(0, uniformBindGroup);
      computePass.setBindGroup(1, ioBindGroup);
      computePass.setBindGroup(2, convLayer.bindGroup);
      computePass.dispatchWorkgroups(
        Math.ceil(gBuffer.size[0] / blockDim),
        Math.ceil(gBuffer.size[1] / blockDim),
        1,
      );

      computePass.end();
    },
  };
};
