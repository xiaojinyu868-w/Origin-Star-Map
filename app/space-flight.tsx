"use client";

import { useEffect, useRef } from "react";

export type VoyagePhase = "idle" | "cruise" | "scanning" | "ready";

export type FlightTarget = {
  id: string;
  mission: number;
  x: number;
  y: number;
  color: string;
};

export type FlightTelemetry = {
  speed: number;
  distance: number;
  signal: number;
  probes: number;
  samples: number;
  energy: number;
  integrity: number;
  locks: number;
  combo: number;
};

type SpaceFlightProps = {
  active: boolean;
  phase: VoyagePhase;
  target: FlightTarget | null;
  worldReady: boolean;
  onArrive: (id: string) => void;
  onTelemetry: (telemetry: FlightTelemetry) => void;
};

type Point = { x: number; y: number };
type Dust = Point & { depth: number; size: number; drift: number; alpha: number };
type SignalShard = Point & { collected: boolean; phase: number };
type GravityWell = Point & { radius: number; phase: number; hit: boolean; skimmed: boolean };
type MissionState = {
  key: string;
  startedAt: number;
  arrived: boolean;
  probes: number;
  samples: number;
  locks: number;
  combo: number;
  energy: number;
  integrity: number;
  scanStartedAt: number;
  lastScanWindow: number;
  collisionAt: number;
};

const EMPTY_MISSION: MissionState = {
  key: "",
  startedAt: 0,
  arrived: false,
  probes: 0,
  samples: 0,
  locks: 0,
  combo: 0,
  energy: 100,
  integrity: 100,
  scanStartedAt: 0,
  lastScanWindow: -1,
  collisionAt: -10000,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function seededDust(count: number): Dust[] {
  let seed = 731942;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    depth: .2 + random() * .8,
    size: .4 + random() * 1.45,
    drift: (random() - .5) * .014,
    alpha: .15 + random() * .5,
  }));
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 6 ? clean : "7fa6a0", 16);
  return { r: value >> 16 & 255, g: value >> 8 & 255, b: value & 255 };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

/**
 * Frame-based spaceflight stays outside React's render loop. React receives a
 * throttled instrument snapshot; camera, physics, collisions and rendering do not
 * cause component renders.
 */
export function SpaceFlight({ active, phase, target, worldReady, onArrive, onTelemetry }: SpaceFlightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const phaseRef = useRef(phase);
  const targetRef = useRef<FlightTarget | null>(target);
  const worldReadyRef = useRef(worldReady);
  const arriveRef = useRef(onArrive);
  const telemetryRef = useRef(onTelemetry);
  const missionRef = useRef<MissionState>({ ...EMPTY_MISSION });

  useEffect(() => {
    activeRef.current = active;
    phaseRef.current = phase;
    targetRef.current = target;
    worldReadyRef.current = worldReady;
    arriveRef.current = onArrive;
    telemetryRef.current = onTelemetry;
  }, [active, onArrive, onTelemetry, phase, target, worldReady]);

  useEffect(() => {
    const key = target ? `${target.id}:${target.mission}` : "";
    if (missionRef.current.key === key) return;
    missionRef.current = { ...EMPTY_MISSION, key, startedAt: performance.now() };
  }, [target]);

  useEffect(() => {
    if (phase !== "scanning") return;
    missionRef.current.scanStartedAt = performance.now();
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const dust = seededDust(164);
    const keys = new Set<string>();
    const pointer = { active: false, id: -1, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } };
    const ship = { x: 50, y: 50, vx: 0, vy: 0, angle: -Math.PI / 2, bank: 0, trail: [] as Array<Point & { age: number }> };
    const camera = { x: 50, y: 50 };
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let previous = performance.now();
    let lastTelemetry = 0;
    let probeAt = -10000;
    let processedProbeAt = -10000;
    let scanHitAt = -10000;
    let scanMissAt = -10000;
    let readyAt = -10000;
    let shake = 0;
    let renderedMission = "";
    let shards: SignalShard[] = [];
    let wells: GravityWell[] = [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let audioContext: AudioContext | null = null;
    let engineOscillator: OscillatorNode | null = null;
    let engineGain: GainNode | null = null;
    let audioEnabled = false;

    function ensureAudio() {
      if (!audioContext) {
        audioContext = new AudioContext();
        engineOscillator = audioContext.createOscillator();
        engineGain = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        engineOscillator.type = "sawtooth";
        engineOscillator.frequency.value = 42;
        filter.type = "lowpass";
        filter.frequency.value = 160;
        engineGain.gain.value = .0001;
        engineOscillator.connect(filter).connect(engineGain).connect(audioContext.destination);
        engineOscillator.start();
      }
      if (audioContext.state === "suspended") void audioContext.resume();
    }

    function playTone(frequency: number, duration = .09, gain = .025, type: OscillatorType = "sine") {
      if (!audioEnabled) return;
      ensureAudio();
      if (!audioContext) return;
      const oscillator = audioContext.createOscillator();
      const volume = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      volume.gain.setValueAtTime(gain, audioContext.currentTime);
      volume.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
      oscillator.connect(volume).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    }

    function audioToggle(event: Event) {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      audioEnabled = Boolean(detail?.enabled);
      if (audioEnabled) {
        ensureAudio();
        playTone(294, .08, .02);
        window.setTimeout(() => playTone(440, .12, .018), 70);
      } else if (engineGain && audioContext) {
        engineGain.gain.setTargetAtTime(.0001, audioContext.currentTime, .03);
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function isEditable(targetElement: EventTarget | null) {
      return targetElement instanceof HTMLElement && Boolean(targetElement.closest("input, textarea, select, button, a, summary, [contenteditable='true']"));
    }

    function fireProbe(now: number) {
      probeAt = now;
      missionRef.current.probes += 1;
      if (phaseRef.current !== "scanning") return;
      const elapsed = Math.max(0, now - missionRef.current.scanStartedAt);
      const scanRate = .0062;
      const alignment = (Math.sin(elapsed * scanRate - Math.PI / 2) + 1) / 2;
      const scanWindow = Math.floor(elapsed / (Math.PI * 2 / scanRate));
      if (alignment > .72 && missionRef.current.lastScanWindow !== scanWindow) {
        missionRef.current.lastScanWindow = scanWindow;
        missionRef.current.locks = Math.min(3, missionRef.current.locks + 1);
        missionRef.current.combo = Math.min(9, missionRef.current.combo + 1);
        scanHitAt = now;
        shake = Math.max(shake, 3);
        playTone(440 + missionRef.current.locks * 110, .16, .03, "triangle");
        if ("vibrate" in navigator) navigator.vibrate([7, 24, 7]);
      } else if (alignment <= .72) {
        missionRef.current.combo = 0;
        scanMissAt = now;
        playTone(118, .08, .018, "square");
        if ("vibrate" in navigator) navigator.vibrate(5);
      }
    }

    function keyDown(event: KeyboardEvent) {
      if (!activeRef.current || isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
        keys.add(key);
        event.preventDefault();
      }
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        fireProbe(performance.now());
      }
    }

    function keyUp(event: KeyboardEvent) {
      keys.delete(event.key.toLowerCase());
    }

    function pointerDown(event: PointerEvent) {
      if (!activeRef.current || event.button !== 0) return;
      pointer.active = true;
      pointer.id = event.pointerId;
      pointer.origin = { x: event.clientX, y: event.clientY };
      pointer.current = { ...pointer.origin };
      canvas.setPointerCapture(event.pointerId);
    }

    function pointerMove(event: PointerEvent) {
      if (!pointer.active || event.pointerId !== pointer.id) return;
      pointer.current = { x: event.clientX, y: event.clientY };
    }

    function pointerUp(event: PointerEvent) {
      if (event.pointerId !== pointer.id) return;
      const dragDistance = Math.hypot(pointer.current.x - pointer.origin.x, pointer.current.y - pointer.origin.y);
      pointer.active = false;
      pointer.id = -1;
      if (dragDistance < 9 && phaseRef.current === "scanning") fireProbe(performance.now());
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }

    function inputVector() {
      let x = 0;
      let y = 0;
      if (keys.has("a") || keys.has("arrowleft")) x -= 1;
      if (keys.has("d") || keys.has("arrowright")) x += 1;
      if (keys.has("w") || keys.has("arrowup")) y -= 1;
      if (keys.has("s") || keys.has("arrowdown")) y += 1;
      if (pointer.active) {
        x += clamp((pointer.current.x - pointer.origin.x) / 58, -1, 1);
        y += clamp((pointer.current.y - pointer.origin.y) / 58, -1, 1);
      }
      const length = Math.hypot(x, y) || 1;
      return { x: x / length, y: y / length, amount: clamp(Math.hypot(x, y), 0, 1) };
    }

    function worldScale() {
      return clamp(Math.min(width, height) / 48, 8.5, 18);
    }

    function worldToScreen(point: Point, now: number) {
      if (phaseRef.current === "idle") return { x: point.x / 100 * width, y: point.y / 100 * height };
      const scale = worldScale();
      const shakeX = reduceMotion.matches ? 0 : Math.sin(now * .071) * shake;
      const shakeY = reduceMotion.matches ? 0 : Math.cos(now * .089) * shake * .65;
      return {
        x: width * .5 + (point.x - camera.x) * scale + shakeX,
        y: height * .53 + (point.y - camera.y) * scale + shakeY,
      };
    }

    function drawDust(now: number, speed: number) {
      const flight = phaseRef.current !== "idle";
      for (const particle of dust) {
        const parallaxX = flight ? -camera.x * particle.depth * .008 : ship.x * particle.depth * .002;
        const parallaxY = flight ? -camera.y * particle.depth * .006 : ship.y * particle.depth * .0015;
        const x = (((particle.x + now * particle.drift * particle.depth + parallaxX) % 1 + 1) % 1) * width;
        const y = (((particle.y + parallaxY) % 1 + 1) % 1) * height;
        const streak = flight ? clamp(speed * particle.depth * 1.05, 0, keys.has("shift") ? 19 : 10) : 0;
        context.beginPath();
        context.moveTo(x - Math.cos(ship.angle) * streak, y - Math.sin(ship.angle) * streak);
        context.lineTo(x, y);
        context.strokeStyle = `rgba(230,225,210,${particle.alpha})`;
        context.lineWidth = particle.size;
        context.stroke();
      }
    }

    function prepareMission(targetPoint: FlightTarget) {
      const key = `${targetPoint.id}:${targetPoint.mission}`;
      if (key === renderedMission) return;
      renderedMission = key;
      camera.x = ship.x;
      camera.y = ship.y;
      const dx = targetPoint.x - ship.x;
      const dy = targetPoint.y - ship.y;
      const length = Math.hypot(dx, dy) || 1;
      const normal = { x: -dy / length, y: dx / length };
      const direction = { x: dx / length, y: dy / length };
      const seed = hashText(key);
      shards = [.18, .37, .58, .79].map((step, index) => ({
        x: clamp(ship.x + dx * step + normal.x * (index % 2 ? -2.8 : 2.8), 3, 97),
        y: clamp(ship.y + dy * step + normal.y * (index % 2 ? -2.8 : 2.8), 3, 97),
        collected: false,
        phase: index * 1.7,
      }));
      wells = [.3, .53, .7].map((step, index) => {
        const sign = ((seed >> index) & 1) ? 1 : -1;
        const offset = 4.5 + (seed % (7 + index)) * .22;
        return {
          x: clamp(ship.x + direction.x * length * step + normal.x * offset * sign, 4, 96),
          y: clamp(ship.y + direction.y * length * step + normal.y * offset * sign, 4, 96),
          radius: 2.2 + ((seed >> (index + 2)) % 4) * .32,
          phase: index * 2.1 + seed % 13,
          hit: false,
          skimmed: false,
        };
      });
    }

    function drawRoute(targetPoint: Point, color: string, now: number) {
      const start = worldToScreen(ship, now);
      const end = worldToScreen(targetPoint, now);
      const rgb = hexToRgb(color);
      context.save();
      context.setLineDash([2, 13]);
      context.lineDashOffset = -now * .022;
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo((start.x + end.x) / 2 + (end.y - start.y) * .035, (start.y + end.y) / 2 - (end.x - start.x) * .035, end.x, end.y);
      context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.28)`;
      context.lineWidth = 1;
      context.stroke();
      context.restore();
    }

    function drawTarget(targetPoint: Point, color: string, now: number, distance: number) {
      const point = worldToScreen(targetPoint, now);
      const rgb = hexToRgb(color);
      const margin = 62;
      const outside = point.x < margin || point.x > width - margin || point.y < margin || point.y > height - margin;
      if (outside && phaseRef.current !== "idle") {
        const center = { x: width * .5, y: height * .53 };
        const angle = Math.atan2(point.y - center.y, point.x - center.x);
        const radiusX = Math.max(40, width * .5 - margin);
        const radiusY = Math.max(40, height * .53 - margin);
        const edgeScale = Math.min(Math.abs(radiusX / (Math.cos(angle) || .001)), Math.abs(radiusY / (Math.sin(angle) || .001)));
        const edge = { x: center.x + Math.cos(angle) * edgeScale, y: center.y + Math.sin(angle) * edgeScale };
        context.save();
        context.translate(edge.x, edge.y);
        context.rotate(angle + Math.PI / 2);
        context.beginPath();
        context.moveTo(0, -12);
        context.lineTo(8, 8);
        context.lineTo(-8, 8);
        context.closePath();
        context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.2)`;
        context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.9)`;
        context.fill();
        context.stroke();
        context.restore();
        context.save();
        context.fillStyle = "rgba(242,235,220,.78)";
        context.font = "600 11px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText(`${Math.round(distance * 1.7)} 光程`, edge.x, edge.y + 27);
        context.restore();
        return;
      }
      const pulse = 1 + Math.sin(now * .004) * .12;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(now * .00032);
      context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.72)`;
      context.lineWidth = 1;
      context.setLineDash([5, 7]);
      context.beginPath();
      context.arc(0, 0, 28 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(0, 0, 4.5, 0, Math.PI * 2);
      context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.92)`;
      context.shadowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},.8)`;
      context.shadowBlur = 18;
      context.fill();
      context.restore();
    }

    function collectShard(shard: SignalShard, now: number) {
      if (shard.collected) return;
      shard.collected = true;
      missionRef.current.samples += 1;
      missionRef.current.combo = Math.min(9, missionRef.current.combo + 1);
      missionRef.current.energy = Math.min(100, missionRef.current.energy + 12);
      scanHitAt = now;
      shake = Math.max(shake, 2.5);
      playTone(330 + missionRef.current.samples * 62, .12, .025, "triangle");
      if ("vibrate" in navigator) navigator.vibrate(8);
    }

    function updateShards(now: number) {
      for (const shard of shards) {
        if (shard.collected) continue;
        const distance = Math.hypot(shard.x - ship.x, shard.y - ship.y);
        if (distance < 2.4) collectShard(shard, now);
        if (probeAt !== processedProbeAt && distance < 9.5) collectShard(shard, now);
      }
      processedProbeAt = probeAt;
    }

    function drawShards(now: number) {
      for (const shard of shards) {
        if (shard.collected) continue;
        const point = worldToScreen(shard, now);
        if (point.x < -30 || point.x > width + 30 || point.y < -30 || point.y > height + 30) continue;
        const pulse = 1 + Math.sin(now * .005 + shard.phase) * .18;
        context.save();
        context.translate(point.x, point.y);
        context.rotate(now * .0007 + shard.phase);
        context.strokeStyle = "rgba(212,177,111,.84)";
        context.fillStyle = "rgba(197,163,107,.1)";
        context.beginPath();
        for (let vertex = 0; vertex < 6; vertex += 1) {
          const angle = vertex * Math.PI / 3;
          const x = Math.cos(angle) * 8 * pulse;
          const y = Math.sin(angle) * 8 * pulse;
          if (!vertex) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 1.8, 0, Math.PI * 2);
        context.fillStyle = "rgba(250,241,219,.96)";
        context.shadowColor = "rgba(197,163,107,.9)";
        context.shadowBlur = 11;
        context.fill();
        context.restore();
      }
    }

    function updateWells(now: number) {
      if (phaseRef.current !== "cruise") return;
      for (const well of wells) {
        const dx = well.x - ship.x;
        const dy = well.y - ship.y;
        const distance = Math.hypot(dx, dy) || .001;
        if (distance < well.radius + 6) {
          const pull = clamp((well.radius + 6 - distance) / 8, 0, 1);
          ship.vx += dx / distance * pull * .055;
          ship.vy += dy / distance * pull * .055;
        }
        if (!well.skimmed && distance >= well.radius + 1.1 && distance < well.radius + 2.4) {
          well.skimmed = true;
          missionRef.current.combo = Math.min(9, missionRef.current.combo + 2);
          missionRef.current.energy = Math.min(100, missionRef.current.energy + 18);
          scanHitAt = now;
        }
        if (distance < well.radius + 1.05 && now - missionRef.current.collisionAt > 1050) {
          well.hit = true;
          missionRef.current.collisionAt = now;
          missionRef.current.integrity = Math.max(24, missionRef.current.integrity - 16);
          missionRef.current.combo = 0;
          ship.vx -= dx / distance * 6.8;
          ship.vy -= dy / distance * 6.8;
          shake = 12;
          playTone(62, .24, .04, "sawtooth");
          if ("vibrate" in navigator) navigator.vibrate([14, 22, 20]);
        }
      }
    }

    function drawWells(now: number) {
      for (const well of wells) {
        const point = worldToScreen(well, now);
        const radius = well.radius * worldScale();
        if (point.x < -radius || point.x > width + radius || point.y < -radius || point.y > height + radius) continue;
        context.save();
        context.translate(point.x, point.y);
        context.rotate(now * .00016 * (well.phase % 2 ? 1 : -1));
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius * 1.8);
        gradient.addColorStop(0, "rgba(1,3,3,.94)");
        gradient.addColorStop(.46, well.hit ? "rgba(198,87,64,.12)" : "rgba(82,119,123,.09)");
        gradient.addColorStop(1, "rgba(1,3,3,0)");
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, radius * 1.8, 0, Math.PI * 2);
        context.fill();
        for (let ring = 0; ring < 3; ring += 1) {
          context.beginPath();
          context.ellipse(0, 0, radius * (1 + ring * .27), radius * (.52 + ring * .12), well.phase + ring * .72, .18, Math.PI * 1.72);
          context.strokeStyle = well.hit ? `rgba(198,87,64,${.3 - ring * .06})` : `rgba(107,156,158,${.27 - ring * .055})`;
          context.lineWidth = ring === 0 ? 1.2 : .7;
          context.stroke();
        }
        context.restore();
      }
    }

    function drawProbe(now: number) {
      const elapsed = now - probeAt;
      if (elapsed < 0 || elapsed > 1050) return;
      const progress = elapsed / 1050;
      const point = worldToScreen(ship, now);
      context.beginPath();
      context.arc(point.x, point.y, 16 + progress * 126, 0, Math.PI * 2);
      context.strokeStyle = `rgba(127,185,180,${(1 - progress) * .72})`;
      context.lineWidth = 1.25;
      context.stroke();
    }

    function drawShip(now: number, thrust: number, boost: boolean) {
      const point = worldToScreen(ship, now);
      const scale = clamp(Math.min(width, height) / 690, .8, 1.2);
      const glow = boost ? 1 : .55 + thrust * .28;
      context.save();
      context.translate(point.x, point.y);
      context.rotate(ship.angle + Math.PI / 2);
      context.transform(1, 0, ship.bank * .09, 1, 0, 0);
      const engine = context.createLinearGradient(0, 12 * scale, 0, 46 * scale);
      engine.addColorStop(0, `rgba(242,235,220,${.82 * glow})`);
      engine.addColorStop(.28, `rgba(198,87,64,${.72 * glow})`);
      engine.addColorStop(1, "rgba(198,87,64,0)");
      context.beginPath();
      context.moveTo(-4 * scale, 11 * scale);
      context.quadraticCurveTo(0, (31 + Math.sin(now * .025) * (boost ? 11 : 5)) * scale, 4 * scale, 11 * scale);
      context.fillStyle = engine;
      context.fill();
      context.beginPath();
      context.moveTo(0, -19 * scale);
      context.lineTo(13 * scale, 12 * scale);
      context.lineTo(4 * scale, 8 * scale);
      context.lineTo(0, 14 * scale);
      context.lineTo(-4 * scale, 8 * scale);
      context.lineTo(-13 * scale, 12 * scale);
      context.closePath();
      context.fillStyle = "rgba(8,12,12,.98)";
      context.strokeStyle = "rgba(242,235,220,.9)";
      context.lineWidth = 1.2;
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(0, -12 * scale);
      context.lineTo(4 * scale, 3 * scale);
      context.lineTo(0, 8 * scale);
      context.lineTo(-4 * scale, 3 * scale);
      context.closePath();
      context.fillStyle = "rgba(127,185,180,.88)";
      context.shadowColor = "rgba(127,185,180,.8)";
      context.shadowBlur = 12;
      context.fill();
      context.restore();
    }

    function drawPointer() {
      if (!pointer.active) return;
      const rect = canvas.getBoundingClientRect();
      const ox = pointer.origin.x - rect.left;
      const oy = pointer.origin.y - rect.top;
      const cx = pointer.current.x - rect.left;
      const cy = pointer.current.y - rect.top;
      context.beginPath();
      context.arc(ox, oy, 29, 0, Math.PI * 2);
      context.strokeStyle = "rgba(224,215,193,.28)";
      context.stroke();
      context.beginPath();
      context.arc(ox + clamp(cx - ox, -29, 29), oy + clamp(cy - oy, -29, 29), 7, 0, Math.PI * 2);
      context.fillStyle = "rgba(242,235,220,.72)";
      context.fill();
    }

    function drawScanGame(now: number, targetPoint: FlightTarget) {
      if (phaseRef.current !== "scanning") return;
      const point = worldToScreen(targetPoint, now);
      const elapsed = Math.max(0, now - missionRef.current.scanStartedAt);
      const alignment = (Math.sin(elapsed * .0062 - Math.PI / 2) + 1) / 2;
      const radius = clamp(Math.min(width, height) * .135, 64, 122);
      const sweep = -Math.PI / 2 + elapsed * .0062;
      context.save();
      context.translate(point.x, point.y);
      context.strokeStyle = "rgba(127,185,180,.18)";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = "rgba(212,177,111,.78)";
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, 0, radius, -.34 - Math.PI / 2, .34 - Math.PI / 2);
      context.stroke();
      context.rotate(sweep);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(radius + 17, 0);
      context.strokeStyle = alignment > .72 ? "rgba(242,235,220,.95)" : "rgba(127,185,180,.74)";
      context.lineWidth = 1.4;
      context.stroke();
      context.restore();
      const recentHit = now - scanHitAt < 620;
      const recentMiss = now - scanMissAt < 520;
      context.save();
      context.textAlign = "center";
      context.font = "600 12px ui-sans-serif, system-ui, sans-serif";
      context.fillStyle = recentHit ? "rgba(212,177,111,.96)" : recentMiss ? "rgba(198,87,64,.9)" : "rgba(242,235,220,.78)";
      context.fillText(recentHit ? `锁定 ${missionRef.current.locks}/3` : recentMiss ? "错过窗口" : "光针进入金色窗口时按 SPACE", point.x, point.y + radius + 35);
      context.restore();
    }

    function drawStatusGlyph(now: number, targetPoint: FlightTarget | null) {
      if (phaseRef.current !== "ready" || !targetPoint) return;
      if (readyAt < 0) readyAt = now;
      const progress = clamp((now - readyAt) / 900, 0, 1);
      const point = worldToScreen(targetPoint, now);
      context.save();
      context.translate(point.x, point.y);
      context.rotate(progress * Math.PI * .55);
      context.globalAlpha = 1 - progress * .44;
      context.strokeStyle = "rgba(242,235,220,.86)";
      for (let index = 0; index < 3; index += 1) {
        roundedRect(context, -28 - index * 9, -28 - index * 9, 56 + index * 18, 56 + index * 18, 7 + index * 3);
        context.stroke();
      }
      context.restore();
    }

    function tick(now: number) {
      const dt = clamp((now - previous) / 1000, .001, .034);
      previous = now;
      const targetPoint = targetRef.current;
      if (targetPoint) prepareMission(targetPoint);
      const input = activeRef.current ? inputVector() : { x: 0, y: 0, amount: 0 };
      const phaseNow = phaseRef.current;
      const targetDx = targetPoint ? targetPoint.x - ship.x : 0;
      const targetDy = targetPoint ? targetPoint.y - ship.y : 0;
      const distance = Math.hypot(targetDx, targetDy);
      const boostRequested = keys.has("shift") && input.amount > .05;
      const boost = boostRequested && missionRef.current.energy > 2 && phaseNow === "cruise";
      missionRef.current.energy = clamp(missionRef.current.energy + (boost ? -31 : 15) * dt, 0, 100);
      let ax = input.x * input.amount * (boost ? 22 : 16);
      let ay = input.y * input.amount * (boost ? 22 : 16);

      if (activeRef.current && targetPoint && phaseNow === "cruise") {
        const length = distance || 1;
        const arrivalBrake = clamp(distance / 10, .1, 1);
        ax += targetDx / length * 3.2 * arrivalBrake;
        ay += targetDy / length * 3.2 * arrivalBrake;
      } else if (activeRef.current && targetPoint && (phaseNow === "scanning" || phaseNow === "ready")) {
        const orbitAngle = now * .00042;
        const orbit = { x: targetPoint.x + Math.cos(orbitAngle) * 3.2, y: targetPoint.y + Math.sin(orbitAngle) * 2.55 };
        ax += (orbit.x - ship.x) * 2.5;
        ay += (orbit.y - ship.y) * 2.5;
      }

      const drag = Math.pow(phaseNow === "cruise" ? .925 : .89, dt * 60);
      ship.vx = (ship.vx + ax * dt) * drag;
      ship.vy = (ship.vy + ay * dt) * drag;
      const maxSpeed = boost ? 19 : phaseNow === "scanning" ? 6 : 12;
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > maxSpeed) {
        ship.vx = ship.vx / speed * maxSpeed;
        ship.vy = ship.vy / speed * maxSpeed;
      }
      if (audioEnabled && audioContext && engineGain && engineOscillator) {
        const engineLevel = phaseNow === "idle" || !activeRef.current ? .0001 : .006 + clamp(speed / 19, 0, 1) * (boost ? .024 : .013);
        engineGain.gain.setTargetAtTime(engineLevel, audioContext.currentTime, .055);
        engineOscillator.frequency.setTargetAtTime(40 + clamp(speed / 19, 0, 1) * 58 + (boost ? 22 : 0), audioContext.currentTime, .04);
      }
      ship.x = clamp(ship.x + ship.vx * dt, 1.5, 98.5);
      ship.y = clamp(ship.y + ship.vy * dt, 1.5, 98.5);
      if (Math.hypot(ship.vx, ship.vy) > .18) {
        const desired = Math.atan2(ship.vy, ship.vx);
        let delta = desired - ship.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        ship.angle += delta * clamp(dt * 8, 0, 1);
      }
      ship.bank += (input.x * input.amount - ship.bank) * clamp(dt * 7, 0, 1);
      const lookAhead = phaseNow === "idle" ? 0 : .34;
      camera.x += (ship.x + ship.vx * lookAhead - camera.x) * clamp(dt * 4.4, 0, 1);
      camera.y += (ship.y + ship.vy * lookAhead - camera.y) * clamp(dt * 4.4, 0, 1);
      shake = Math.max(0, shake - dt * 24);

      ship.trail.unshift({ x: ship.x, y: ship.y, age: 0 });
      ship.trail = ship.trail.slice(0, reduceMotion.matches ? 8 : 28).map((point) => ({ ...point, age: point.age + dt }));

      if (activeRef.current && phaseNow === "cruise") {
        updateShards(now);
        updateWells(now);
      }

      context.clearRect(0, 0, width, height);
      drawDust(now, Math.hypot(ship.vx, ship.vy));
      if (targetPoint) {
        drawRoute(targetPoint, targetPoint.color, now);
        drawTarget(targetPoint, targetPoint.color, now, distance);
      }
      if (phaseNow === "cruise") {
        drawWells(now);
        drawShards(now);
      }
      for (let index = ship.trail.length - 1; index >= 0; index -= 1) {
        const point = worldToScreen(ship.trail[index], now);
        context.beginPath();
        context.arc(point.x, point.y, Math.max(.35, 2 - index * .055), 0, Math.PI * 2);
        context.fillStyle = `rgba(198,87,64,${Math.max(0, .2 - index * .006)})`;
        context.fill();
      }
      drawProbe(now);
      drawShip(now, input.amount + (targetPoint && phaseNow === "cruise" ? .32 : 0), boost);
      drawPointer();
      if (targetPoint) drawScanGame(now, targetPoint);
      if (phaseNow !== "ready") readyAt = -10000;
      drawStatusGlyph(now, targetPoint);

      if (activeRef.current && targetPoint && phaseNow === "cruise" && !missionRef.current.arrived && distance < 2.8 && now - missionRef.current.startedAt > 1900) {
        missionRef.current.arrived = true;
        arriveRef.current(targetPoint.id);
      }

      if (now - lastTelemetry > 120) {
        const scanElapsed = missionRef.current.scanStartedAt ? (now - missionRef.current.scanStartedAt) / 1000 : 0;
        const performanceSignal = missionRef.current.samples * 15 + missionRef.current.locks * 12 + missionRef.current.combo * 2 + missionRef.current.integrity * .08;
        const scanBase = phaseNow === "cruise"
          ? clamp(7 + performanceSignal, 5, 91)
          : phaseNow === "scanning"
            ? clamp(38 + performanceSignal * .48 + scanElapsed * 3.2, 38, worldReadyRef.current && missionRef.current.locks >= 2 ? 100 : 96)
            : phaseNow === "ready" ? 100 : 0;
        telemetryRef.current({
          speed: Math.round(Math.hypot(ship.vx, ship.vy) * 84),
          distance: Math.round(distance * 1.7),
          signal: Math.round(scanBase),
          probes: missionRef.current.probes,
          samples: missionRef.current.samples,
          energy: Math.round(missionRef.current.energy),
          integrity: Math.round(missionRef.current.integrity),
          locks: missionRef.current.locks,
          combo: missionRef.current.combo,
        });
        lastTelemetry = now;
      }
      frame = window.requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    window.addEventListener("spark-flight-audio", audioToggle);
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("spark-flight-audio", audioToggle);
      if (engineOscillator) engineOscillator.stop();
      if (audioContext) void audioContext.close();
    };
  }, []);

  return <canvas ref={canvasRef} className="space-flight" aria-hidden="true" />;
}
