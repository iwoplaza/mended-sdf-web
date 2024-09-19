import { createRuntime } from 'typegpu';
import type { SetStateAction } from 'jotai';
import { store } from '../store';
import { GBuffer } from '../gBuffer';
import { MenderStep } from '../menderStep';
import {
  autoRotateControlAtom,
  displayModeAtom,
  measurePerformanceAtom,
  targetResolutionAtom,
} from '../controlAtoms';
import { makeGBufferDebugger } from './gBufferDebugger';
import { PostProcessingStep } from './postProcessingStep';
import { ResampleStep } from './resampleStep/resampleCubicStep';
import { accumulatedLayersAtom, SDFRenderer } from './sdfRenderer/sdfRenderer';
import { PerformanceManager } from '@/PerformanceManager';

class AlreadyDestroyedError extends Error {
  constructor() {
    super('This engine was already destroyed.');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, AlreadyDestroyedError.prototype);
  }
}

const settingsToPerf = new Map<string, PerformanceManager>();
// biome-ignore lint/suspicious/noExplicitAny: <hack>
(window as any).settingsToPerf = settingsToPerf;

const noteFrame = () => {
  if (!store.get(measurePerformanceAtom)) {
    // Only measuring performance when toggled.
    return;
  }

  const mode = store.get(displayModeAtom);
  const targetResolution = store.get(targetResolutionAtom);

  const key = `${mode} ${targetResolution}`;
  let perf = settingsToPerf.get(key);
  if (!perf) {
    perf = new PerformanceManager();
    settingsToPerf.set(key, perf);
  }

  perf.noteFrame();
};

export const GameEngine = (
  canvas: HTMLCanvasElement,
  targetResolution: number,
) => {
  let destroyed = false;
  const cleanups: (() => unknown)[] = [];

  store.set(accumulatedLayersAtom, 0 as SetStateAction<number>);

  const addCleanup = (cb: () => unknown) => {
    if (destroyed) {
      cb();
      throw new AlreadyDestroyedError();
    }
    cleanups.push(cb);
  };

  (async () => {
    const runtime = await createRuntime();
    addCleanup(() => runtime.dispose());

    const context = canvas.getContext('webgpu') as GPUCanvasContext;

    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.style.width = `${targetResolution / devicePixelRatio}px`;
    canvas.style.height = `${targetResolution / devicePixelRatio}px`;
    canvas.width = targetResolution;
    canvas.height = targetResolution;
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

    const gBuffer = new GBuffer(runtime, [targetResolution, targetResolution]);
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

    const upscaleStep = ResampleStep({
      runtime,
      targetFormat: 'rgba8unorm',
      sourceTexture: () => gBuffer.outQuarterView,
      targetTexture: gBuffer.upscaledView,
      sourceSize: gBuffer.quarterSize,
    });

    const menderStep = MenderStep({
      runtime,
      gBuffer,
      targetTexture: () => gBuffer.outRawRenderView,
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

    context.configure({
      device: runtime.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    function frame() {
      if (destroyed) {
        return;
      }

      noteFrame();

      const displayMode = store.get(displayModeAtom);

      // -- Rendering the whole scene & aux.
      if (displayMode === 'traditional') {
        traditionalSdfRenderer.perform();
        runtime.flush();
      }

      if (
        displayMode === 'g-buffer' ||
        displayMode === 'g-buffer-color' ||
        displayMode === 'g-buffer-albedo' ||
        displayMode === 'g-buffer-normal' ||
        displayMode === 'upscaled'
      ) {
        sdfRenderer.perform();
        runtime.flush();
      }

      // -- Upscaling the quarter-resolution render.
      upscaleStep.perform();

      // -- Displaying a result to the screen.
      if (
        displayMode === 'g-buffer' ||
        displayMode === 'g-buffer-color' ||
        displayMode === 'g-buffer-albedo' ||
        displayMode === 'g-buffer-normal'
      ) {
        gBufferDebugger.perform(context);
      } else if (displayMode === 'traditional') {
        postProcessing.perform();
      } else if (displayMode === 'upscaled') {
        // -- Restoring quality to the render using convolution.
        menderStep.perform();
        postProcessing.perform();
      }

      runtime.flush();
      gBuffer.flip();
      if (store.get(autoRotateControlAtom)) {
        store.set(accumulatedLayersAtom, 0 as SetStateAction<number>);
      } else {
        store.set(
          accumulatedLayersAtom,
          (store.get(accumulatedLayersAtom) + 1) as SetStateAction<number>,
        );
      }
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  })().catch((e) => {
    if (e instanceof AlreadyDestroyedError) {
      // Expected to happen
    } else {
      console.error(e);
    }
  });

  return {
    destroy() {
      destroyed = true;
      for (const cb of cleanups) {
        cb();
      }
    },
  };
};
