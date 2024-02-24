import { useEffect, useRef } from 'react';
import { GameEngine } from './gameEngine';

function GameViewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ReturnType<typeof GameEngine> | null>(null);

  useEffect(() => {
    if (engineRef.current || !canvasRef.current) {
      return;
    }

    engineRef.current = GameEngine(canvasRef.current);
  });

  /* Sometimes the pixel density varies from 1-to-1, so it might be double the resolution */
  return <canvas ref={canvasRef} width="256" height="256" />;
}

export default GameViewport;
