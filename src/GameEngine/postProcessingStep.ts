import { vec2f } from 'typegpu/data';
import { builtin, wgsl, type TypeGpuRuntime } from 'typegpu';

import type { GBuffer } from '../gBuffer';
import { fullScreenQuadVertexShader } from '../shaders/fullScreenQuad';

type Options = {
  runtime: TypeGpuRuntime;
  context: GPUCanvasContext;
  presentationFormat: GPUTextureFormat;
  gBuffer: GBuffer;
};

const canvasSizeBuffer = wgsl
  .buffer(vec2f)
  .$name('canvas_size')
  .$allowUniform();

const mainFragFn = wgsl.fn`(coord_f: vec4f) -> vec4f {
  var coord = vec2u(floor(coord_f.xy));

  let color = textureLoad(
    sourceTexture,
    coord,
    0
  );

  // no post-processing for now

  return vec4f(color.rgb, 1.0);
}
`;

export const PostProcessingStep = ({
  runtime,
  context,
  presentationFormat,
  gBuffer,
}: Options) => {
  const passColorAttachment: GPURenderPassColorAttachment = {
    // view is acquired and set in render loop.
    view: undefined as unknown as GPUTextureView,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear',
    storeOp: 'store',
  };

  const externalBindGroupLayout = runtime.device.createBindGroupLayout({
    label: 'Post Processing - Bind Group Layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      },
    ],
  });

  const pipeline = runtime.makeRenderPipeline({
    label: 'Pos Processing Pipeline',
    vertex: fullScreenQuadVertexShader,
    fragment: {
      code: wgsl`
        ${wgsl.declare`@group(0) @binding(0) var sourceTexture: texture_2d<f32>;`}

        let coord_f = ${builtin.position};
        return ${mainFragFn}(coord_f);
      `,
      target: [{ format: presentationFormat }],
    },
    primitive: { topology: 'triangle-list' },
    externalLayouts: [externalBindGroupLayout],
  });

  const externalBindGroup = runtime.device.createBindGroup({
    label: 'Post Processing - Bind Group',
    layout: externalBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: gBuffer.rawRenderView,
      },
    ],
  });

  runtime.writeBuffer(canvasSizeBuffer, gBuffer.size);

  return {
    perform() {
      // Updating color attachment
      const textureView = context.getCurrentTexture().createView();
      passColorAttachment.view = textureView;

      pipeline.execute({
        vertexCount: 6,
        colorAttachments: [passColorAttachment],
        externalBindGroups: [externalBindGroup],
      });
    },
  };
};
