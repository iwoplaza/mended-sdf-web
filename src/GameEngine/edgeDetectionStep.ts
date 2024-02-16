import { BufferWriter } from 'typed-binary';

import menderWGSL from '../shaders/convolve.wgsl?raw';
import { GBuffer } from '../gBuffer';
import { SceneSchema } from '../schema/scene';
import { NetworkLayer } from '../networkLayer';
import { preprocessShaderCode } from '../preprocessShaderCode';

const blockDim = 8;

type Options = {
  device: GPUDevice;
  gBuffer: GBuffer;
  menderResultBuffer: GPUBuffer;
};

export const EdgeDetectionStep = ({
  device,
  gBuffer,
  menderResultBuffer,
}: Options) => {
  //
  // Weights & Biases
  //

  const noWorkBuffer = device.createBuffer({
    label: 'No Work Buffer',
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });

  const zeroInChannels = (firstVal: number) => {
    return [firstVal, 0, 0, 0, 0, 0, 0];
  };

  // edge detection in the Y direction
  const convLayer = new NetworkLayer(
    device,
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
