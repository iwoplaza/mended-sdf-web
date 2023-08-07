struct Uniforms {
  canvasSize: vec2u,
}

// alias ptr_to_f32_in_storage_buffer_rw = ptr<storage, i32, read_write>;

const KERNEL_RADIUS: u32 = {{KERNEL_RADIUS}};
const IN_CHANNELS: u32 = {{IN_CHANNELS}};
const OUT_CHANNELS: u32 = {{OUT_CHANNELS}};
const RELU: bool = {{RELU}};
const INPUT_FROM_GBUFFER: bool = {{INPUT_FROM_GBUFFER}};

const WEIGHTS = OUT_CHANNELS * (2 * KERNEL_RADIUS + 1) * (2 * KERNEL_RADIUS + 1) * IN_CHANNELS;
const BLOCK_SIZE = 8;
const TILE_PADDING = 4;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@group(1) @binding(0) var<storage, read_write> outputBuffer: array<f32>;

@group(1) @binding(1) var<storage, read> inputBuffer: array<f32>;
@group(1) @binding(2) var blurredTex: texture_2d<f32>;
@group(1) @binding(3) var auxTex: texture_2d<f32>;

@group(2) @binding(0) var<storage, read> conv1Weight: array<f32, WEIGHTS>;
@group(2) @binding(1) var<storage, read> conv1Bias: array<f32, OUT_CHANNELS>;

const CHANNELS_PER_TILE = 32;
const PASSES = u32(ceil(f32(IN_CHANNELS) / f32(CHANNELS_PER_TILE)));

// BLOCK_SIZExBLOCK_SIZE tile extended by 4 pixel padding to accomodate the 9x9 kernel.
var<workgroup> tile: array<array<array<f32, CHANNELS_PER_TILE>, BLOCK_SIZE + TILE_PADDING * 2>, BLOCK_SIZE + TILE_PADDING * 2>;

fn convolve(local: vec2u, in_channel_begin: u32, in_channel_end: u32, result: ptr<function, array<f32, OUT_CHANNELS>>) {
  var weight_idx: u32 = 0;
  for (var out_c: u32 = 0; out_c < OUT_CHANNELS; out_c++) {
    for (var i: u32 = TILE_PADDING-KERNEL_RADIUS; i <= TILE_PADDING+KERNEL_RADIUS; i++) {
      for (var j: u32 = TILE_PADDING-KERNEL_RADIUS; j <= TILE_PADDING+KERNEL_RADIUS; j++) {

        weight_idx += in_channel_begin;
        for (var in_c: u32 = in_channel_begin; in_c < in_channel_end; in_c++) {
          (*result)[out_c] += tile[local.x + i][local.y + j][in_c - in_channel_begin] * conv1Weight[weight_idx];
          weight_idx++;
        }
        weight_idx += IN_CHANNELS - in_channel_end;
      }
    }
  }
}

fn convolve_global(coord: vec2u, in_channel_begin: u32, in_channel_end: u32, result: ptr<function, array<f32, OUT_CHANNELS>>) {
  var weight_idx: u32 = 0;
  for (var out_c: u32 = 0; out_c < OUT_CHANNELS; out_c++) {
    for (var i: i32 = -i32(KERNEL_RADIUS); i <= i32(KERNEL_RADIUS); i++) {
      for (var j: i32 = -i32(KERNEL_RADIUS); j <= i32(KERNEL_RADIUS); j++) {
        let sample = sample_global(i32(coord.x) + i, i32(coord.y) + j);

        weight_idx += in_channel_begin;
        for (var in_c: u32 = in_channel_begin; in_c < in_channel_end; in_c++) {
          (*result)[out_c] += sample[in_c] * conv1Weight[weight_idx];
          weight_idx++;
        }
        weight_idx += IN_CHANNELS - in_channel_end;
      }
    }
  }
}

fn sample_global(x: i32, y: i32) -> array<f32, IN_CHANNELS> {
  let coord = vec2u(
    u32(max(0, min(x, i32(uniforms.canvasSize.x) - 1))),
    u32(max(0, min(y, i32(uniforms.canvasSize.y) - 1))),
  );

  if (INPUT_FROM_GBUFFER) {
    let blurred = textureLoad(
      blurredTex,
      coord,
      0
    );

    var aux = textureLoad(
      auxTex,
      coord,
      0
    );

    var result = array<f32, IN_CHANNELS>();

    result[0] = blurred.r;
    result[1] = blurred.g;
    result[2] = blurred.b;
    result[3] = aux.r; // depth
    result[4] = aux.g; // normal.x
    result[5] = aux.b; // normal.y
    result[6] = aux.a; // luminance
    
    return result;
  }
  else {
    var sample = array<f32, IN_CHANNELS>();

    for (var i: u32 = 0; i < IN_CHANNELS; i++) {
      let index =
        coord.y * uniforms.canvasSize.x * IN_CHANNELS +
        coord.x * IN_CHANNELS +
        i;
      
      sample[i] = inputBuffer[index];
    }

    return sample;
  }
}

fn ReLU(result: ptr<function, array<f32, OUT_CHANNELS>>) {
  for (var i = 0u; i < OUT_CHANNELS; i++) {
    (*result)[i] = max(0, (*result)[i]);
  }
}

@compute @workgroup_size(BLOCK_SIZE, BLOCK_SIZE)
fn main(
  @builtin(local_invocation_id) LocalInvocationID: vec3<u32>,
  @builtin(global_invocation_id) GlobalInvocationID: vec3<u32>,
) {
  let coord = GlobalInvocationID.xy;
  let lid = LocalInvocationID.xy;

  let whole_samples = array<array<array<f32, IN_CHANNELS>, 3>, 3>(
    array<array<f32, IN_CHANNELS>, 3>(
      sample_global(i32(coord.x) - BLOCK_SIZE, i32(coord.y) - BLOCK_SIZE),
      sample_global(i32(coord.x) - BLOCK_SIZE, i32(coord.y)),
      sample_global(i32(coord.x) - BLOCK_SIZE, i32(coord.y) + BLOCK_SIZE),
    ),
    array<array<f32, IN_CHANNELS>, 3>(
      sample_global(i32(coord.x), i32(coord.y) - BLOCK_SIZE),
      sample_global(i32(coord.x), i32(coord.y)),
      sample_global(i32(coord.x), i32(coord.y) + BLOCK_SIZE),
    ),
    array<array<f32, IN_CHANNELS>, 3>(
      sample_global(i32(coord.x) + BLOCK_SIZE, i32(coord.y) - BLOCK_SIZE),
      sample_global(i32(coord.x) + BLOCK_SIZE, i32(coord.y)),
      sample_global(i32(coord.x) + BLOCK_SIZE, i32(coord.y) + BLOCK_SIZE),
    ),
  );

  var result = conv1Bias;

  for (var pass_idx: u32 = 0; pass_idx < PASSES; pass_idx++) {
    // // Since `tile` is a 3x3 grid of 8x8 tiles, we are filling each of the 9 tiles.
    let offset = pass_idx * CHANNELS_PER_TILE;
    let limit = min(offset + CHANNELS_PER_TILE, IN_CHANNELS);

    for (var in_channel = 0u; in_channel < limit - offset; in_channel++) {
      for (var x = 0u; x < 3u; x++) {
        for (var y = 0u; y < 3u; y++) {
          let tile_idx_x = TILE_PADDING - i32(BLOCK_SIZE) + i32(x) * BLOCK_SIZE + i32(lid.x);
          let tile_idx_y = TILE_PADDING - i32(BLOCK_SIZE) + i32(y) * BLOCK_SIZE + i32(lid.y);

          if (
            tile_idx_x >= 0 && tile_idx_x < BLOCK_SIZE + TILE_PADDING * 2 &&
            tile_idx_y >= 0 && tile_idx_y < BLOCK_SIZE + TILE_PADDING * 2
          ) {
            tile[tile_idx_x][tile_idx_y][in_channel] = whole_samples[x][y][in_channel + offset];
          }
        }
      }
    }

    // Waiting for the whole shared memory to be filled.
    workgroupBarrier();

    convolve(lid, offset, limit, &result);
    // convolve_global(coord, offset, limit, &result);

    if (RELU) {
      ReLU(&result);
    }

    // Waiting until we use stop convolving, to swap the tile.
    workgroupBarrier();
  }

  let outputBufferBegin =
    coord.y * uniforms.canvasSize.x * OUT_CHANNELS +
    coord.x * OUT_CHANNELS;

  for (var i: u32 = 0; i < OUT_CHANNELS; i++) {
    outputBuffer[outputBufferBegin + i] = result[i];
  }
}
