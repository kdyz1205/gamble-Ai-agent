"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface JudgmentChamberEffectsProps {
  className?: string;
}

export default function JudgmentChamberEffects({ className = "" }: JudgmentChamberEffectsProps) {
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    host.appendChild(renderer.domElement);
    let contextLost = false;
    const markContextLost = () => {
      contextLost = true;
    };
    renderer.domElement.addEventListener("webglcontextlost", markContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 7);

    const particleCount = 240;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const colorA = new THREE.Color("#ff4fbd");
    const colorB = new THREE.Color("#8b3dff");
    const colorC = new THREE.Color("#fff0fb");

    for (let index = 0; index < particleCount; index += 1) {
      const angle = index * 2.399963229728653;
      const shell = 1.1 + ((index * 37) % 100) / 100;
      const radius = 0.8 + shell * 0.7;
      const band = Math.sin(index * 0.41) * 0.64;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = band + Math.sin(angle * 0.72) * 0.18;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.42;

      const mixed = colorA.clone().lerp(index % 3 === 0 ? colorC : colorB, (index % 17) / 18);
      colors[index * 3] = mixed.r;
      colors[index * 3 + 1] = mixed.g;
      colors[index * 3 + 2] = mixed.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.032,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringMaterialDim = ringMaterial.clone();
    ringMaterialDim.color = new THREE.Color("#8b3dff");
    ringMaterialDim.opacity = 0.18;

    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.86, 0.007, 8, 160), ringMaterial);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.005, 8, 128), ringMaterialDim);
    const tiltedRing = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.005, 8, 160), ringMaterial.clone());

    outerRing.rotation.x = 0.72;
    innerRing.rotation.x = 1.12;
    tiltedRing.rotation.x = 1.38;
    tiltedRing.rotation.y = 0.48;
    scene.add(outerRing, innerRing, tiltedRing);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.78, 48, 24), coreMaterial);
    scene.add(core);

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
      particles.rotation.y = elapsed * 0.07;
      particles.rotation.z = Math.sin(elapsed * 0.22) * 0.045;
      outerRing.rotation.z = elapsed * 0.16;
      innerRing.rotation.z = -elapsed * 0.21;
      tiltedRing.rotation.z = elapsed * 0.12;
      core.scale.setScalar(1 + Math.sin(elapsed * 1.25) * 0.07);
      coreMaterial.opacity = 0.13 + Math.sin(elapsed * 1.6) * 0.045;
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
        particleMaterial.dispose();
        outerRing.geometry.dispose();
        innerRing.geometry.dispose();
        tiltedRing.geometry.dispose();
        ringMaterial.dispose();
        ringMaterialDim.dispose();
        core.geometry.dispose();
        coreMaterial.dispose();
        renderer.dispose();
      }
    };
  }, []);

  return <div ref={hostRef} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} data-testid="judgment-webgl-effects" />;
}
