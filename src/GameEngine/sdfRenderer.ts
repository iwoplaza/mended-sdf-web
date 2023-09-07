import renderSDFWGSL from '../shaders/renderSDF.wgsl?raw';
import { GBuffer } from '../gBuffer';
import { preprocessShaderCode } from '../preprocessShaderCode';

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
  const mainPassSize = renderQuarter ? gBuffer.quarterSize : gBuffer.size;

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

  const mainBindGroup = device.createBindGroup({
    label: `${LABEL} = Main Bind Group`,
    layout: mainBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: renderQuarter ? gBuffer.quarterView : gBuffer.rawRenderView,
      },
    ],
  });

  const auxBindGroup = device.createBindGroup({
    label: `${LABEL} = Aux Bind Group`,
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
      bindGroupLayouts: [mainBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Main Shader`,
        code: preprocessShaderCode(renderSDFWGSL, {
          OUTPUT_FORMAT: 'rgba8unorm',
          WIDTH: `${mainPassSize[0]}`,
          HEIGHT: `${mainPassSize[1]}`,
        }),
      }),
      entryPoint: 'main_frag',
    },
  });

  const auxPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [auxBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Aux Shader`,
        code: preprocessShaderCode(renderSDFWGSL, {
          OUTPUT_FORMAT: 'rgba16float',
          WIDTH: `${gBuffer.size[0]}`,
          HEIGHT: `${gBuffer.size[1]}`,
        }),
      }),
      entryPoint: 'main_aux',
    },
  });

  return {
    perform(commandEncoder: GPUCommandEncoder) {
      const mainPass = commandEncoder.beginComputePass();

      mainPass.setPipeline(mainPipeline);
      mainPass.setBindGroup(0, mainBindGroup);
      mainPass.dispatchWorkgroups(
        Math.ceil(mainPassSize[0] / blockDim),
        Math.ceil(mainPassSize[1] / blockDim),
        1,
      );

      mainPass.end();

      const auxPass = commandEncoder.beginComputePass();

      auxPass.setPipeline(auxPipeline);
      auxPass.setBindGroup(0, auxBindGroup);
      auxPass.dispatchWorkgroups(
        Math.ceil(gBuffer.size[0] / blockDim),
        Math.ceil(gBuffer.size[1] / blockDim),
        1,
      );

      auxPass.end();
    },
  };
};
