import { store } from '../store';
import { GBuffer } from '../gBuffer';
import { MenderStep } from '../menderStep';
import { displayModeAtom } from '../DebugOptions';
import { makeGBufferDebugger } from './gBufferDebugger';
// import { GBufferMeshRenderer } from './gBufferMeshRenderer';
import { PostProcessingStep } from './postProcessingStep';
import { ResampleStep } from './resampleStep/resampleCubicStep';
import { SDFRenderer } from './sdfRenderer/sdfRenderer';
import { BlipDifferenceStep } from './blipDifferenceStep/blipDifferenceStep';
import { createRuntime } from 'typegpu';

export const GameEngine = async (canvas: HTMLCanvasElement) => {
  const runtime = await createRuntime();

  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gBuffer = new GBuffer(runtime, [canvas.width, canvas.height]);
  console.log(`Rendering a ${gBuffer.size[0]} by ${gBuffer.size[1]} image`);

  let sdfRenderer: Awaited<ReturnType<typeof SDFRenderer>>;
  let traditionalSdfRenderer: Awaited<ReturnType<typeof SDFRenderer>>;
  try {
    sdfRenderer = await SDFRenderer(runtime, gBuffer, true);
    traditionalSdfRenderer = await SDFRenderer(runtime, gBuffer, false);
  } catch (err) {
    console.error('Failed to initialize SDF renderers.');
    throw err;
  }
  // const gBufferMeshRenderer = new GBufferMeshRenderer(device, gBuffer);

  const upscaleStep = ResampleStep({
    runtime,
    targetFormat: 'rgba8unorm',
    sourceTexture: gBuffer.quarterView,
    targetTexture: gBuffer.upscaledView,
    sourceSize: gBuffer.quarterSize,
  });

  const menderStep = MenderStep({
    runtime,
    gBuffer,
    targetTexture: gBuffer.rawRenderView,
  });

  const gBufferDebugger = makeGBufferDebugger(
    runtime,
    presentationFormat,
    gBuffer,
  );

  const postProcessing = PostProcessingStep({
    runtime,
    context,
    gBuffer,
    presentationFormat,
  });

  let blipDifference: ReturnType<typeof BlipDifferenceStep>;
  try {
    blipDifference = BlipDifferenceStep({
      runtime,
      context,
      presentationFormat,
      textures: [gBuffer.upscaledView, gBuffer.rawRenderView],
    });
  } catch (err) {
    console.error('Failed to init BlipDifferenceStep');
    throw err;
  }

  context.configure({
    device: runtime.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  function frame() {
    const displayMode = store.get(displayModeAtom);

    // -- Rendering the whole scene & aux.
    if (displayMode === 'traditional' || displayMode === 'blur-diff') {
      traditionalSdfRenderer.perform();
    }

    if (
      displayMode === 'g-buffer' ||
      displayMode === 'blur-diff' ||
      displayMode === 'mended'
    ) {
      sdfRenderer.perform();
      // gBufferMeshRenderer.perform(device, commandEncoder);
    }

    // -- Upscaling the quarter-resolution render.
    upscaleStep.perform();

    // -- Displaying a result to the screen.
    if (displayMode === 'g-buffer') {
      gBufferDebugger.perform(context);
    } else if (displayMode === 'traditional') {
      postProcessing.perform();
    } else if (displayMode === 'mended') {
      // -- Restoring quality to the render using convolution.
      menderStep.perform();
      postProcessing.perform();
    } else if (displayMode === 'blur-diff') {
      blipDifference.perform();
    }

    runtime.flush();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};
