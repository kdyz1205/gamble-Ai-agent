"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";

interface RitualForgeEffectsProps {
  className?: string;
  style?: CSSProperties;
}

export default function RitualForgeEffects({ className = "", style }: RitualForgeEffectsProps) {
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
    camera.position.set(0, 0.05, 7.4);

    const root = new THREE.Group();
    scene.add(root);

    const magenta = new THREE.Color("#ff4fbd");
    const violet = new THREE.Color("#8b3dff");
    const cyan = new THREE.Color("#00f0b5");
    const pale = new THREE.Color("#fff1fb");

    const particleCount = 300;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let index = 0; index < particleCount; index += 1) {
      const angle = index * 2.399963229728653;
      const tier = ((index * 31) % 100) / 100;
      const radius = 0.54 + tier * 2.2;
      const y = Math.sin(index * 0.49) * 0.76 + Math.cos(angle * 1.8) * 0.1;

      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.38;

      const tone = index % 17 === 0 ? cyan : index % 6 === 0 ? pale : index % 3 === 0 ? violet : magenta;
      const mixed = magenta.clone().lerp(tone, (index % 19) / 24);
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
      opacity: 0.76,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    root.add(particles);

    const moduleMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const moduleMaterialCyan = moduleMaterial.clone();
    moduleMaterialCyan.color = cyan;
    moduleMaterialCyan.opacity = 0.13;

    const moduleGeometry = new THREE.OctahedronGeometry(0.34, 1);
    const modules: THREE.Mesh[] = [];
    const moduleSeeds = [
      [0, 1.45, 0, 0],
      [-1.64, 0.08, -0.16, 1.9],
      [1.64, 0.08, -0.16, 4.2],
      [0, -1.32, 0.08, 3.1],
    ] as const;

    moduleSeeds.forEach(([x, y, z, phase], index) => {
      const forgeNode = new THREE.Mesh(moduleGeometry, index % 2 ? moduleMaterialCyan : moduleMaterial);
      forgeNode.position.set(x, y, z);
      forgeNode.rotation.set(0.4 + index * 0.18, phase, -0.28 + index * 0.2);
      forgeNode.scale.setScalar(index === 0 ? 1.08 : 0.92);
      modules.push(forgeNode);
      root.add(forgeNode);
    });

    const lineSegments = moduleSeeds.length * 18;
    const linePositions = new Float32Array(lineSegments * 2 * 3);
    const lineColors = new Float32Array(lineSegments * 2 * 3);
    for (let segment = 0; segment < lineSegments; segment += 1) {
      const source = moduleSeeds[segment % moduleSeeds.length];
      const t = (segment % 18) / 17;
      const bend = Math.sin(t * Math.PI) * 0.24;
      linePositions.set([source[0], source[1], source[2]], segment * 6);
      linePositions.set([source[0] * (1 - t) + bend, source[1] * (1 - t), source[2] * (1 - t)], segment * 6 + 3);

      const color = magenta.clone().lerp(segment % 5 === 0 ? cyan : pale, 0.2 + t * 0.42);
      lineColors.set([color.r, color.g, color.b], segment * 6);
      lineColors.set([color.r, color.g, color.b], segment * 6 + 3);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
    const moduleLines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexColors: true,
      }),
    );
    root.add(moduleLines);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ringMaterialDim = ringMaterial.clone();
    ringMaterialDim.color = violet;
    ringMaterialDim.opacity = 0.12;

    const orbitalRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.005, 8, 180), ringMaterial);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.004, 8, 144), ringMaterialDim);
    const floorRing = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.005, 8, 184), ringMaterial.clone());
    orbitalRing.rotation.x = 1.16;
    innerRing.rotation.x = 1.44;
    floorRing.rotation.x = 1.5;
    floorRing.position.y = -1.1;
    root.add(orbitalRing, innerRing, floorRing);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: "#ff4fbd",
      transparent: true,
      opacity: 0.12,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.74, 2), coreMaterial);
    core.scale.set(0.86, 1.2, 0.86);
    root.add(core);

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
      root.rotation.y = Math.sin(elapsed * 0.18) * 0.08;
      particles.rotation.z = elapsed * 0.04;
      moduleLines.rotation.z = Math.sin(elapsed * 0.48) * 0.03;
      orbitalRing.rotation.z = elapsed * 0.12;
      innerRing.rotation.z = -elapsed * 0.18;
      floorRing.rotation.z = elapsed * 0.07;
      core.rotation.y = elapsed * 0.24;
      core.rotation.z = Math.sin(elapsed * 0.62) * 0.08;
      coreMaterial.opacity = 0.1 + Math.sin(elapsed * 1.25) * 0.035;

      modules.forEach((forgeNode, index) => {
        forgeNode.position.y = moduleSeeds[index][1] + Math.sin(elapsed * (0.74 + index * 0.09) + moduleSeeds[index][3]) * 0.06;
        forgeNode.rotation.x += 0.002 + index * 0.0004;
        forgeNode.rotation.y += 0.003 + index * 0.0003;
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
        moduleGeometry.dispose();
        moduleMaterial.dispose();
        moduleMaterialCyan.dispose();
        lineGeometry.dispose();
        (moduleLines.material as THREE.Material).dispose();
        orbitalRing.geometry.dispose();
        innerRing.geometry.dispose();
        floorRing.geometry.dispose();
        ringMaterial.dispose();
        ringMaterialDim.dispose();
        (floorRing.material as THREE.Material).dispose();
        core.geometry.dispose();
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
      data-testid="ritual-webgl-forge"
      style={style}
    />
  );
}
