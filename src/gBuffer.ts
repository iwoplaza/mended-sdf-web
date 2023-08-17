export class GBuffer {
  quarterTexture: GPUTexture;
  upscaledTexture: GPUTexture;
  auxTexture: GPUTexture;

  quarterView: GPUTextureView;
  upscaledView: GPUTextureView;
  auxView: GPUTextureView;

  targets = [
    // blurred
    { format: 'rgba8unorm' },
    // depth & normal.xy & luminance
    { format: 'rgba16float' },
  ] as const;

  quarterSize: [number, number];

  constructor(device: GPUDevice, private _size: [number, number]) {
    this.quarterSize = [Math.floor(_size[0] / 4), Math.floor(_size[1] / 4)];

    this.quarterTexture = device.createTexture({
      size: this.quarterSize,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba8unorm',
    });

    this.upscaledTexture = device.createTexture({
      size: this.size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba8unorm',
    });

    this.auxTexture = device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba16float',
    });

    this.quarterView = this.quarterTexture.createView();
    this.upscaledView = this.upscaledTexture.createView();
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
