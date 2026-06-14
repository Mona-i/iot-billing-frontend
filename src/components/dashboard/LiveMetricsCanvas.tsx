'use client';

import { useRef, useEffect, useCallback } from 'react';

interface MetricsFrame {
  timestamp: number;
  values: Record<string, number>;
}

interface LiveMetricsCanvasProps {
  stream: MetricsFrame[];
  metrics: string[];
  height?: number;
}

export function LiveMetricsCanvas({ stream, metrics, height = 300 }: LiveMetricsCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void)[]>([]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const colors = ['#00ff88', '#ff8800', '#4488ff', '#ff4488', '#88ff44'];
    const padding = 10;

    metrics.forEach((metric, idx) => {
      const points = stream
        .map((f) => ({ t: f.timestamp, v: f.values[metric] as number | undefined }))
        .filter((p): p is { t: number; v: number } => p.v !== undefined);

      if (points.length < 2) return;

      const values = points.map((p) => p.v);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;

      ctx.strokeStyle = colors[idx % colors.length] ?? '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      points.forEach((p, i) => {
        const x = padding + (i / (points.length - 1)) * (w - 2 * padding);
        const y = h - padding - ((p.v - min) / range) * (h - 2 * padding);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();
    });
  }, [stream, metrics, height]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      drawFrame();
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();

    cleanupRef.current.push(() => {
      running = false;
      cancelAnimationFrame(animationRef.current);
    });

    return () => {
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
    };
  }, [drawFrame]);

  return (
    <div ref={containerRef} className="relative w-full">
      <canvas ref={canvasRef} className="block w-full" aria-label="Live metrics canvas" />
    </div>
  );
}
