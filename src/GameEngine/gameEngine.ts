import { GBufferDebugger } from './gBufferDebugger';
import { GBufferMeshRenderer } from './gBufferMeshRenderer';
import { PostProcessingStep } from './postProcessingStep';
import { ResampleStep } from './resampleStep/resampleCubicStep';
import { store } from '../store';
import { GBuffer } from '../gBuffer';
import { displayModeAtom } from '../DebugOptions';
import { MenderStep } from '../menderStep';
import { SDFRenderer } from './sdfRenderer/sdfRenderer';
import { BlipDifferenceStep } from './blipDifferenceStep/blipDifferenceStep';

export const GameEngine = async (canvas: HTMLCanvasElement) => {
  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    throw new Error(`Null GPU adapter`);
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gBuffer = new GBuffer(device, [canvas.width, canvas.height]);
  console.log(`Rendering a ${gBuffer.size[0]} by ${gBuffer.size[1]} image`);

  const sdfRenderer = SDFRenderer(device, gBuffer, true);
  const traditionalSdfRenderer = SDFRenderer(device, gBuffer, false);
  const gBufferMeshRenderer = new GBufferMeshRenderer(device, gBuffer);

  const upscaleStep = ResampleStep({
    device,
    targetFormat: 'rgba8unorm',
    sourceTexture: gBuffer.quarterView,
    targetTexture: gBuffer.upscaledView,
    sourceSize: gBuffer.quarterSize,
  });

  const menderStep = MenderStep({
    device,
    gBuffer,
    targetTexture: gBuffer.rawRenderView,
  });

  const gBufferDebugger = new GBufferDebugger(
    device,
    presentationFormat,
    gBuffer,
  );

  const postProcessing = PostProcessingStep({
    device,
    context,
    gBuffer,
    presentationFormat,
  });

  const blipDifference = BlipDifferenceStep({
    device,
    context,
    presentationFormat,
    textures: [gBuffer.upscaledView, gBuffer.rawRenderView],
  });

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  function frame() {
    const displayMode = store.get(displayModeAtom);
    const commandEncoder = device.createCommandEncoder();

    // -- Rendering the whole scene & aux.
    if (displayMode === 'traditional' || displayMode === 'blur-diff') {
      traditionalSdfRenderer.perform(commandEncoder);
    }

    if (
      displayMode === 'g-buffer' ||
      displayMode === 'blur-diff' ||
      displayMode === 'mended'
    ) {
      sdfRenderer.perform(commandEncoder);
      // gBufferMeshRenderer.perform(device, commandEncoder);
    }

    // -- Upscaling the quarter-resolution render.
    upscaleStep.perform(commandEncoder);

    // -- Displaying a result to the screen.
    if (displayMode === 'g-buffer') {
      gBufferDebugger.perform(context, commandEncoder);
    } else if (displayMode === 'traditional') {
      postProcessing.perform(commandEncoder);
    } else if (displayMode === 'mended') {
      // -- Restoring quality to the render using convolution.
      menderStep.perform(commandEncoder);
      postProcessing.perform(commandEncoder);
    } else if (displayMode === 'blur-diff') {
      blipDifference.perform(commandEncoder);
    }

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};
