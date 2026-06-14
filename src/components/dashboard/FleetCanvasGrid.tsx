'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { FleetView } from '@/types';

interface FleetCanvasGridProps {
  fleets: FleetView[];
  cellSize?: number;
}

export function FleetCanvasGrid({ fleets, cellSize = 80 }: FleetCanvasGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cols = Math.ceil(Math.sqrt(fleets.length));
  const rows = Math.ceil(fleets.length / cols);
  const width = cols * cellSize;
  const height = rows * cellSize;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    fleets.forEach((fleet, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellSize;
      const y = row * cellSize;

      const statusColor =
        fleet.status === 'active' ? '#00ff88' : fleet.status === 'degraded' ? '#ffaa00' : '#ff4444';

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);

      ctx.fillStyle = statusColor;
      ctx.font = 'bold 10px monospace';
      ctx.fillText(fleet.name.slice(0, 8), x + 4, y + 14);
      ctx.fillText(`${fleet.activeCount}/${fleet.deviceCount}`, x + 4, y + 28);
      ctx.font = '9px monospace';
      ctx.fillText(`${fleet.totalPowerOutput.toFixed(0)}W`, x + 4, y + 42);
    });
  }, [fleets, cols, cellSize, width, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="rounded-lg"
      aria-label={`Fleet grid with ${fleets.length} fleets`}
    />
  );
}
