const SCREEN_RECT = array<vec2f, 6>(
  vec2f(-1.0, -1.0),
  vec2f(1.0, -1.0),
  vec2f(-1.0, 1.0),

  vec2f(1.0, -1.0),
  vec2f(-1.0, 1.0),
  vec2f(1.0, 1.0),
);

struct Uniforms {
  canvasSize: vec2i,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var blurredAndAlbedo: texture_2d<f32>;
@group(0) @binding(2) var normalsAndDepth: texture_2d<f32>;

const CONV1_WEIGHTS: i32 = 64 * 9 * 9 * 7;
@group(1) @binding(0) var<storage, read> conv1Weight: array<f32, CONV1_WEIGHTS>;
@group(1) @binding(1) var<storage, read> conv1Bias: array<f32, 64>;

const CONV2_WEIGHTS: i32 = 32 * 5 * 5 * 64;
@group(2) @binding(0) var<storage, read> conv2Weight: array<f32, CONV2_WEIGHTS>;
@group(2) @binding(1) var<storage, read> conv2Bias: array<f32, 32>;

const CONV3_WEIGHTS: i32 = 3 * 5 * 5 * 32;
@group(3) @binding(0) var<storage, read> conv3Weight: array<f32, CONV3_WEIGHTS>;
@group(3) @binding(1) var<storage, read> conv3Bias: array<f32, 3>;


struct VertexOutput {
  @builtin(position) position: vec4<f32>,
}

@vertex
fn main_vert(
  @builtin(vertex_index) vertexIndex: u32
) -> VertexOutput {
  var output: VertexOutput;

  output.position = vec4(SCREEN_RECT[vertexIndex], 0.0, 1.0);

  return output;
}

/**
def convolve(input, output, filter, bias, kernel_size: int, dims: tuple[int, int], padding: int):
  width, height = dims

  # for out_c in range(1):
  for in_c in range(input.shape[0]):
    # for in_c in range(1):
    for i in range(width):
      for j in range(height):
        input_view = input[in_c, i:i+kernel_size, j:j+kernel_size]
        # Assuming same-padding
        for out_c in range(filter.shape[0]):
          print(out_c, in_c, i, j)

          output[out_c, i + padding, j + padding] = np.sum([
            input_view * filter[out_c, in_c, 0:kernel_size, 0:kernel_size]
          ]) + bias[out_c]
 */
const LAYER_0_CHANNELS = 7;
const LAYER_1_CHANNELS = 64;
fn convolve(coord: vec2i) -> array<f32, 64> {
  var result = conv1Bias;

  for (var out_c = 0; out_c < LAYER_1_CHANNELS; out_c++) {
    for (var i = -4; i <= 4; i++) {
      for (var j = -4; j <= 4; j++) {
        let off_coords = vec2i(coord.x + i, coord.y + j);

        let blurredAndAlbedoSample = textureLoad(
          blurredAndAlbedo,
          off_coords,
          0
        );

        var normalsAndDepthSample = textureLoad(
          normalsAndDepth,
          off_coords,
          0
        );

        var sample = array<f32, LAYER_0_CHANNELS>(
          blurredAndAlbedoSample.r,
          blurredAndAlbedoSample.g,
          blurredAndAlbedoSample.b,
          normalsAndDepthSample.a,
          normalsAndDepthSample.x,
          normalsAndDepthSample.y,
          blurredAndAlbedoSample.a,
        );

        for (var in_c = 0; in_c < LAYER_0_CHANNELS; in_c++) {
          result[out_c] += sample[in_c] * conv1Weight[
            out_c * 9 * 9 * 7 +
            i * 9 * 7 +
            j * 7 +
            in_c];
        }
      }
    }
  }

  return result;
}



@fragment
fn main_frag(
  @builtin(position) coord_f32: vec4f
) -> @location(0) vec4f {
  let coord = vec2i(floor(coord_f32.xy));

  let blurredAndAlbedoSample = textureLoad(
    blurredAndAlbedo,
    coord,
    0
  );

  var normalsAndDepthSample = textureLoad(
    normalsAndDepth,
    coord,
    0
  );

  let result = convolve(coord);
  // let result1 = convolve(coord);
  // let result2 = convolve(coord);

  normalsAndDepthSample.a = 1.0;

  let c = coord_f32.xy / vec2f(uniforms.canvasSize);

  // return vec4f(result[0] / 1000.0, result[1] / 1000.0, result[2] / 1000.0, 1.0);
  return vec4f(result[0], result[1], result[2], 1.0);
  // return blurredAndAlbedoSample;
}