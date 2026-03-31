"use client";

import { useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════
   MULTI-LAYER PARTICLE SYSTEM
   3 layers: fog · drift · reactive
   ═══════════════════════════════════════════════════ */

interface FogParticle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  opacity: number;
  phase: number;
  hue: number;
}

interface DriftParticle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  opacity: number;
  baseOpacity: number;
  phase: number;
  hue: number;
  flickerSpeed: number;
  flickerAmp: number;
}

interface ReactiveParticle {
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  opacity: number;
  baseX: number;
  baseY: number;
  hue: number;
  connected: boolean;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -2000, y: -2000, vx: 0, vy: 0, prevX: -2000, prevY: -2000 });
  const scrollY = useRef(0);
  const frame = useRef(0);
  const t = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true })!;
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio, 2);

    /* ── Resize ── */
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
    };
    resize();

    /* ── Particle factories ── */
    const rnd  = (min: number, max: number) => min + Math.random() * (max - min);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const HUES = [260, 270, 180, 190]; // violet + cyan spectrum

    /* Layer 1: FOG (3–8 large, slow, blurred blobs) */
    const fogCount = 5;
    const fog: FogParticle[] = Array.from({ length: fogCount }, () => ({
      x: rnd(0, W), y: rnd(0, H),
      vx: rnd(-0.08, 0.08), vy: rnd(-0.06, 0.06),
      radius: rnd(200, 380),
      opacity: rnd(0.012, 0.028),
      phase: rnd(0, Math.PI * 2),
      hue: pick(HUES),
    }));

    /* Layer 2: DRIFT (40–70 medium particles) */
    const driftCount = Math.min(Math.floor((W * H) / 14000), 65);
    const drift: DriftParticle[] = Array.from({ length: driftCount }, () => ({
      x: rnd(0, W), y: rnd(0, H),
      vx: rnd(-0.25, 0.25), vy: rnd(-0.18, 0.18),
      radius: rnd(1.2, 3.5),
      opacity: 0,
      baseOpacity: rnd(0.18, 0.45),
      phase: rnd(0, Math.PI * 2),
      hue: pick(HUES),
      flickerSpeed: rnd(0.8, 2.5),
      flickerAmp: rnd(0.04, 0.14),
    }));

    /* Layer 3: REACTIVE (20–35 small foreground particles) */
    const reactiveCount = Math.min(Math.floor((W * H) / 25000), 35);
    const reactive: ReactiveParticle[] = Array.from({ length: reactiveCount }, () => {
      const bx = rnd(0, W), by = rnd(0, H);
      return {
        x: bx, y: by,
        vx: rnd(-0.15, 0.15), vy: rnd(-0.15, 0.15),
        radius: rnd(0.8, 2.0),
        opacity: rnd(0.3, 0.6),
        baseX: bx, baseY: by,
        hue: pick(HUES),
        connected: false,
      };
    });

    /* ── Events ── */
    const onMouse = (e: MouseEvent) => {
      mouse.current.vx = e.clientX - mouse.current.prevX;
      mouse.current.vy = e.clientY - mouse.current.prevY;
      mouse.current.prevX = mouse.current.x;
      mouse.current.prevY = mouse.current.y;
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };
    const onScroll = () => { scrollY.current = window.scrollY; };
    const onLeave = () => { mouse.current.x = -2000; mouse.current.y = -2000; };

    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("scroll",    onScroll, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", resize);

    /* ── Draw helpers ── */
    function drawFogLayer() {
      for (const p of fog) {
        // Drift
        p.x += p.vx; p.y += p.vy;
        if (p.x < -p.radius)   p.x = W + p.radius;
        if (p.x > W + p.radius) p.x = -p.radius;
        if (p.y < -p.radius)   p.y = H + p.radius;
        if (p.y > H + p.radius) p.y = -p.radius;

        const breathing = p.opacity + Math.sin(t.current * 0.0003 + p.phase) * 0.008;

        // Radial gradient blob
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        const sat = p.hue < 200 ? 70 : 65;
        const lit = p.hue < 200 ? 65 : 60;
        grad.addColorStop(0,   `hsla(${p.hue}, ${sat}%, ${lit}%, ${breathing})`);
        grad.addColorStop(0.5, `hsla(${p.hue}, ${sat}%, ${lit}%, ${breathing * 0.3})`);
        grad.addColorStop(1,   `hsla(${p.hue}, ${sat}%, ${lit}%, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawDriftLayer() {
      const mx = mouse.current.x;
      const my = mouse.current.y;
      const mvx = mouse.current.vx;
      const mvy = mouse.current.vy;
      const scrollFactor = 1 + scrollY.current * 0.0003;

      for (const p of drift) {
        // Mouse velocity distortion
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 160 && dist > 0) {
          const force = (1 - dist / 160) * 0.35;
          // Attraction + velocity smear
          p.vx += (dx / dist) * force * 0.04 + mvx * force * 0.008;
          p.vy += (dy / dist) * force * 0.04 + mvy * force * 0.008;
        }

        // Dampen + drift
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx * scrollFactor;
        p.y += p.vy;

        // Wrap
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        // Flicker opacity
        p.opacity = p.baseOpacity
          + Math.sin(t.current * p.flickerSpeed * 0.001 + p.phase) * p.flickerAmp;

        // Glow near mouse
        const proximity = Math.max(0, 1 - dist / 200);
        const finalOpacity = Math.min(1, p.opacity + proximity * 0.3);

        // Core
        const sat = p.hue < 200 ? 75 : 70;
        const lit = p.hue < 200 ? 72 : 68;
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, ${sat}%, ${lit}%, ${finalOpacity})`;
        ctx.fill();

        // Soft corona
        if (p.radius > 2) {
          const coronaGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
          coronaGrad.addColorStop(0, `hsla(${p.hue}, ${sat}%, ${lit}%, ${finalOpacity * 0.15})`);
          coronaGrad.addColorStop(1, `hsla(${p.hue}, ${sat}%, ${lit}%, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
          ctx.fillStyle = coronaGrad;
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }

    function drawReactiveLayer() {
      const mx = mouse.current.x;
      const my = mouse.current.y;

      // Move + repulsion
      for (const p of reactive) {
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Repulsion zone
        if (dist < 120 && dist > 0) {
          const force = (1 - dist / 120) * 0.6;
          p.vx -= (dx / dist) * force * 0.3;
          p.vy -= (dy / dist) * force * 0.3;
        }

        // Gentle return to base
        p.vx += (p.baseX - p.x) * 0.002;
        p.vy += (p.baseY - p.y) * 0.002;
        p.vx *= 0.93;
        p.vy *= 0.93;

        p.x += p.vx;
        p.y += p.vy;
      }

      // Connection lines between nearby reactive particles
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < reactive.length; i++) {
        for (let j = i + 1; j < reactive.length; j++) {
          const a = reactive[i], b = reactive[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            const lineOp = (1 - dist / 100) * 0.06;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(124, 92, 252, ${lineOp})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of reactive) {
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boost = Math.max(0, 1 - dist / 160) * 0.5;
        const op = Math.min(1, p.opacity + boost);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 78%, ${op})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    /* ── Main loop ── */
    const animate = () => {
      t.current++;
      ctx.clearRect(0, 0, W, H);

      // Layer 1: Fog blobs (no composite needed)
      drawFogLayer();

      // Layer 2: Drift particles
      drawDriftLayer();

      // Layer 3: Reactive particles
      drawReactiveLayer();

      frame.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
