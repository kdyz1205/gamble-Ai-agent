"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";

interface SummonsWorldEffectsProps {
  className?: string;
  style?: CSSProperties;
  variant?: "world" | "synergy";
}

export default function SummonsWorldEffects({ className = "", style, variant = "world" }: SummonsWorldEffectsProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!window.matchMedia("(min-width: 640px)").matches || window.getComputedStyle(host).display === "none") return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    host.appendChild(renderer.domElement);
    let contextLost = false;
    const markContextLost = () => {
      contextLost = true;
    };
    renderer.domElement.addEventListener("webglcontextlost", markContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.set(0, 0, variant === "world" ? 6.6 : 5.2);

    const group = new THREE.Group();
    group.position.x = variant === "world" ? 0.2 : 0;
    group.position.y = variant === "world" ? 0.02 : 0;
    scene.add(group);

    const particleCount = variant === "world" ? 190 : 96;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const magenta = new THREE.Color("#ff4fbd");
    const violet = new THREE.Color("#8b3dff");
    const mint = new THREE.Color("#00f0b5");

    for (let index = 0; index < particleCount; index += 1) {
      const angle = index * 2.399963229728653;
      const shell = 0.34 + ((index * 29) % 100) / 82;
      const radius = variant === "world" ? shell * 1.74 : shell * 1.2;
      const yBand = Math.sin(index * 0.63) * (variant === "world" ? 0.62 : 0.34);
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = yBand;
      positions[index * 3 + 2] = Math.sin(angle) * radius * (variant === "world" ? 0.36 : 0.2);

      const tone = index % 11 === 0 ? mint : index % 3 === 0 ? violet : magenta;
      const mixed = magenta.clone().lerp(tone, (index % 13) / 18);
      colors[index * 3] = mixed.r;
      colors[index * 3 + 1] = mixed.g;
      colors[index * 3 + 2] = mixed.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        size: variant === "world" ? 0.034 : 0.042,
        transparent: true,
        opacity: variant === "world" ? 0.78 : 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    group.add(particles);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: variant === "world" ? "#ff72cf" : "#00f0b5",
      transparent: true,
      opacity: variant === "world" ? 0.2 : 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const linePositions = new Float32Array((variant === "world" ? 42 : 28) * 2 * 3);
    for (let segment = 0; segment < linePositions.length / 6; segment += 1) {
      const a = (segment * 7) % particleCount;
      const b = (segment * 7 + 19) % particleCount;
      linePositions.set(positions.slice(a * 3, a * 3 + 3), segment * 6);
      linePositions.set(positions.slice(b * 3, b * 3 + 3), segment * 6 + 3);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    group.add(lines);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: variant === "world" ? "#ff4fbd" : "#8b3dff",
      transparent: true,
      opacity: variant === "world" ? 0.18 : 0.24,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(variant === "world" ? 2.14 : 1.58, 0.004, 6, 144), ringMaterial);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(variant === "world" ? 1.36 : 1.02, 0.004, 6, 120), ringMaterial.clone());
    ringA.rotation.x = variant === "world" ? 1.08 : 1.22;
    ringB.rotation.x = variant === "world" ? 1.42 : 1.54;
    group.add(ringA, ringB);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const start = window.performance.now();
    let frameId = 0;
    const animate = () => {
      const elapsed = (window.performance.now() - start) / 1000;
      group.rotation.y = Math.sin(elapsed * 0.18) * 0.12;
      particles.rotation.z = elapsed * (variant === "world" ? 0.045 : 0.075);
      lines.rotation.z = -elapsed * 0.026;
      ringA.rotation.z = elapsed * 0.08;
      ringB.rotation.z = -elapsed * 0.11;
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", markContextLost);
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      const canDispose = !contextLost && !renderer.getContext().isContextLost();
      if (canDispose) {
        particleGeometry.dispose();
        (particles.material as THREE.Material).dispose();
        lineGeometry.dispose();
        lineMaterial.dispose();
        ringA.geometry.dispose();
        ringB.geometry.dispose();
        ringMaterial.dispose();
        (ringB.material as THREE.Material).dispose();
        renderer.dispose();
      }
    };
  }, [variant]);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      data-testid={`summons-webgl-${variant}`}
      style={style}
    />
  );
}
