import type { TypeGpuRuntime } from 'typegpu';

export class GBuffer {
  private quarterATexture: GPUTexture; // used by Mender (odd frames)
  private quarterBTexture: GPUTexture; // used by Mender (even frames)
  private upscaledTexture: GPUTexture; // used by Mender
  private rawRenderATexture: GPUTexture; // a render before any post-processing (odd frames)
  private rawRenderBTexture: GPUTexture; // a render before any post-processing (even frames)
  private auxTexture: GPUTexture;

  private _even = false;
  private _quarterAView: GPUTextureView;
  private _quarterBView: GPUTextureView;
  private _rawRenderAView: GPUTextureView;
  private _rawRenderBView: GPUTextureView;

  readonly upscaledView: GPUTextureView;
  readonly auxView: GPUTextureView;

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

  constructor(
    runtime: TypeGpuRuntime,
    private _size: [number, number],
  ) {
    this.quarterSize = [Math.floor(_size[0] / 4), Math.floor(_size[1] / 4)];

    this.quarterATexture = runtime.device.createTexture({
      size: this.quarterSize,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba8unorm',
    });

    this.quarterBTexture = runtime.device.createTexture({
      size: this.quarterSize,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba8unorm',
    });

    this.upscaledTexture = runtime.device.createTexture({
      size: this.size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      format: 'rgba8unorm',
    });

    this.rawRenderATexture = runtime.device.createTexture({
      size: this.size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba8unorm',
    });

    this.rawRenderBTexture = runtime.device.createTexture({
      size: this.size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba8unorm',
    });

    this.auxTexture = runtime.device.createTexture({
      size: _size,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      format: 'rgba16float',
    });

    this._quarterAView = this.quarterATexture.createView();
    this._quarterBView = this.quarterBTexture.createView();
    this.upscaledView = this.upscaledTexture.createView();
    this._rawRenderAView = this.rawRenderATexture.createView();
    this._rawRenderBView = this.rawRenderBTexture.createView();
    this.auxView = this.auxTexture.createView();
  }

  flip() {
    this._even = !this._even;
  }

  get inQuarterView(): GPUTextureView {
    return this._even ? this._quarterBView : this._quarterAView;
  }

  get outQuarterView(): GPUTextureView {
    return this._even ? this._quarterAView : this._quarterBView;
  }

  get inRawRenderView(): GPUTextureView {
    return this._even ? this._rawRenderBView : this._rawRenderAView;
  }

  get outRawRenderView(): GPUTextureView {
    return this._even ? this._rawRenderAView : this._rawRenderBView;
  }

  get size() {
    return this._size;
  }

  updateSize(size: [number, number]) {
    // TODO: Recreate textures.
    this._size = size;
  }
}
