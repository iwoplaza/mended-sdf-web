export class FPSCounter {
  _fps: number = 0;

  constructor(private containerElement: HTMLElement, interval: number = 1000) {
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
    }

    refreshLoop();

    setInterval(() => {
      this.fps = times.length;
    }, interval);
  }

  set fps(value: number) {
    this.containerElement.innerHTML = `FPS: <span>${value}</span>`;
  }
}