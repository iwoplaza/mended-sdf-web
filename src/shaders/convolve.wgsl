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
const BLOCK_SIZE = 4;

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
var<workgroup> tile: array<array<array<f32, 32>, BLOCK_SIZE + 8>, BLOCK_SIZE + 8>;

fn convolve(local: vec2u, in_channel_begin: u32, in_channel_end: u32, result: ptr<function, array<f32, OUT_CHANNELS>>) {
  var weight_idx: u32 = 0;
  for (var out_c: u32 = 0; out_c < OUT_CHANNELS; out_c++) {
    for (var i: u32 = 4-KERNEL_RADIUS; i <= 4+KERNEL_RADIUS; i++) {
      for (var j: u32 = 4-KERNEL_RADIUS; j <= 4+KERNEL_RADIUS; j++) {

        weight_idx += in_channel_begin;
        for (var in_c: u32 = in_channel_begin; in_c < in_channel_end; in_c++) {
          (*result)[out_c] += tile[local.x + i][local.y + j][in_c] * conv1Weight[weight_idx];
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
    for (var i: u32 = 4-KERNEL_RADIUS; i <= 4+KERNEL_RADIUS; i++) {
      for (var j: u32 = 4-KERNEL_RADIUS; j <= 4+KERNEL_RADIUS; j++) {
        let sample = sample_global(coord.x + i, coord.y + j);

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

fn sample_global(x: u32, y: u32) -> array<f32, IN_CHANNELS> {
  let coord = vec2u(
    max(0, min(x, uniforms.canvasSize.x - 1)),
    max(0, min(y, uniforms.canvasSize.y - 1)),
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
        y * uniforms.canvasSize.x * IN_CHANNELS +
        x * IN_CHANNELS +
        i;
      
      sample[i] = inputBuffer[index];
    }

    return sample;
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
      sample_global(coord.x - BLOCK_SIZE, coord.y - BLOCK_SIZE),
      sample_global(coord.x - BLOCK_SIZE, coord.y),
      sample_global(coord.x - BLOCK_SIZE, coord.y + BLOCK_SIZE),
    ),
    array<array<f32, IN_CHANNELS>, 3>(
      sample_global(coord.x, coord.y - BLOCK_SIZE),
      sample_global(coord.x, coord.y),
      sample_global(coord.x, coord.y + BLOCK_SIZE),
    ),
    array<array<f32, IN_CHANNELS>, 3>(
      sample_global(coord.x + BLOCK_SIZE, coord.y - BLOCK_SIZE),
      sample_global(coord.x + BLOCK_SIZE, coord.y),
      sample_global(coord.x + BLOCK_SIZE, coord.y + BLOCK_SIZE),
    ),
  );

  var result = conv1Bias;

  for (var pass_idx: u32 = 0; pass_idx < PASSES; pass_idx++) {
    // Since `tile` is a 3x3 grid of 8x8 tiles, we are filling each of the 9 tiles.
    for (var x = 0u; x < 3u; x++) {
      for (var y = 0u; y < 3u; y++) {
        let tile_idx_x = lid.x + x * 8;
        let tile_idx_y = lid.y + y * 8;

        let offset = pass_idx * CHANNELS_PER_TILE;
        let limit = min(offset + CHANNELS_PER_TILE, IN_CHANNELS);
        for (var i = 0u; i < limit - offset; i++) {
          tile[tile_idx_x][tile_idx_y][i] = whole_samples[x][y][i + offset];
        }
      }
    }

    // Waiting for the whole shared memory to be filled.
    workgroupBarrier();

    // convolve(lid, 0, IN_CHANNELS, &result);
    convolve_global(coord, 0, IN_CHANNELS, &result);

    // Waiting until we use stop convolving, to swap the tile.
    workgroupBarrier();
  }

  // let index =
  //   coord.y * uniforms.canvasSize.x +
  //   coord.x;
  
  // outputBuffer[index] = result[0];

  for (var i: u32 = 0; i < OUT_CHANNELS; i++) {
    let index =
      coord.y * uniforms.canvasSize.x * OUT_CHANNELS +
      coord.x * OUT_CHANNELS +
      i;
    
    outputBuffer[index] = result[i];
  }
}
