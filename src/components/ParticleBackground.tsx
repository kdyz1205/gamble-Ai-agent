"use client";

import { useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════
   QUANTUM ENERGY FIELD — Multi-layer Particle System
   4 layers: nebula · fog · drift · reactive
   + energy connections + mouse attraction field
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
  energy: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -2000, y: -2000, vx: 0, vy: 0, prevX: -2000, prevY: -2000, active: false });
  const scrollY = useRef(0);
  const frame = useRef(0);
  const t = useRef(0);
  const clickPulse = useRef({ x: 0, y: 0, t: 0, active: false });

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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    /* ── Particle factories ── */
    const rnd  = (min: number, max: number) => min + Math.random() * (max - min);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const HUES = [40, 42, 45, 48, 190, 195]; // gold + oracle-blue spectrum

    /* Layer 1: FOG (large, slow, blurred blobs) */
    const fogCount = 6;
    const fog: FogParticle[] = Array.from({ length: fogCount }, () => ({
      x: rnd(0, W), y: rnd(0, H),
      vx: rnd(-0.08, 0.08), vy: rnd(-0.06, 0.06),
      radius: rnd(200, 420),
      opacity: rnd(0.012, 0.03),
      phase: rnd(0, Math.PI * 2),
      hue: pick(HUES),
    }));

    /* Layer 2: DRIFT (medium particles) */
    const driftCount = Math.min(Math.floor((W * H) / 13000), 70);
    const drift: DriftParticle[] = Array.from({ length: driftCount }, () => ({
      x: rnd(0, W), y: rnd(0, H),
      vx: rnd(-0.25, 0.25), vy: rnd(-0.18, 0.18),
      radius: rnd(1.0, 3.8),
      opacity: 0,
      baseOpacity: rnd(0.15, 0.45),
      phase: rnd(0, Math.PI * 2),
      hue: pick(HUES),
      flickerSpeed: rnd(0.8, 2.5),
      flickerAmp: rnd(0.04, 0.14),
    }));

    /* Layer 3: REACTIVE (small foreground particles with energy connections) */
    const reactiveCount = Math.min(Math.floor((W * H) / 22000), 40);
    const reactive: ReactiveParticle[] = Array.from({ length: reactiveCount }, () => {
      const bx = rnd(0, W), by = rnd(0, H);
      return {
        x: bx, y: by,
        vx: rnd(-0.15, 0.15), vy: rnd(-0.15, 0.15),
        radius: rnd(0.8, 2.2),
        opacity: rnd(0.3, 0.65),
        baseX: bx, baseY: by,
        hue: pick(HUES),
        connected: false,
        energy: 0,
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
      mouse.current.active = true;
    };
    const onScroll = () => { scrollY.current = window.scrollY; };
    const onLeave = () => { mouse.current.active = false; mouse.current.x = -2000; mouse.current.y = -2000; };
    const onClick = (e: MouseEvent) => {
      clickPulse.current = { x: e.clientX, y: e.clientY, t: t.current, active: true };
    };

    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("scroll",    onScroll, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("resize", resize);
    window.addEventListener("click", onClick, { passive: true });

    /* ── Draw helpers ── */
    function drawFogLayer() {
      for (const p of fog) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -p.radius)   p.x = W + p.radius;
        if (p.x > W + p.radius) p.x = -p.radius;
        if (p.y < -p.radius)   p.y = H + p.radius;
        if (p.y > H + p.radius) p.y = -p.radius;

        const breathing = p.opacity + Math.sin(t.current * 0.0003 + p.phase) * 0.008;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        const sat = p.hue < 200 ? 70 : 65;
        const lit = p.hue < 200 ? 65 : 60;
        grad.addColorStop(0,   `hsla(${p.hue}, ${sat}%, ${lit}%, ${breathing})`);
        grad.addColorStop(0.4, `hsla(${p.hue}, ${sat}%, ${lit}%, ${breathing * 0.4})`);
        grad.addColorStop(1,   `hsla(${p.hue}, ${sat}%, ${lit}%, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawMouseField() {
      if (!mouse.current.active) return;
      const mx = mouse.current.x;
      const my = mouse.current.y;

      // Attraction field visualization
      const fieldGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 180);
      fieldGrad.addColorStop(0,   `hsla(43, 74%, 52%, 0.03)`);
      fieldGrad.addColorStop(0.5, `hsla(43, 74%, 52%, 0.01)`);
      fieldGrad.addColorStop(1,   `hsla(43, 74%, 52%, 0)`);
      ctx.fillStyle = fieldGrad;
      ctx.beginPath();
      ctx.arc(mx, my, 180, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawClickPulse() {
      const cp = clickPulse.current;
      if (!cp.active) return;

      const age = (t.current - cp.t) * 0.02;
      if (age > 1) { cp.active = false; return; }

      const radius = age * 120;
      const op = (1 - age) * 0.25;

      ctx.globalCompositeOperation = "lighter";
      const grad = ctx.createRadialGradient(cp.x, cp.y, 0, cp.x, cp.y, radius);
      grad.addColorStop(0, `hsla(43, 74%, 52%, 0)`);
      grad.addColorStop(0.6, `hsla(43, 74%, 52%, ${op})`);
      grad.addColorStop(0.85, `hsla(190, 100%, 22%, ${op * 0.5})`);
      grad.addColorStop(1, `hsla(43, 74%, 52%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    function drawDriftLayer() {
      const mx = mouse.current.x;
      const my = mouse.current.y;
      const mvx = mouse.current.vx;
      const mvy = mouse.current.vy;
      const scrollFactor = 1 + scrollY.current * 0.0003;

      for (const p of drift) {
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 180 && dist > 0) {
          const force = (1 - dist / 180) * 0.35;
          p.vx += (dx / dist) * force * 0.04 + mvx * force * 0.008;
          p.vy += (dy / dist) * force * 0.04 + mvy * force * 0.008;
        }

        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx * scrollFactor;
        p.y += p.vy;

        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        p.opacity = p.baseOpacity
          + Math.sin(t.current * p.flickerSpeed * 0.001 + p.phase) * p.flickerAmp;

        const proximity = Math.max(0, 1 - dist / 220);
        const finalOpacity = Math.min(1, p.opacity + proximity * 0.35);

        const sat = p.hue < 200 ? 75 : 70;
        const lit = p.hue < 200 ? 72 : 68;
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, ${sat}%, ${lit}%, ${finalOpacity})`;
        ctx.fill();

        if (p.radius > 1.8) {
          const coronaGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 5);
          coronaGrad.addColorStop(0, `hsla(${p.hue}, ${sat}%, ${lit}%, ${finalOpacity * 0.12})`);
          coronaGrad.addColorStop(1, `hsla(${p.hue}, ${sat}%, ${lit}%, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 5, 0, Math.PI * 2);
          ctx.fillStyle = coronaGrad;
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }
    }

    function drawReactiveLayer() {
      const mx = mouse.current.x;
      const my = mouse.current.y;

      for (const p of reactive) {
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Repulsion zone
        if (dist < 130 && dist > 0) {
          const force = (1 - dist / 130) * 0.6;
          p.vx -= (dx / dist) * force * 0.3;
          p.vy -= (dy / dist) * force * 0.3;
          p.energy = Math.min(1, p.energy + 0.05);
        } else {
          p.energy *= 0.98;
        }

        // Gentle return to base
        p.vx += (p.baseX - p.x) * 0.002;
        p.vy += (p.baseY - p.y) * 0.002;
        p.vx *= 0.93;
        p.vy *= 0.93;

        p.x += p.vx;
        p.y += p.vy;
      }

      // Energy connection lines between nearby reactive particles
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < reactive.length; i++) {
        for (let j = i + 1; j < reactive.length; j++) {
          const a = reactive[i], b = reactive[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const lineOp = (1 - dist / 120) * 0.08;
            const energyBoost = (a.energy + b.energy) * 0.5;
            const finalOp = lineOp + energyBoost * 0.1;

            // Gradient line from particle a's hue to b's hue
            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0, `hsla(${a.hue}, 80%, 70%, ${finalOp})`);
            grad.addColorStop(1, `hsla(${b.hue}, 80%, 70%, ${finalOp})`);

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 0.5 + energyBoost * 0.8;
            ctx.stroke();
          }
        }
      }

      // Draw particles with energy glow
      for (const p of reactive) {
        const dx = mx - p.x, dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boost = Math.max(0, 1 - dist / 160) * 0.5;
        const op = Math.min(1, p.opacity + boost);

        // Energy glow ring when energized
        if (p.energy > 0.1) {
          const glowR = p.radius * (3 + p.energy * 6);
          const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
          glowGrad.addColorStop(0, `hsla(${p.hue}, 90%, 75%, ${p.energy * 0.2})`);
          glowGrad.addColorStop(1, `hsla(${p.hue}, 90%, 75%, 0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + p.energy * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 78%, ${op})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    /* ── Main loop ── */
    const animate = () => {
      t.current++;
      ctx.clearRect(0, 0, W, H);

      drawFogLayer();
      drawMouseField();
      drawClickPulse();
      drawDriftLayer();
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
      window.removeEventListener("click", onClick);
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
