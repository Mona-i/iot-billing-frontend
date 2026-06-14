'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

interface TelemetryDataPoint {
  timestamp: number;
  value: number;
}

interface TelemetryChartProps {
  data: TelemetryDataPoint[];
  metric: string;
  color?: string;
  height?: number;
  width?: number;
}

const BATCH_THROTTLE_MS = 500;

export function TelemetryChart({
  data,
  metric,
  color = '#00ff88',
  height = 200,
  width = 600,
}: TelemetryChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<TelemetryDataPoint[]>([]);
  const [batchedData, setBatchedData] = useState<TelemetryDataPoint[]>([]);
  const lastFlush = useRef(0);

  useEffect(() => {
    const now = Date.now();
    bufferRef.current = data;
    if (now - lastFlush.current >= BATCH_THROTTLE_MS) {
      setBatchedData([...bufferRef.current]);
      lastFlush.current = now;
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (bufferRef.current.length > 0) {
        setBatchedData(() => {
          const merged = [...bufferRef.current];
          return merged.length > 200 ? merged.slice(-200) : merged;
        });
      }
    }, BATCH_THROTTLE_MS);
    return () => clearInterval(interval);
  }, []);

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
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    if (batchedData.length < 2) return;

    const values = batchedData.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padding = 20;

    ctx.beginPath();
    batchedData.forEach((point, i) => {
      const x = padding + (i / (batchedData.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((point.value - min) / range) * (height - 2 * padding);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '12px monospace';
    ctx.fillText(`${metric}: ${values[values.length - 1]?.toFixed(2) ?? '0'}`, padding, 20);
  }, [batchedData, color, height, width, metric]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas ref={canvasRef} style={{ width, height }} aria-label={`${metric} telemetry chart`} />
  );
}
