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
    depth: .25 + random() * .75,
    size: .4 + random() * 1.35,
    drift: (random() - .5) * .014,
    alpha: .16 + random() * .48,
  }));
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
 * A persistent, code-native flight surface. Physics and drawing stay outside
 * React's render loop; React only receives a throttled instrument snapshot.
 */
export function SpaceFlight({ active, phase, target, worldReady, onArrive, onTelemetry }: SpaceFlightProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  const phaseRef = useRef(phase);
  const targetRef = useRef<FlightTarget | null>(target);
  const worldReadyRef = useRef(worldReady);
  const arriveRef = useRef(onArrive);
  const telemetryRef = useRef(onTelemetry);
  const missionRef = useRef({ key: "", startedAt: 0, arrived: false, probes: 0, samples: 0, scanStartedAt: 0 });

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
    missionRef.current = { key, startedAt: performance.now(), arrived: false, probes: 0, samples: 0, scanStartedAt: 0 };
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

    const dust = seededDust(126);
    const keys = new Set<string>();
    const pointer = { active: false, id: -1, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } };
    const ship = { x: 50, y: 50, vx: 0, vy: 0, angle: -Math.PI / 2, trail: [] as Array<Point & { age: number }> };
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let previous = performance.now();
    let lastTelemetry = 0;
    let probeAt = -10000;
    let processedProbeAt = -10000;
    let readyAt = -10000;
    let renderedMission = "";
    let shards: SignalShard[] = [];

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

    function keyDown(event: KeyboardEvent) {
      if (!activeRef.current || isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(key)) {
        keys.add(key);
        event.preventDefault();
      }
      if (event.code === "Space") {
        event.preventDefault();
        probeAt = performance.now();
        missionRef.current.probes += 1;
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
      pointer.active = false;
      pointer.id = -1;
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
        x += clamp((pointer.current.x - pointer.origin.x) / 54, -1, 1);
        y += clamp((pointer.current.y - pointer.origin.y) / 54, -1, 1);
      }
      const length = Math.hypot(x, y) || 1;
      return { x: x / length, y: y / length, amount: clamp(Math.hypot(x, y), 0, 1) };
    }

    function drawDust(now: number, speed: number) {
      for (const particle of dust) {
        const parallax = now * particle.drift * particle.depth + ship.x * particle.depth * .002;
        const x = ((particle.x + parallax) % 1 + 1) % 1 * width;
        const y = ((particle.y + ship.y * particle.depth * .0015) % 1 + 1) % 1 * height;
        const streak = phaseRef.current === "cruise" ? clamp(speed * particle.depth * .7, 0, 8) : 0;
        context.beginPath();
        context.moveTo(x - Math.cos(ship.angle) * streak, y - Math.sin(ship.angle) * streak);
        context.lineTo(x, y);
        context.strokeStyle = `rgba(230,225,210,${particle.alpha})`;
        context.lineWidth = particle.size;
        context.stroke();
      }
    }

    function drawRoute(targetPoint: Point, color: string, now: number) {
      const sx = ship.x / 100 * width;
      const sy = ship.y / 100 * height;
      const tx = targetPoint.x / 100 * width;
      const ty = targetPoint.y / 100 * height;
      const rgb = hexToRgb(color);
      context.save();
      context.setLineDash([3, 10]);
      context.lineDashOffset = -now * .025;
      context.beginPath();
      context.moveTo(sx, sy);
      context.quadraticCurveTo((sx + tx) / 2 + (ty - sy) * .08, (sy + ty) / 2 - (tx - sx) * .08, tx, ty);
      context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.35)`;
      context.lineWidth = 1;
      context.stroke();
      context.restore();
    }

    function drawTarget(targetPoint: Point, color: string, now: number) {
      const x = targetPoint.x / 100 * width;
      const y = targetPoint.y / 100 * height;
      const rgb = hexToRgb(color);
      const pulse = 1 + Math.sin(now * .004) * .12;
      context.save();
      context.translate(x, y);
      context.rotate(now * .00032);
      context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},.72)`;
      context.lineWidth = 1;
      context.setLineDash([5, 7]);
      context.beginPath();
      context.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      for (let i = 0; i < 3; i += 1) {
        const angle = i * Math.PI * 2 / 3 + now * .0006;
        context.beginPath();
        context.arc(Math.cos(angle) * 34, Math.sin(angle) * 23, 1.6, 0, Math.PI * 2);
        context.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${.55 + i * .12})`;
        context.fill();
      }
      context.restore();
    }

    function prepareMission(targetPoint: FlightTarget) {
      const key = `${targetPoint.id}:${targetPoint.mission}`;
      if (key === renderedMission) return;
      renderedMission = key;
      const dx = targetPoint.x - ship.x;
      const dy = targetPoint.y - ship.y;
      const length = Math.hypot(dx, dy) || 1;
      const normal = { x: -dy / length, y: dx / length };
      shards = [.2, .39, .59, .78].map((step, index) => ({
        x: clamp(ship.x + dx * step + normal.x * (index % 2 ? -3.2 : 3.2), 4, 96),
        y: clamp(ship.y + dy * step + normal.y * (index % 2 ? -3.2 : 3.2), 4, 96),
        collected: false,
        phase: index * 1.7,
      }));
    }

    function collectShard(shard: SignalShard, now: number) {
      if (shard.collected) return;
      shard.collected = true;
      missionRef.current.samples += 1;
      probeAt = now;
      if ("vibrate" in navigator) navigator.vibrate(8);
    }

    function updateShards(now: number) {
      for (const shard of shards) {
        if (shard.collected) continue;
        const distance = Math.hypot(shard.x - ship.x, shard.y - ship.y);
        if (distance < 2.5) collectShard(shard, now);
        if (probeAt !== processedProbeAt && distance < 10) collectShard(shard, now);
      }
      processedProbeAt = probeAt;
    }

    function drawShards(now: number) {
      for (const shard of shards) {
        if (shard.collected) continue;
        const x = shard.x / 100 * width;
        const y = shard.y / 100 * height;
        const pulse = 1 + Math.sin(now * .005 + shard.phase) * .18;
        context.save();
        context.translate(x, y);
        context.rotate(now * .0007 + shard.phase);
        context.strokeStyle = "rgba(197,163,107,.76)";
        context.fillStyle = "rgba(197,163,107,.09)";
        context.lineWidth = 1;
        context.beginPath();
        for (let point = 0; point < 6; point += 1) {
          const angle = point * Math.PI / 3;
          const px = Math.cos(angle) * 7 * pulse;
          const py = Math.sin(angle) * 7 * pulse;
          if (!point) context.moveTo(px, py); else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 1.7, 0, Math.PI * 2);
        context.fillStyle = "rgba(242,235,220,.92)";
        context.shadowColor = "rgba(197,163,107,.9)";
        context.shadowBlur = 9;
        context.fill();
        context.restore();
      }
    }

    function drawProbe(now: number) {
      const elapsed = now - probeAt;
      if (elapsed < 0 || elapsed > 1050) return;
      const progress = elapsed / 1050;
      const x = ship.x / 100 * width;
      const y = ship.y / 100 * height;
      context.beginPath();
      context.arc(x, y, 15 + progress * 105, 0, Math.PI * 2);
      context.strokeStyle = `rgba(127,166,160,${(1 - progress) * .7})`;
      context.lineWidth = 1.2;
      context.stroke();
    }

    function drawShip(now: number, thrust: number, boost: boolean) {
      const x = ship.x / 100 * width;
      const y = ship.y / 100 * height;
      const scale = clamp(Math.min(width, height) / 620, .72, 1.05);
      const glow = boost ? 1 : .56 + thrust * .28;
      context.save();
      context.translate(x, y);
      context.rotate(ship.angle + Math.PI / 2);

      const engine = context.createLinearGradient(0, 12 * scale, 0, 39 * scale);
      engine.addColorStop(0, `rgba(242,235,220,${.8 * glow})`);
      engine.addColorStop(.34, `rgba(198,87,64,${.58 * glow})`);
      engine.addColorStop(1, "rgba(198,87,64,0)");
      context.beginPath();
      context.moveTo(-4 * scale, 11 * scale);
      context.quadraticCurveTo(0, (28 + Math.sin(now * .025) * 6) * scale, 4 * scale, 11 * scale);
      context.fillStyle = engine;
      context.fill();

      context.beginPath();
      context.moveTo(0, -17 * scale);
      context.lineTo(12 * scale, 12 * scale);
      context.lineTo(4 * scale, 8 * scale);
      context.lineTo(0, 13 * scale);
      context.lineTo(-4 * scale, 8 * scale);
      context.lineTo(-12 * scale, 12 * scale);
      context.closePath();
      context.fillStyle = "rgba(10,14,12,.96)";
      context.strokeStyle = "rgba(242,235,220,.88)";
      context.lineWidth = 1.15;
      context.fill();
      context.stroke();

      context.beginPath();
      context.moveTo(0, -11 * scale);
      context.lineTo(4 * scale, 3 * scale);
      context.lineTo(0, 8 * scale);
      context.lineTo(-4 * scale, 3 * scale);
      context.closePath();
      context.fillStyle = "rgba(127,166,160,.82)";
      context.shadowColor = "rgba(127,166,160,.72)";
      context.shadowBlur = 10;
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
      context.arc(ox, oy, 27, 0, Math.PI * 2);
      context.strokeStyle = "rgba(224,215,193,.24)";
      context.stroke();
      context.beginPath();
      context.arc(ox + clamp(cx - ox, -27, 27), oy + clamp(cy - oy, -27, 27), 7, 0, Math.PI * 2);
      context.fillStyle = "rgba(242,235,220,.64)";
      context.fill();
    }

    function drawStatusGlyph(now: number) {
      if (phaseRef.current !== "ready") return;
      if (readyAt < 0) readyAt = now;
      const elapsed = now - readyAt;
      const progress = clamp(elapsed / 900, 0, 1);
      const targetPoint = targetRef.current;
      if (targetPoint) prepareMission(targetPoint);
      if (!targetPoint) return;
      const x = targetPoint.x / 100 * width;
      const y = targetPoint.y / 100 * height;
      context.save();
      context.translate(x, y);
      context.rotate(progress * Math.PI * .55);
      context.globalAlpha = 1 - progress * .55;
      context.strokeStyle = "rgba(242,235,220,.82)";
      for (let i = 0; i < 3; i += 1) {
        roundedRect(context, -26 - i * 8, -26 - i * 8, 52 + i * 16, 52 + i * 16, 7 + i * 3);
        context.stroke();
      }
      context.restore();
    }

    function tick(now: number) {
      const dt = clamp((now - previous) / 1000, .001, .034);
      previous = now;
      const targetPoint = targetRef.current;
      const input = inputVector();
      const boost = keys.has("shift");
      const targetDx = targetPoint ? targetPoint.x - ship.x : 0;
      const targetDy = targetPoint ? targetPoint.y - ship.y : 0;
      const distance = Math.hypot(targetDx, targetDy);
      const phaseNow = phaseRef.current;
      let ax = input.x * input.amount * 13;
      let ay = input.y * input.amount * 13;

      if (targetPoint && phaseNow === "cruise") {
        const length = distance || 1;
        const arrivalBrake = clamp(distance / 9, .16, 1);
        ax += targetDx / length * 9.5 * arrivalBrake;
        ay += targetDy / length * 9.5 * arrivalBrake;
      } else if (targetPoint && (phaseNow === "scanning" || phaseNow === "ready")) {
        const orbitAngle = now * .00042;
        const orbit = { x: targetPoint.x + Math.cos(orbitAngle) * 2.7, y: targetPoint.y + Math.sin(orbitAngle) * 2.15 };
        ax += (orbit.x - ship.x) * 2.4;
        ay += (orbit.y - ship.y) * 2.4;
      }

      const drag = Math.pow(.90, dt * 60);
      ship.vx = (ship.vx + ax * dt) * drag;
      ship.vy = (ship.vy + ay * dt) * drag;
      const maxSpeed = boost ? 17 : phaseNow === "scanning" ? 6.5 : 12;
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > maxSpeed) { ship.vx = ship.vx / speed * maxSpeed; ship.vy = ship.vy / speed * maxSpeed; }
      ship.x = clamp(ship.x + ship.vx * dt, 1.5, 98.5);
      ship.y = clamp(ship.y + ship.vy * dt, 1.5, 98.5);
      if (Math.hypot(ship.vx, ship.vy) > .18) {
        const desired = Math.atan2(ship.vy, ship.vx);
        let delta = desired - ship.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        ship.angle += delta * clamp(dt * 7, 0, 1);
      }

      ship.trail.unshift({ x: ship.x, y: ship.y, age: 0 });
      ship.trail = ship.trail.slice(0, 22).map((point) => ({ ...point, age: point.age + dt }));

      context.clearRect(0, 0, width, height);
      drawDust(now, Math.hypot(ship.vx, ship.vy));
      if (targetPoint) {
        drawRoute(targetPoint, targetPoint.color, now);
        drawTarget(targetPoint, targetPoint.color, now);
      }
      if (phaseNow === "cruise") { updateShards(now); drawShards(now); }
      for (let index = ship.trail.length - 1; index >= 0; index -= 1) {
        const point = ship.trail[index];
        context.beginPath();
        context.arc(point.x / 100 * width, point.y / 100 * height, Math.max(.35, 1.8 - index * .06), 0, Math.PI * 2);
        context.fillStyle = `rgba(198,87,64,${Math.max(0, .18 - index * .007)})`;
        context.fill();
      }
      drawProbe(now);
      drawShip(now, input.amount + (targetPoint && phaseNow === "cruise" ? .42 : 0), boost);
      drawPointer();
      if (phaseNow !== "ready") readyAt = -10000;
      drawStatusGlyph(now);

      if (targetPoint && phaseNow === "cruise" && !missionRef.current.arrived && distance < 2.25 && now - missionRef.current.startedAt > 2100) {
        missionRef.current.arrived = true;
        arriveRef.current(targetPoint.id);
      }

      if (now - lastTelemetry > 140) {
        const scanElapsed = missionRef.current.scanStartedAt ? (now - missionRef.current.scanStartedAt) / 1000 : 0;
        const scanBase = phaseNow === "cruise" ? clamp(8 + missionRef.current.samples * 19 + missionRef.current.probes * 4, 6, 88) : phaseNow === "scanning" ? clamp(42 + missionRef.current.samples * 9 + scanElapsed * 2.2 + missionRef.current.probes * 5, 42, worldReadyRef.current ? 100 : 94) : phaseNow === "ready" ? 100 : 0;
        telemetryRef.current({ speed: Math.round(Math.hypot(ship.vx, ship.vy) * 84), distance: Math.round(distance * 1.7), signal: Math.round(scanBase), probes: missionRef.current.probes, samples: missionRef.current.samples });
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
    };
  }, []);

  return <canvas ref={canvasRef} className="space-flight" aria-hidden="true" />;
}
