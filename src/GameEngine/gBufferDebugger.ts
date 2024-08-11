import { wgsl, type TypeGpuRuntime } from 'typegpu';

import type { GBuffer } from '../gBuffer';
import { struct, vec2i, vec4f } from 'typegpu/data';

const VertexOutput = struct({
  '@builtin(position) position': vec4f,
}).$name('vertex_output');

const canvasSizeBuffer = wgsl
  .buffer(vec2i)
  .$name('canvas_size')
  .$allowUniform();
const canvasSizeUniform = canvasSizeBuffer.asUniform();

const mainFragFn = wgsl.fn`(coord_f: vec4f) -> vec4f {
  let coord = vec2<i32>(floor(coord_f.xy));

  let blurred = textureLoad(
    blurredTex,
    coord,
    0
  );

  let aux = textureLoad(
    auxTex,
    coord,
    0
  );

  var result: vec4<f32>;

  let c = coord_f.xy / vec2<f32>(${canvasSizeUniform});
  // let c = coord.xy / vec2<f32>(512, 512);
  if (c.x < 0.33) {
    // NORMALS

    result = vec4(
      (aux.x + 1.0) * 0.5, // normal.x
      (aux.y + 1.0) * 0.5, // normal.y
      0.5,
      1.0,
    );
  }
  else if (c.x < 0.66) {
    // ALBEDO_LUMI

    let albedo = aux.z;
    result = vec4(
      albedo,
      albedo,
      albedo,
      1.0,
    );
  }
  /*
  else if (c.x < 0.75) {
    // EMISSION_LUMI

    let emission = aux.w;
    result = vec4(
      emission,
      emission,
      emission,
      1.0,
    );
  }*/
  else {
    // BLURRED

    result = vec4(
      blurred.rgb,
      1.0,
    );
  }

  return result;
}`;

export function makeGBufferDebugger(
  runtime: TypeGpuRuntime,
  presentationFormat: GPUTextureFormat,
  gBuffer: GBuffer,
) {
  const passColorAttachment = {
    // view is acquired and set in render loop.
    view: undefined as unknown as GPUTextureView,

    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
    loadOp: 'clear' as const,
    storeOp: 'store' as const,
  };

  //
  // SCENE
  //

  const externalBindGroupLayout = runtime.device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'unfilterable-float',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'unfilterable-float',
        },
      },
    ],
  });

  const pipeline = runtime.makeRenderPipeline({
    label: 'GBuffer Debugger - pipeline',
    vertex: {
      args: ['@builtin(vertex_index) vertexIndex: u32'],
      code: wgsl`
        const SCREEN_RECT = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(1.0, -1.0),
          vec2<f32>(-1.0, 1.0),

          vec2<f32>(1.0, -1.0),
          vec2<f32>(-1.0, 1.0),
          vec2<f32>(1.0, 1.0),
        );

        var output: ${VertexOutput};
        output.position = vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0);
        return output;
      `,
      output: VertexOutput,
    },
    fragment: {
      args: ['@builtin(position) coord_f: vec4f'],
      code: wgsl`
        ${wgsl.declare`@group(0) @binding(0) var blurredTex: texture_2d<f32>;`}
        ${wgsl.declare`@group(0) @binding(1) var auxTex: texture_2d<f32>;`}

        return ${mainFragFn}(coord_f);
      `,
      output: wgsl`@location(0) vec4f`,
      target: [
        {
          format: presentationFormat,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
    externalLayouts: [externalBindGroupLayout],
  });

  const externalBindGroup = runtime.device.createBindGroup({
    layout: externalBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: gBuffer.upscaledView,
      },
      {
        binding: 1,
        resource: gBuffer.auxView,
      },
    ],
  });

  runtime.writeBuffer(canvasSizeBuffer, gBuffer.size);

  return {
    perform(ctx: GPUCanvasContext) {
      const textureView = ctx.getCurrentTexture().createView();
      passColorAttachment.view = textureView;

      pipeline.execute({
        vertexCount: 6,
        colorAttachments: [passColorAttachment],
        externalBindGroups: [externalBindGroup],
      });
    },
  };
}
