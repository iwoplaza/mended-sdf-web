import { BufferWriter, object, Parsed, u32 } from 'typed-binary';

import renderSDFWGSL from '../../shaders/renderSDF.wgsl?raw';
import { GBuffer } from '../../gBuffer';
import { preprocessShaderCode } from '../../preprocessShaderCode';
import { WhiteNoiseBuffer } from '../../whiteNoiseBuffer';
import { TimeInfoBuffer } from '../timeInfoBuffer';
import { pad, Vec4f32 } from '../../schema/primitive';
import { MarchDomainKind, MarchDomainStruct } from './marchDomain';

type SceneInfoStruct = Parsed<typeof SceneInfoStruct>;
const SceneInfoStruct = object({
  numOfSpheres: u32,
  numOfDomains: u32,
});

type SphereStruct = Parsed<typeof SphereStruct>;
const SphereStruct = object({
  xyzr: Vec4f32,
  materialIdx: pad(u32, 16),
});

function domainFromSphere(sphere: SphereStruct): MarchDomainStruct {
  const radius = sphere.xyzr[3];

  return {
    kind: MarchDomainKind.AABB,
    pos: [sphere.xyzr[0], sphere.xyzr[1], sphere.xyzr[2]],
    extra: [radius, radius, radius],
  };
}

export const SDFRenderer = (
  device: GPUDevice,
  gBuffer: GBuffer,
  renderQuarter: boolean,
) => {
  const LABEL = `SDF Renderer`;
  const blockDim = 8;
  const parallelSamples = 1;
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

  const sceneBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL} - Scene Bind Group Layout`,
    entries: [
      // scene_info
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // scene_spheres
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
        },
      },
      // domains
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'read-only-storage',
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

  const sceneSpheres: SphereStruct[] = [
    {
      xyzr: [-0.3, 0, 1, 0.2],
      materialIdx: 1,
    },
    {
      xyzr: [0.4, 0, 1, 0.4],
      materialIdx: 0,
    },
    {
      xyzr: [0, 0.7, 1, 0.2],
      materialIdx: 2,
    },
  ];

  const domains: MarchDomainStruct[] = [];
  for (let i = 0; i < sceneSpheres.length; ++i) {
    domains.push(domainFromSphere(sceneSpheres[i]));
  }
  console.log(domains);

  const sceneInfo: SceneInfoStruct = {
    numOfSpheres: sceneSpheres.length,
    numOfDomains: domains.length,
  };
  const sceneInfoBuffer = device.createBuffer({
    label: `${LABEL} - Scene Info Buffer`,
    size: SceneInfoStruct.sizeOf(sceneInfo),
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  {
    SceneInfoStruct.write(
      new BufferWriter(sceneInfoBuffer.getMappedRange()),
      sceneInfo,
    );
    sceneInfoBuffer.unmap();
  }

  const sceneSpheresBuffer = device.createBuffer({
    label: `${LABEL} - Scene Spheres Buffer`,
    size: SphereStruct.sizeOf(sceneSpheres[0]) * sceneSpheres.length,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  {
    const writer = new BufferWriter(sceneSpheresBuffer.getMappedRange());
    for (let i = 0; i < sceneSpheres.length; ++i) {
      SphereStruct.write(writer, sceneSpheres[i]);
    }
    sceneSpheresBuffer.unmap();
  }

  const domainsBuffer = device.createBuffer({
    label: `${LABEL} - Domains Buffer`,
    size: MarchDomainStruct.sizeOf(domains[0]) * domains.length,
    usage: GPUBufferUsage.STORAGE,
    mappedAtCreation: true,
  });
  {
    const writer = new BufferWriter(domainsBuffer.getMappedRange());
    for (let i = 0; i < domains.length; ++i) {
      MarchDomainStruct.write(writer, domains[i]);
    }
    domainsBuffer.unmap();
  }

  const sceneBindGroup = device.createBindGroup({
    label: `${LABEL} - Scene Bind Group`,
    layout: sceneBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: sceneInfoBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: sceneSpheresBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: domainsBuffer,
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
      bindGroupLayouts: [
        sharedBindGroupLayout,
        mainBindGroupLayout,
        sceneBindGroupLayout,
      ],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Main Shader`,
        code: preprocessShaderCode(renderSDFWGSL, {
          OUTPUT_FORMAT: 'rgba8unorm',
          WIDTH: `${mainPassSize[0]}`,
          HEIGHT: `${mainPassSize[1]}`,
          BLOCK_SIZE: `${blockDim}`,
          WHITE_NOISE_BUFFER_SIZE: `${whiteNoiseBufferSize}`,
          PARALLEL_SAMPLES: `${parallelSamples}`,
        }),
      }),
      entryPoint: 'main_frag',
    },
  });

  const auxPipeline = device.createComputePipeline({
    label: `${LABEL} - Pipeline`,
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        sharedBindGroupLayout,
        auxBindGroupLayout,
        sceneBindGroupLayout,
      ],
    }),
    compute: {
      module: device.createShaderModule({
        label: `${LABEL} - Aux Shader`,
        code: preprocessShaderCode(renderSDFWGSL, {
          OUTPUT_FORMAT: 'rgba16float',
          WIDTH: `${gBuffer.size[0]}`,
          HEIGHT: `${gBuffer.size[1]}`,
          BLOCK_SIZE: `${blockDim}`,
          WHITE_NOISE_BUFFER_SIZE: `${whiteNoiseBufferSize}`,
          PARALLEL_SAMPLES: `${parallelSamples}`,
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
      mainPass.setBindGroup(2, sceneBindGroup);
      mainPass.dispatchWorkgroups(
        Math.ceil(mainPassSize[0] / blockDim),
        Math.ceil(mainPassSize[1] / blockDim),
        parallelSamples,
      );

      mainPass.end();

      const auxPass = commandEncoder.beginComputePass();

      auxPass.setPipeline(auxPipeline);
      auxPass.setBindGroup(0, sharedBindGroup);
      auxPass.setBindGroup(1, auxBindGroup);
      auxPass.setBindGroup(2, sceneBindGroup);
      auxPass.dispatchWorkgroups(
        Math.ceil(gBuffer.size[0] / blockDim),
        Math.ceil(gBuffer.size[1] / blockDim),
        1,
      );

      auxPass.end();
    },
  };
};
