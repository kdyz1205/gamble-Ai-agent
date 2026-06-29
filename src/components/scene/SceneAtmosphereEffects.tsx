"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";

interface SceneAtmosphereEffectsProps {
  className?: string;
  style?: CSSProperties;
}

export default function SceneAtmosphereEffects({ className = "", style }: SceneAtmosphereEffectsProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !window.matchMedia("(min-width: 640px)").matches) return;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearAlpha(0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.45));
    host.appendChild(renderer.domElement);
    let contextLost = false;
    const markContextLost = () => {
      contextLost = true;
    };
    renderer.domElement.addEventListener("webglcontextlost", markContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 8.4);

    const root = new THREE.Group();
    root.position.set(0.68, 0.16, 0);
    scene.add(root);

    const magenta = new THREE.Color("#ff4fbd");
    const violet = new THREE.Color("#8b3dff");
    const cyan = new THREE.Color("#00f0b5");
    const pale = new THREE.Color("#fff0fb");

    const particleCount = 360;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const angle = index * 2.399963229728653;
      const band = ((index * 47) % 100) / 100;
      const radius = 1.25 + band * 4.55;
      const sideBias = Math.sin(index * 0.2) * 0.4;
      positions[index * 3] = Math.cos(angle) * radius * 1.12 + sideBias;
      positions[index * 3 + 1] = Math.sin(index * 0.39) * 1.86 + Math.cos(angle * 0.6) * 0.22;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.3 - 1.2;

      const tone = index % 23 === 0 ? cyan : index % 9 === 0 ? pale : index % 4 === 0 ? violet : magenta;
      const mixed = magenta.clone().lerp(tone, (index % 17) / 22);
      colors[index * 3] = mixed.r;
      colors[index * 3 + 1] = mixed.g;
      colors[index * 3 + 2] = mixed.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMaterial = new THREE.PointsMaterial({
      size: 0.026,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    root.add(particles);

    const lineCount = 72;
    const linePositions = new Float32Array(lineCount * 2 * 3);
    const lineColors = new Float32Array(lineCount * 2 * 3);
    for (let segment = 0; segment < lineCount; segment += 1) {
      const a = (segment * 11) % particleCount;
      const b = (segment * 11 + 37) % particleCount;
      linePositions.set(positions.slice(a * 3, a * 3 + 3), segment * 6);
      linePositions.set(positions.slice(b * 3, b * 3 + 3), segment * 6 + 3);

      const color = magenta.clone().lerp(segment % 6 === 0 ? cyan : violet, 0.24);
      lineColors.set([color.r, color.g, color.b], segment * 6);
      lineColors.set([color.r, color.g, color.b], segment * 6 + 3);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    root.add(lines);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.055,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringMaterialViolet = ringMaterial.clone();
    ringMaterialViolet.color = violet;
    ringMaterialViolet.opacity = 0.045;

    const portalRing = new THREE.Mesh(new THREE.TorusGeometry(3.65, 0.006, 8, 220), ringMaterial);
    const horizonRing = new THREE.Mesh(new THREE.TorusGeometry(4.45, 0.005, 8, 220), ringMaterialViolet);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.004, 8, 180), ringMaterial.clone());
    portalRing.rotation.x = 1.1;
    portalRing.position.y = 0.18;
    horizonRing.rotation.x = 1.52;
    horizonRing.position.y = -1.18;
    innerRing.rotation.x = 1.34;
    innerRing.position.y = -0.16;
    root.add(portalRing, horizonRing, innerRing);

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
      root.rotation.y = Math.sin(elapsed * 0.08) * 0.06;
      particles.rotation.z = elapsed * 0.012;
      lines.rotation.z = -elapsed * 0.006;
      portalRing.rotation.z = elapsed * 0.026;
      horizonRing.rotation.z = -elapsed * 0.018;
      innerRing.rotation.z = elapsed * 0.032;
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
        lineGeometry.dispose();
        (lines.material as THREE.Material).dispose();
        portalRing.geometry.dispose();
        horizonRing.geometry.dispose();
        innerRing.geometry.dispose();
        ringMaterial.dispose();
        ringMaterialViolet.dispose();
        (innerRing.material as THREE.Material).dispose();
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      data-testid="scene-webgl-atmosphere"
      style={style}
    />
  );
}
