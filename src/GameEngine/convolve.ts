import { type Eventual, type Wgsl, wgsl } from 'typegpu';

export type SampleFiller = (x: Wgsl, y: Wgsl, outSamplePtr: Wgsl) => Wgsl;
export type KernelReader = (idx: Wgsl) => Wgsl;

/**
 * Has to be divisible by 4
 */
const inChannelsSlot = wgsl.slot<number>().$name('in_channels');
const outChannelsSlot = wgsl.slot<number>().$name('out_channels');
const kernelRadiusSlot = wgsl.slot<number>().$name('kernel_radius');
const sampleFillerSlot = wgsl.slot<SampleFiller>().$name('sample_filler');
const kernelReaderSlot = wgsl.slot<KernelReader>().$name('kernel_reader');

const _convolveFn = wgsl.fn`(coord: vec2u, result: ptr<function, array<f32, ${outChannelsSlot}>>) {
  var sample = array<vec4f, ${inChannelsSlot} / 4>();

  var coord_idx: u32 = 0;
  for (var i: i32 = -i32(${kernelRadiusSlot}); i <= i32(${kernelRadiusSlot}); i++) {
    for (var j: i32 = -i32(${kernelRadiusSlot}); j <= i32(${kernelRadiusSlot}); j++) {
      ${(get) => get(sampleFillerSlot)('i32(coord.x) + i', 'i32(coord.y) + j', '&sample')}

      for (var out_c: u32 = 0; out_c < ${outChannelsSlot}; out_c++) {
        var weight_idx = (coord_idx + out_c * (2 * ${kernelRadiusSlot} + 1) * (2 * ${kernelRadiusSlot} + 1)) * ${inChannelsSlot} / 4;
        for (var in_c: u32 = 0; in_c < ${inChannelsSlot} / 4; in_c++) {
          (*result)[out_c] += dot(sample[in_c], ${(get) => get(kernelReaderSlot)('weight_idx')});
          weight_idx++;
        }
      }

      coord_idx++;
    }
  }
}`;

export const convolveFn = ({
  inChannels,
  outChannels,
  kernelRadius,
  sampleFiller,
  kernelReader,
}: {
  inChannels: Eventual<number>;
  outChannels: Eventual<number>;
  kernelRadius: Eventual<number>;
  sampleFiller: Eventual<SampleFiller>;
  kernelReader: Eventual<KernelReader>;
}) =>
  _convolveFn
    .with(inChannelsSlot, inChannels)
    .with(outChannelsSlot, outChannels)
    .with(kernelRadiusSlot, kernelRadius)
    .with(sampleFillerSlot, sampleFiller)
    .with(kernelReaderSlot, kernelReader);
