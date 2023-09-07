import { BufferWriter } from 'typed-binary';

import convolveWGSL from './shaders/convolve.wgsl?raw';
import fullScreenQuadWGSL from './shaders/fullScreenQuad.wgsl?raw';
import combineWGSL from './shaders/finalizeMender.wgsl?raw';

import { Model6 } from './model6';
import { GBuffer } from './gBuffer';
import { SceneSchema } from './schema/scene';
import { NetworkLayer } from './networkLayer';
import { preprocessShaderCode } from './preprocessShaderCode';

const blockDim = 8;

const FIRST_DEPTH = 8;
const SECOND_DEPTH = 8;

type Options = {
  device: GPUDevice;
  gBuffer: GBuffer;
  targetTexture: GPUTextureView;
};

export const MenderStep = ({ device, gBuffer, targetTexture }: Options) => {
  // Textures

  const firstWorkBuffer = device.createBuffer({
    label: 'First Work Buffer',
    size:
      gBuffer.size[0] *
      gBuffer.size[1] *
      FIRST_DEPTH *
      Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  const secondWorkBuffer = device.createBuffer({
    label: 'Second Work Buffer',
    size:
      gBuffer.size[0] *
      gBuffer.size[1] *
      SECOND_DEPTH *
      Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  const mendedResultBuffer = device.createBuffer({
    label: 'Mender Result Buffer',
    size: gBuffer.size[0] * gBuffer.size[1] * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  //
  // Weights & Biases
  //

  const convLayers = [
    new NetworkLayer(device, Model6.Conv1Weight, Model6.Conv1Bias),
    new NetworkLayer(device, Model6.Conv2Weight, Model6.Conv2Bias),
    new NetworkLayer(device, Model6.Conv3Weight, Model6.Conv3Bias),
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
        bindGroupLayouts: [
          uniformBindGroupLayout,
          ioBindGroupLayout,
          convLayers[0].bindGroupLayout,
        ],
      }),
      compute: {
        module: device.createShaderModule({
          label: 'Layer #1 convolutional shader',
          code: preprocessShaderCode(convolveWGSL, {
            KERNEL_RADIUS: '4',
            IN_CHANNELS: '8',
            OUT_CHANNELS: `${FIRST_DEPTH}`,
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
        bindGroupLayouts: [
          uniformBindGroupLayout,
          ioBindGroupLayout,
          convLayers[1].bindGroupLayout,
        ],
      }),
      compute: {
        module: device.createShaderModule({
          label: 'Layer #2 convolutional shader',
          code: preprocessShaderCode(convolveWGSL, {
            KERNEL_RADIUS: '2',
            IN_CHANNELS: `${FIRST_DEPTH}`,
            OUT_CHANNELS: `${SECOND_DEPTH}`,
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
        bindGroupLayouts: [
          uniformBindGroupLayout,
          ioBindGroupLayout,
          convLayers[2].bindGroupLayout,
        ],
      }),
      compute: {
        module: device.createShaderModule({
          label: 'Layer #3 convolutional shader',
          code: preprocessShaderCode(convolveWGSL, {
            KERNEL_RADIUS: '2',
            IN_CHANNELS: `${SECOND_DEPTH}`,
            OUT_CHANNELS: '1',
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
            buffer: firstWorkBuffer,
          },
        },

        // UNUSED inputBuffer
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
        // inputBuffer
        {
          binding: 1,
          resource: {
            buffer: firstWorkBuffer,
          },
        },
        // outputBuffer
        {
          binding: 0,
          resource: {
            buffer: secondWorkBuffer,
          },
        },

        // UNUSED blurredTex
        {
          binding: 2,
          resource: gBuffer.upscaledView,
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
        // inputBuffer
        {
          binding: 1,
          resource: {
            buffer: secondWorkBuffer,
          },
        },
        // outputBuffer
        {
          binding: 0,
          resource: {
            buffer: mendedResultBuffer,
          },
        },

        // UNUSED blurredTex
        {
          binding: 2,
          resource: gBuffer.upscaledView,
        },
        // UNUSED auxTex
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

  const combinationPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: targetTexture,

        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const fullScreenQuadShader = device.createShaderModule({
    label: 'Full Screen Quad Shader',
    code: fullScreenQuadWGSL,
  });

  const combineShader = device.createShaderModule({
    label: 'Combine Shader',
    code: combineWGSL,
  });

  const combinationPipeline = device.createRenderPipeline({
    label: 'Combination Pipeline',
    layout: 'auto',
    vertex: {
      module: fullScreenQuadShader,
      entryPoint: 'main',
    },
    fragment: {
      module: combineShader,
      entryPoint: 'main',
      targets: [{ format: 'rgba8unorm' }],
    },
  });

  const combinationBindGroup = device.createBindGroup({
    layout: combinationPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: sceneUniformBuffer },
      },
      {
        binding: 1,
        resource: gBuffer.upscaledView,
      },
      {
        binding: 2,
        resource: {
          buffer: mendedResultBuffer,
        },
      },
    ],
  });

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
          Math.ceil(gBuffer.size[1] / blockDim),
        );
      }

      computePass.end();

      // Combining the convolved result with the initial blurry render

      const pass = commandEncoder.beginRenderPass(combinationPassDescriptor);
      pass.setPipeline(combinationPipeline);
      pass.setBindGroup(0, combinationBindGroup);
      pass.draw(6);
      pass.end();
    },
  };
};
