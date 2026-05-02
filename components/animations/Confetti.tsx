"use client";

import { useEffect, useRef } from "react";

export interface ConfettiProps {
  active: boolean;
  onDone?: () => void;
}

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
  shape: "rect" | "circle";
  life: number;
};

export function Confetti({ active, onDone }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);

  // Keep latest onDone without retriggering the effect
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) return;

    // Reduced-motion fallback: skip animation entirely
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const t = setTimeout(() => onDoneRef.current?.(), 50);
      return () => clearTimeout(t);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const cx = W / 2;
    const cy = H * 0.45;
    const styles = getComputedStyle(document.documentElement);
    const colors = [
      "--tomato",
      "--gold",
      "--sage",
      "--ink",
      "--confetti-coral",
      "--tomato-soft",
      "--plum",
    ].map((name) => styles.getPropertyValue(name).trim());

    const particles: Particle[] = [];
    const burstTimers: ReturnType<typeof setTimeout>[] = [];

    const burst = (delay: number, ox: number, oy: number) => {
      const id = setTimeout(() => {
        for (let i = 0; i < 80; i++) {
          const angle =
            -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
          const speed = 6 + Math.random() * 14;
          particles.push({
            x: ox,
            y: oy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 3,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 0.4,
            size: 6 + Math.random() * 8,
            color: colors[Math.floor(Math.random() * colors.length)],
            shape: Math.random() > 0.5 ? "rect" : "circle",
            life: 1,
          });
        }
      }, delay);
      burstTimers.push(id);
    };

    burst(0, cx - 100, cy);
    burst(150, cx + 100, cy);
    burst(300, cx, cy - 30);

    const gravity = 0.32;
    const drag = 0.985;

    let frames = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.vy += gravity;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.life -= 0.005;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      frames++;
      if (frames < 240) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        onDoneRef.current?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      for (const id of burstTimers) clearTimeout(id);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  );
}
