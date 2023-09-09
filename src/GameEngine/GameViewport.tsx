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

  return <canvas ref={canvasRef} width="512" height="512" />;
}

export default GameViewport;
