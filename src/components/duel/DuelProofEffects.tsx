"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";

interface DuelProofEffectsProps {
  className?: string;
  style?: CSSProperties;
}

export default function DuelProofEffects({ className = "", style }: DuelProofEffectsProps) {
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    host.appendChild(renderer.domElement);
    let contextLost = false;
    const markContextLost = () => {
      contextLost = true;
    };
    renderer.domElement.addEventListener("webglcontextlost", markContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.08, 7.6);

    const root = new THREE.Group();
    root.position.y = 0.06;
    scene.add(root);

    const magenta = new THREE.Color("#ff4fbd");
    const violet = new THREE.Color("#8b3dff");
    const pale = new THREE.Color("#fff2fb");
    const cyan = new THREE.Color("#00f0b5");

    const particleCount = 320;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const angle = index * 2.399963229728653;
      const tier = ((index * 43) % 100) / 100;
      const radius = 0.38 + tier * 2.46;
      const vertical = Math.sin(index * 0.31) * 1.18 + Math.cos(angle * 2.2) * 0.12;

      positions[index * 3] = Math.cos(angle) * radius * (0.64 + tier * 0.16);
      positions[index * 3 + 1] = vertical;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.34;

      const tone = index % 19 === 0 ? cyan : index % 7 === 0 ? pale : index % 3 === 0 ? violet : magenta;
      const mixed = magenta.clone().lerp(tone, (index % 23) / 26);
      colors[index * 3] = mixed.r;
      colors[index * 3 + 1] = mixed.g;
      colors[index * 3 + 2] = mixed.b;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.034,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    root.add(particles);

    const fragmentMaterial = new THREE.MeshBasicMaterial({
      color: "#ff7bd7",
      transparent: true,
      opacity: 0.14,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const fragmentMaterialCyan = fragmentMaterial.clone();
    fragmentMaterialCyan.color = cyan;
    fragmentMaterialCyan.opacity = 0.1;

    const fragments: THREE.Mesh[] = [];
    const fragmentGeometry = new THREE.BoxGeometry(0.72, 0.46, 0.022, 2, 2, 1);
    const fragmentSeeds = [
      [-1.86, 0.92, -0.22, -0.42],
      [1.86, 0.88, -0.14, 0.42],
      [-2.16, 0.18, 0.1, -0.28],
      [2.16, 0.16, 0.04, 0.28],
      [-1.34, -0.44, -0.18, 0.18],
      [1.34, -0.46, -0.12, -0.18],
    ] as const;

    fragmentSeeds.forEach(([x, y, z, tilt], index) => {
      const fragment = new THREE.Mesh(fragmentGeometry, index % 2 ? fragmentMaterialCyan : fragmentMaterial);
      fragment.position.set(x, y, z);
      fragment.rotation.set(tilt, index % 2 ? -0.28 : 0.28, tilt * 0.9);
      fragment.scale.setScalar(index > 3 ? 0.78 : 1);
      fragments.push(fragment);
      root.add(fragment);
    });

    const beamSegments = 92;
    const beamPositions = new Float32Array(beamSegments * 2 * 3);
    const beamColors = new Float32Array(beamSegments * 2 * 3);
    for (let segment = 0; segment < beamSegments; segment += 1) {
      const t = segment / (beamSegments - 1);
      const side = segment % 2 === 0 ? -1 : 1;
      const x1 = side * (2.72 - t * 1.82);
      const y1 = Math.sin(t * Math.PI * 2) * 0.48 + (0.72 - t * 1.24);
      const x2 = side * (0.34 + Math.sin(t * Math.PI * 4) * 0.12);
      const y2 = Math.cos(t * Math.PI * 3) * 0.16 + (0.58 - t * 0.86);

      beamPositions.set([x1, y1, -0.05], segment * 6);
      beamPositions.set([x2, y2, 0.02], segment * 6 + 3);

      const color = magenta.clone().lerp(segment % 5 === 0 ? cyan : violet, 0.18 + Math.abs(t - 0.5) * 0.72);
      beamColors.set([color.r, color.g, color.b], segment * 6);
      beamColors.set([color.r, color.g, color.b], segment * 6 + 3);
    }
    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute("position", new THREE.BufferAttribute(beamPositions, 3));
    beamGeometry.setAttribute("color", new THREE.BufferAttribute(beamColors, 3));
    const beams = new THREE.LineSegments(
      beamGeometry,
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.17,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    root.add(beams);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.15,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringMaterialDim = ringMaterial.clone();
    ringMaterialDim.color = violet;
    ringMaterialDim.opacity = 0.12;

    const floorRing = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.006, 8, 184), ringMaterial);
    const altarRing = new THREE.Mesh(new THREE.TorusGeometry(1.54, 0.005, 8, 148), ringMaterialDim);
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.004, 8, 124), ringMaterial.clone());
    floorRing.rotation.x = 1.45;
    floorRing.position.y = -0.98;
    altarRing.rotation.x = 1.18;
    altarRing.position.y = -0.04;
    crownRing.rotation.x = 0.92;
    crownRing.position.y = 0.94;
    root.add(floorRing, altarRing, crownRing);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.1,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const crystalCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.82, 2), coreMaterial);
    crystalCore.scale.set(0.62, 1.52, 0.62);
    root.add(crystalCore);

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
      root.rotation.y = Math.sin(elapsed * 0.16) * 0.08;
      particles.rotation.z = elapsed * 0.036;
      particles.rotation.y = Math.sin(elapsed * 0.24) * 0.1;
      beams.rotation.z = Math.sin(elapsed * 0.62) * 0.026;
      floorRing.rotation.z = -elapsed * 0.08;
      altarRing.rotation.z = elapsed * 0.13;
      crownRing.rotation.z = -elapsed * 0.18;
      crystalCore.rotation.y = elapsed * 0.22;
      crystalCore.rotation.z = Math.sin(elapsed * 0.5) * 0.06;
      coreMaterial.opacity = 0.08 + Math.sin(elapsed * 1.35) * 0.025;

      fragments.forEach((fragment, index) => {
        fragment.position.y = fragmentSeeds[index][1] + Math.sin(elapsed * (0.72 + index * 0.08) + index) * 0.045;
        fragment.rotation.z += (index % 2 ? -1 : 1) * 0.0014;
      });

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
        fragmentGeometry.dispose();
        fragmentMaterial.dispose();
        fragmentMaterialCyan.dispose();
        beamGeometry.dispose();
        (beams.material as THREE.Material).dispose();
        floorRing.geometry.dispose();
        altarRing.geometry.dispose();
        crownRing.geometry.dispose();
        ringMaterial.dispose();
        ringMaterialDim.dispose();
        (crownRing.material as THREE.Material).dispose();
        crystalCore.geometry.dispose();
        coreMaterial.dispose();
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      data-testid="duel-webgl-proof"
      style={style}
    />
  );
}
