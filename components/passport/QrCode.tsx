"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#1a1150", light: "#ffffff" },
    }).catch(() => {});
  }, [value, size]);

  return <canvas ref={canvasRef} className={className} width={size} height={size} />;
}
