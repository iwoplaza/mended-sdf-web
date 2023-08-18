struct Uniforms {
  canvasSize: vec2u,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var blurredTexture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> mendedBuffer: array<f32>;

const mendedBufferDimension = 3;

@fragment
fn main(
  @builtin(position) coord_f32 : vec4<f32>
) -> @location(0) vec4<f32> {
  var coord = vec2u(floor(coord_f32.xy));

  let blurred = textureLoad(
    blurredTexture,
    coord,
    0
  );
  
  let buffer_idx = coord.y * uniforms.canvasSize.x + coord.x;
  let mended = vec3f(
    mendedBuffer[buffer_idx * mendedBufferDimension + min(0, mendedBufferDimension - 1)],
    mendedBuffer[buffer_idx * mendedBufferDimension + min(1, mendedBufferDimension - 1)],
    mendedBuffer[buffer_idx * mendedBufferDimension + min(2, mendedBufferDimension - 1)],
  );

  // return vec4f(abs(mended.rgb), 1.0);
  return vec4f(blurred.rgb + mended.rgb, 1.0);
}
