"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";

interface ContractBindingEffectsProps {
  className?: string;
  style?: CSSProperties;
}

export default function ContractBindingEffects({ className = "", style }: ContractBindingEffectsProps) {
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
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 7.2);

    const root = new THREE.Group();
    scene.add(root);

    const magenta = new THREE.Color("#ff4fbd");
    const violet = new THREE.Color("#8b3dff");
    const pale = new THREE.Color("#ffe5f7");
    const cyan = new THREE.Color("#00f0b5");

    const particleCount = 260;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const angle = index * 2.399963229728653;
      const shell = 0.55 + ((index * 41) % 100) / 58;
      const radius = shell * 1.12;
      const sidePull = index % 2 === 0 ? -1 : 1;
      positions[index * 3] = Math.cos(angle) * radius + sidePull * Math.sin(index * 0.2) * 0.48;
      positions[index * 3 + 1] = Math.sin(index * 0.57) * 0.92;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.32;

      const tone = index % 17 === 0 ? cyan : index % 4 === 0 ? violet : index % 9 === 0 ? pale : magenta;
      const mixed = magenta.clone().lerp(tone, (index % 13) / 16);
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
        size: 0.034,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    root.add(particles);

    const threadGeometry = new THREE.BufferGeometry();
    const threadSegments = 72;
    const threadPositions = new Float32Array(threadSegments * 2 * 3);
    const threadColors = new Float32Array(threadSegments * 2 * 3);
    for (let segment = 0; segment < threadSegments; segment += 1) {
      const t = segment / (threadSegments - 1);
      const wave = Math.sin(t * Math.PI * 5) * 0.12;
      const leftX = -2.78 + t * 5.56;
      const rightX = -2.78 + (t + 1 / threadSegments) * 5.56;
      const y = Math.sin((t - 0.5) * Math.PI) * 0.18 + wave;
      threadPositions.set([leftX, y, 0], segment * 6);
      threadPositions.set([rightX, y + Math.cos(t * Math.PI * 4) * 0.1, 0], segment * 6 + 3);

      const color = magenta.clone().lerp(t < 0.5 ? pale : violet, Math.abs(t - 0.5) * 1.2);
      threadColors.set([color.r, color.g, color.b], segment * 6);
      threadColors.set([color.r, color.g, color.b], segment * 6 + 3);
    }
    threadGeometry.setAttribute("position", new THREE.BufferAttribute(threadPositions, 3));
    threadGeometry.setAttribute("color", new THREE.BufferAttribute(threadColors, 3));
    const threads = new THREE.LineSegments(
      threadGeometry,
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    root.add(threads);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sealRing = new THREE.Mesh(new THREE.TorusGeometry(1.84, 0.005, 8, 164), ringMaterial);
    const floorRing = new THREE.Mesh(new THREE.TorusGeometry(2.56, 0.006, 8, 180), ringMaterial.clone());
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.004, 8, 128), ringMaterial.clone());
    sealRing.rotation.x = 1.2;
    floorRing.rotation.x = 1.48;
    floorRing.position.y = -0.92;
    crownRing.rotation.x = 1.04;
    crownRing.position.y = 0.98;
    root.add(sealRing, floorRing, crownRing);

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
      particles.rotation.y = Math.sin(elapsed * 0.17) * 0.08;
      particles.rotation.z = elapsed * 0.035;
      threads.rotation.z = Math.sin(elapsed * 0.38) * 0.025;
      sealRing.rotation.z = elapsed * 0.11;
      floorRing.rotation.z = -elapsed * 0.055;
      crownRing.rotation.z = elapsed * 0.14;
      root.scale.setScalar(1 + Math.sin(elapsed * 0.9) * 0.018);
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
        threadGeometry.dispose();
        (threads.material as THREE.Material).dispose();
        sealRing.geometry.dispose();
        floorRing.geometry.dispose();
        crownRing.geometry.dispose();
        ringMaterial.dispose();
        (floorRing.material as THREE.Material).dispose();
        (crownRing.material as THREE.Material).dispose();
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute ${className}`}
      data-testid="contract-webgl-binding"
      style={style}
    />
  );
}
