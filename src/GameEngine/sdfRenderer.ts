import renderSDFWGSL from '../shaders/renderSDF.wgsl?raw';
import { GBuffer } from '../gBuffer';
import { preprocessShaderCode } from '../preprocessShaderCode';
import { WhiteNoiseBuffer } from '../whiteNoiseBuffer';
import { TimeInfoBuffer } from './timeInfoBuffer';

// class Camera {
//   private gpuBuffer: GPUBuffer;

//   private position: [number, number, number] = [0, 0, 0];

//   constructor(device: GPUDevice) {
//     this.gpuBuffer = device.createBuffer({
//       size: 128,
//       usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
//     });
//   }

//   dispose() {
//     this.gpuBuffer.destroy();
//   }
// }

export const SDFRenderer = (
  device: GPUDevice,
  gBuffer: GBuffer,
  renderQuarter: boolean,
) => {
  const LABEL = `SDF Renderer`;
  const blockDim = 8;
  const whiteNoiseBufferSize = 512 * 512;
  const mainPassSize = renderQuarter ? gBuffer.quarterSize : gBuffer.size;

  const whiteNoiseBuffer = WhiteNoiseBuffer(
    device,
    whiteNoiseBufferSize,
    GPUBufferUsage.STORAGE,
  );

  const timeInfoBuffer = TimeInfoBuffer(device, GPUBufferUsage.UNIFORM);

  const mainBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL} - Main Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: 'rgba8unorm',
        },
      },
    ],
  });

  const sharedBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL} - Shared Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'uniform',
        },
      },
    ],
  });

  const auxBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL} - Aux Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          format: 'rgba16float',
        },
      },
    ],
  });

  const sharedBindGroup = device.createBindGroup({
    label: `${LABEL} - Shared Bind Group`,
    layout: sharedBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          label: `${LABEL} - White Noise Buffer`,
          buffer: whiteNoiseBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          label: `${LABEL} - Time Info`,
          buffer: timeInfoBuffer.buffer,
        },
      },
    ],
  });

  const mainBindGroup = device.createBindGroup({
    label: `${LABEL} - Main Bind Group`,
    layout: mainBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: renderQuarter ? gBuffer.quarterView : gBuffer.rawRenderView,
      },
    ],
  });

  const auxBindGroup = device.createBindGroup({
    label: `${LABEL} - Aux Bind Group`,
    layout: auxBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: gBuffer.auxView,
      },
    ],
  });

  const mainPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [sharedBindGroupLayout, mainBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Main Shader`,
        code: preprocessShaderCode(renderSDFWGSL, {
          OUTPUT_FORMAT: 'rgba8unorm',
          WIDTH: `${mainPassSize[0]}`,
          HEIGHT: `${mainPassSize[1]}`,
          WHITE_NOISE_BUFFER_SIZE: `${whiteNoiseBufferSize}`,
        }),
      }),
      entryPoint: 'main_frag',
    },
  });

  const auxPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [sharedBindGroupLayout, auxBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Aux Shader`,
        code: preprocessShaderCode(renderSDFWGSL, {
          OUTPUT_FORMAT: 'rgba16float',
          WIDTH: `${gBuffer.size[0]}`,
          HEIGHT: `${gBuffer.size[1]}`,
          WHITE_NOISE_BUFFER_SIZE: `${whiteNoiseBufferSize}`,
        }),
      }),
      entryPoint: 'main_aux',
    },
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      timeInfoBuffer.update();

      const mainPass = commandEncoder.beginComputePass();

      mainPass.setPipeline(mainPipeline);
      mainPass.setBindGroup(0, sharedBindGroup);
      mainPass.setBindGroup(1, mainBindGroup);
      mainPass.dispatchWorkgroups(
        Math.ceil(mainPassSize[0] / blockDim),
        Math.ceil(mainPassSize[1] / blockDim),
        1,
      );

      mainPass.end();

      const auxPass = commandEncoder.beginComputePass();

      auxPass.setPipeline(auxPipeline);
      auxPass.setBindGroup(0, sharedBindGroup);
      auxPass.setBindGroup(1, auxBindGroup);
      auxPass.dispatchWorkgroups(
        Math.ceil(gBuffer.size[0] / blockDim),
        Math.ceil(gBuffer.size[1] / blockDim),
        1,
      );

      auxPass.end();
    },
  };
};
