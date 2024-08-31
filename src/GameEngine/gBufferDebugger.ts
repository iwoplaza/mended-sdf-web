import { builtin, wgsl, type TypeGpuRuntime } from 'typegpu';

import type { GBuffer } from '../gBuffer';
import { i32, vec2i } from 'typegpu/data';
import { store } from '@/store';
import { displayModeAtom } from '@/controlAtoms';

const canvasSizeBuffer = wgsl
  .buffer(vec2i)
  .$name('canvas_size')
  .$allowUniform();
const canvasSizeUniform = canvasSizeBuffer.asUniform();

const CHANNEL_SPLIT = 0;
const CHANNEL_COLOR = 1;
const CHANNEL_ALBEDO = 2;
const CHANNEL_NORMAL = 3;

const channelModeBuffer = wgsl
  .buffer(i32, CHANNEL_SPLIT)
  .$name('channel_mode')
  .$allowUniform();

const mainFragFn = wgsl.fn`(coord_f: vec4f) -> vec4f {
  let coord = vec2<i32>(floor(coord_f.xy));
  let channel_mode = ${channelModeBuffer.asUniform()};

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

  let normal = vec4(
    (aux.x + 1.0) * 0.5, // normal.x
    (aux.y + 1.0) * 0.5, // normal.y
    0.5,
    1.0,
  );

  var result: vec4<f32>;

  let c = coord_f.xy / vec2<f32>(${canvasSizeUniform});
  if (channel_mode == ${CHANNEL_SPLIT}) {
    if (c.x < 0.33) {
      // NORMALS
      result = normal;
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
    else {
      // COLOR

      result = vec4(
        blurred.rgb,
        1.0,
      );
    }
  } else if (channel_mode == ${CHANNEL_COLOR}) {
    result = vec4(
      blurred.rgb,
      1.0,
    );
  } else if (channel_mode == ${CHANNEL_ALBEDO}) {
    let albedo = aux.z;
    result = vec4(
      albedo,
      albedo,
      albedo,
      1.0,
    );
  } else if (channel_mode == ${CHANNEL_NORMAL}) {
    result = normal;
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
      code: wgsl`
        const SCREEN_RECT = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>(1.0, -1.0),
          vec2<f32>(-1.0, 1.0),

          vec2<f32>(1.0, -1.0),
          vec2<f32>(-1.0, 1.0),
          vec2<f32>(1.0, 1.0),
        );

        let out_pos = vec4(SCREEN_RECT[${builtin.vertexIndex}], 0.0, 1.0);
      `,
      output: {
        [builtin.position]: 'out_pos',
      },
    },
    fragment: {
      code: wgsl`
        ${wgsl.declare`@group(0) @binding(0) var blurredTex: texture_2d<f32>;`}
        ${wgsl.declare`@group(0) @binding(1) var auxTex: texture_2d<f32>;`}

        let coord_f = ${builtin.position};
        return ${mainFragFn}(coord_f);
      `,
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

      const mode = store.get(displayModeAtom);
      let channelMode = CHANNEL_SPLIT;
      if (mode === 'g-buffer-color') {
        channelMode = CHANNEL_COLOR;
      } else if (mode === 'g-buffer-albedo') {
        channelMode = CHANNEL_ALBEDO;
      } else if (mode === 'g-buffer-normal') {
        channelMode = CHANNEL_NORMAL;
      }

      runtime.writeBuffer(channelModeBuffer, channelMode);

      pipeline.execute({
        vertexCount: 6,
        colorAttachments: [passColorAttachment],
        externalBindGroups: [externalBindGroup],
      });
    },
  };
}
