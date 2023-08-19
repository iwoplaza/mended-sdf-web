import { EdgeDetectionStep } from './edgeDetectionStep';
import { GBufferDebugger } from './gBufferDebugger';
import { GBufferMeshRenderer } from './gBufferMeshRenderer';
import { PostProcessingStep } from './postProcessingStep';
import { ResampleStep } from './resampleStep/resampleStep';
import { store } from '../store';
import { GBuffer } from '../gBuffer';
import { showPartialRendersAtom } from '../DebugOptions';
import { MenderStep } from '../menderStep';

export const GameEngine = async (canvas: HTMLCanvasElement) => {
  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    throw new Error(`Null GPU adapter`);
  }

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxComputeWorkgroupStorageSize: 32768,
    },
  });

  const context = canvas.getContext('webgpu') as GPUCanvasContext;

  const devicePixelRatio = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const gBuffer = new GBuffer(device, [canvas.width, canvas.height]);

  //
  // Mender result buffer
  //

  const menderResultBuffer = device.createBuffer({
    label: 'Mender Result Buffer',
    size:
      gBuffer.size[0] * gBuffer.size[1] * 3 * Float32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });

  //

  const gBufferMeshRenderer = new GBufferMeshRenderer(device, gBuffer);

  const upscaleStep = ResampleStep({
    device,
    sourceSize: gBuffer.quarterSize,
    targetFormat: 'rgba8unorm',
    sourceTexture: gBuffer.quarterView,
    targetTexture: gBuffer.upscaledView,
  });

  const edgeDetectionStep = EdgeDetectionStep({
    device,
    gBuffer,
    menderResultBuffer,
  });
  const menderStep = MenderStep({ device, gBuffer, menderResultBuffer });

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
    menderResultBuffer,
  });

  context.configure({
    device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  function frame() {
    const commandEncoder = device.createCommandEncoder();

    // -- Rendering the whole scene & aux.
    gBufferMeshRenderer.perform(device, commandEncoder);

    // -- Upscaling the quarter-resolution render.
    upscaleStep.perform(commandEncoder);

    // -- Displaying a result to the screen.
    if (store.get(showPartialRendersAtom)) {
      gBufferDebugger.perform(context, commandEncoder);
    } else {
      // -- Restoring quality to the render using convolution.
      // edgeDetectionStep.perform(commandEncoder);
      menderStep.perform(commandEncoder);

      postProcessing.perform(commandEncoder);
    }

    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
};
