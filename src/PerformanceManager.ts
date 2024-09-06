export class PerformanceManager {
  private _deltaTimeMeasurements: number[] = [];

  private _lastTime: null | number = null;

  public noteFrame() {
    const now = Date.now();

    if (this._lastTime === null) {
      this._lastTime = now;
      return;
    }

    const deltaTime = now - this._lastTime;
    this._deltaTimeMeasurements.push(deltaTime);
    this._lastTime = now;

    // Logging every 100 measurements.
    if (
      this._deltaTimeMeasurements.length ===
      Math.floor(this._deltaTimeMeasurements.length / 100) * 100
    ) {
      console.log(`Did ${this._deltaTimeMeasurements.length} measurements.`);
    }
  }

  toJson() {
    return JSON.stringify(this._deltaTimeMeasurements);
  }
}
