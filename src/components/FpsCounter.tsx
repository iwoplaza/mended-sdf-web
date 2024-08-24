import { useSyncExternalStore } from 'react';

class FPSCounterState {
  _fps = 0;
  subs = new Set<() => unknown>();

  constructor(interval = 1000) {
    const times: number[] = [];

    const refreshLoop = () => {
      window.requestAnimationFrame(() => {
        const now = performance.now();
        while (times.length > 0 && times[0] <= now - interval) {
          times.shift();
        }
        times.push(now);
        refreshLoop();
      });
    };

    refreshLoop();

    setInterval(() => {
      this.fps = times.length;
    }, interval);
  }

  get fps() {
    return this._fps;
  }

  set fps(value: number) {
    this._fps = value;

    for (const cb of this.subs) {
      cb();
    }
  }

  subscribe(callback: () => unknown) {
    this.subs.add(callback);

    return () => {
      this.subs.delete(callback);
    };
  }
}

const fpsCounterState = new FPSCounterState();

function subscribe(callback: () => unknown) {
  return fpsCounterState.subscribe(callback);
}

function getFPS() {
  return fpsCounterState.fps;
}

function FPSCounter() {
  const fps = useSyncExternalStore(subscribe, getFPS);

  return (
    <p className="text-xl text-white font-light">
      <span className="text-white/70">FPS:</span> {fps}
    </p>
  );
}

export default FPSCounter;
