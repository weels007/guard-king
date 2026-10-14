"use client";

import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  opacity?: number;
  speed?: number;
}

/**
 * Raycast animated blue background (local counterpart to the referenced
 * `raycast-animated-blue-background` slot component): rotating ray beams
 * over a dark field, drawn on canvas. Pauses offscreen; one still frame
 * when the user prefers reduced motion.
 */
export function Component({ className = "", opacity = 1, speed = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
      const w = Math.floor((canvas.clientWidth || window.innerWidth) * dpr);
      const h = Math.floor((canvas.clientHeight || window.innerHeight) * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const RAYS = 9;
    const frame = (t: number) => {
      const { width: w, height: h } = canvas;
      if (w === 0 || h === 0) return;
      const cx = w / 2;
      const cy = h * 0.62;
      const diag = Math.sqrt(w * w + h * h);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#020608";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < RAYS; i++) {
        const a = (i / RAYS) * Math.PI * 2 + t * 0.05 * speed;
        const spread = 0.16 + 0.05 * Math.sin(t * 0.3 + i);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, diag * 0.75);
        const alpha = 0.10 + 0.05 * Math.sin(t * 0.5 + i * 1.7);
        g.addColorStop(0, `rgba(56, 130, 200, ${alpha})`);
        g.addColorStop(0.5, `rgba(126, 227, 135, ${alpha * 0.35})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, diag * 0.75, a, a + spread);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // horizon glow
      const hg = ctx.createLinearGradient(0, cy - 40, 0, cy + 120);
      hg.addColorStop(0, "rgba(56,130,200,0)");
      hg.addColorStop(0.5, "rgba(56,130,200,0.12)");
      hg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(0, cy - 40, w, 160);
    };

    const onResize = () => resize();
    window.addEventListener("resize", onResize, { passive: true });
    resize();

    if (reduced) {
      frame(4.2);
    } else {
      const t0 = performance.now();
      const draw = () => {
        if (visible) frame((performance.now() - t0) / 1000);
        raf = requestAnimationFrame(draw);
      };
      const io = new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      }, { threshold: 0.02 });
      if (wrapRef.current) io.observe(wrapRef.current);
      draw();
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        io.disconnect();
      };
    }
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [speed]);

  return (
    <div ref={wrapRef} className={className} style={{ position: "absolute", inset: 0, opacity }} aria-hidden="true">
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block", background: "#020608" }} />
    </div>
  );
}

export default Component;
