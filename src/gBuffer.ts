export class GBuffer {
  quarterTexture: GPUTexture; // used by Mender
  upscaledTexture: GPUTexture; // used by Mender
  rawRenderTexture: GPUTexture; // a render before any post-processing
  auxTexture: GPUTexture;

  quarterView: GPUTextureView;
  upscaledView: GPUTextureView;
  rawRenderView: GPUTextureView;
  auxView: GPUTextureView;

  targets = [
    // blurred
    { format: 'rgba8unorm' },
    // normal.xy, albedo_luminance, emission_luminance
    { format: 'rgba16float' },
  ] as const;

  auxClearValue = {
    r: 0, // normal.x
    g: 0, // normal.y
    b: 0, // albedo_luminance
    a: 0, // emission_luminance
  } as const;

  quarterSize: [number, number];

  constructor(device: GPUDevice, private _size: [number, number]) {
    this.quarterSize = [Math.floor(_size[0] / 4), Math.floor(_size[1] / 4)];

    this.quarterTexture = device.createTexture({
      size: this.quarterSize,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba8unorm',
    });

    this.upscaledTexture = device.createTexture({
      size: this.size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba8unorm',
    });

    this.rawRenderTexture = device.createTexture({
      size: this.size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba8unorm',
    });

    this.auxTexture = device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba16float',
    });

    this.quarterView = this.quarterTexture.createView();
    this.upscaledView = this.upscaledTexture.createView();
    this.rawRenderView = this.rawRenderTexture.createView();
    this.auxView = this.auxTexture.createView();
  }

  get size() {
    return this._size;
  }

  updateSize(size: [number, number]) {
    // TODO: Recreate textures.
    this._size = size;
  }
}
