import { wgsl, type TypeGpuRuntime } from 'typegpu';
import { fullScreenQuadVertexShader } from '../../shaders/fullScreenQuad';

type Options = {
  runtime: TypeGpuRuntime;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  textures: [GPUTextureView, GPUTextureView];
};

const externalDeclarations = [
  '@group(0) @binding(0) var texture_a: texture_2d<f32>;',
  '@group(0) @binding(1) var texture_b: texture_2d<f32>;',
];

const fragFn = wgsl.fn()`(coord_f: vec4f) -> vec4f {
  var coord = vec2u(floor(coord_f.xy));

  let color_a = textureLoad(
    texture_a,
    coord,
    0
  );

  let color_b = textureLoad(
    texture_b,
    coord,
    0
  );

  return vec4f(abs(color_a.rgb - color_b.rgb), 1.0);
}`;

export const BlipDifferenceStep = ({
  runtime,
  context,
  presentationFormat,
  textures,
}: Options) => {
  const device = runtime.device;
  const LABEL_BASE = 'Blip Difference';

  const externalBindGroupLayout = device.createBindGroupLayout({
    label: `${LABEL_BASE} - External Bind Group Layout`,
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          viewDimension: '2d',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          viewDimension: '2d',
        },
      },
    ],
  });

  const pipeline = runtime.makeRenderPipeline({
    label: `${LABEL_BASE} - Pipeline`,
    vertex: fullScreenQuadVertexShader,
    fragment: {
      args: ['@builtin(position) coord_f: vec4f'],
      code: wgsl`
        return ${fragFn}(coord_f);
      `,
      output: '@location(0) vec4f',
      target: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-list' },
    externalDeclarations,
    externalLayouts: [externalBindGroupLayout],
  });

  const passColorAttachment: GPURenderPassColorAttachment = {
    // view is acquired and set in render loop.
    view: undefined as unknown as GPUTextureView,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };

  const bindGroup = device.createBindGroup({
    label: `${LABEL_BASE} - Bind Group`,
    layout: externalBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: textures[0],
      },
      {
        binding: 1,
        resource: textures[1],
      },
    ],
  });

  return {
    perform() {
      // Updating color attachment
      const textureView = context.getCurrentTexture().createView();
      passColorAttachment.view = textureView;

      pipeline.execute({
        vertexCount: 6,
        externalBindGroups: [bindGroup],
        colorAttachments: [passColorAttachment],
      });
    },
  };
};
