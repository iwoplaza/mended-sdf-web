import { BufferWriter } from 'typed-binary';

import menderWGSL from './shaders/convolve.wgsl?raw';
import { Model3 } from './model3';
import { GBuffer } from './gBuffer';
import { SceneSchema } from './schema/scene';
import { NetworkLayer } from './networkLayer';
import { preprocessShaderCode } from './preprocessShaderCode';

const blockDim = 8;

type Options = {
  device: GPUDevice;
  gBuffer: GBuffer;
  menderResultBuffer: GPUBuffer;
};

export const MenderStep = ({
  device,
  gBuffer,
  menderResultBuffer,
}: Options) => {
  // Textures

  const firstWorkBuffer = device.createBuffer({
    label: 'First Work Buffer',
    size: gBuffer.size[0] * gBuffer.size[1] * 64 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });
  
  const secondWorkBuffer = device.createBuffer({
    label: 'Second Work Buffer',
    size: gBuffer.size[0] * gBuffer.size[1] * 32 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  //
  // Weights & Biases
  //

  const convLayers = [
    new NetworkLayer(device, Model3.Conv1Weight, Model3.Conv1Bias),
    new NetworkLayer(device, Model3.Conv2Weight, Model3.Conv2Bias),
    new NetworkLayer(device, Model3.Conv3Weight, Model3.Conv3Bias),
  ];

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

  const uniformBindGroupLayout = device.createBindGroupLayout({
    label: 'Mender Uniform BindGroup Layout',
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
    label: 'Mender IO BindGroup Layout',
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

  const pipelines = [
    device.createComputePipeline({
      label: 'Layer #1 Pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [uniformBindGroupLayout, ioBindGroupLayout, convLayers[0].bindGroupLayout]
      }),
      compute: {
        module: device.createShaderModule({
          label: 'Layer #1 convolutional shader',
          code: preprocessShaderCode(menderWGSL, {
            KERNEL_RADIUS: '4',
            IN_CHANNELS: '7',
            OUT_CHANNELS: '64',
            RELU: 'true',
            INPUT_FROM_GBUFFER: 'true',
          }),
        }),
        entryPoint: 'main',
      },
    }),
    device.createComputePipeline({
      label: 'Layer #2 Pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [uniformBindGroupLayout, ioBindGroupLayout, convLayers[1].bindGroupLayout]
      }),
      compute: {
        module: device.createShaderModule({
          label: 'Layer #2 convolutional shader',
          code: preprocessShaderCode(menderWGSL, {
            KERNEL_RADIUS: '2',
            IN_CHANNELS: '64',
            OUT_CHANNELS: '32',
            RELU: 'true',
            INPUT_FROM_GBUFFER: 'false',
          }),
        }),
        entryPoint: 'main',
      },
    }),
    device.createComputePipeline({
      label: 'Layer #3 Pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [uniformBindGroupLayout, ioBindGroupLayout, convLayers[2].bindGroupLayout]
      }),
      compute: {
        module: device.createShaderModule({
          label: 'Layer #2 convolutional shader',
          code: preprocessShaderCode(menderWGSL, {
            KERNEL_RADIUS: '2',
            IN_CHANNELS: '32',
            OUT_CHANNELS: '3',
            RELU: 'false',
            INPUT_FROM_GBUFFER: 'false',
          }),
        }),
        entryPoint: 'main',
      },
    }),
  ];

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: sceneUniformBuffer },
      },
    ],
  });

  const ioBindGroups = [
    device.createBindGroup({
      label: 'Layer #1 IO BindGroup',
      layout: ioBindGroupLayout,
      entries: [
        // blurredTex
        {
          binding: 2,
          resource: gBuffer.blurredView,
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
            buffer: firstWorkBuffer,
          },
        },
        // UNUSED
        {
          binding: 1,
          resource: { buffer: secondWorkBuffer },
        }
      ],
    }),
    device.createBindGroup({
      label: 'Layer #2 IO BindGroup',
      layout: ioBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: firstWorkBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: secondWorkBuffer,
          },
        },

        // UNUSED blurredTex
        {
          binding: 2,
          resource: gBuffer.blurredView,
        },
        // UNUSED auxTex
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
        {
          binding: 0,
          resource: {
            buffer: secondWorkBuffer,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: menderResultBuffer,
          },
        },

        // UNUSED blurredTex
        {
          binding: 2,
          resource: gBuffer.blurredView,
        },
        // UNUSED auxTex
        {
          binding: 3,
          resource: gBuffer.auxView,
        },
      ],
    }),
  ];

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      const computePass = commandEncoder.beginComputePass();

      for (let i = 0; i < 3; ++i) {
        computePass.setPipeline(pipelines[i]);
        computePass.setBindGroup(0, uniformBindGroup);
        computePass.setBindGroup(1, ioBindGroups[i]);
        computePass.setBindGroup(2, convLayers[i].bindGroup);
        computePass.dispatchWorkgroups(
          Math.ceil(gBuffer.size[0] / blockDim),
          Math.ceil(gBuffer.size[1] / blockDim)
        );
      }

      computePass.end();
    }
  };
}
