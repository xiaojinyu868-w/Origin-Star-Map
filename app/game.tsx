"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type NodeStatus = "origin" | "frontier" | "discovered";
type EdgeKind = "normal" | "bridge" | "wild";
type SectorKey = "life" | "mind" | "society" | "matter" | "creation" | "systems";
type Verdict = "hit" | "near" | "twist";
type Interaction = "choice" | "scale" | "arrange";

type Spark = { title: string; field: string; insight: string };
type AtlasNode = { id: string; name: string; field: string; hook: string; status: NodeStatus; sector?: SectorKey; spark?: Spark; connectionReason?: string };
type AtlasEdge = { from: string; to: string; kind: EdgeKind };
type Constellation = { id: string; name: string; line: string; motif: string; nodeIds: string[] };
type AtlasState = { version: 5; nodes: AtlasNode[]; edges: AtlasEdge[]; profileSignals: string[]; expeditions: number; constellations: Constellation[] };
type Encounter = { signal: string; question: string; interaction: Interaction; choices: string[]; scale: { left: string; right: string } | null; items: string[]; visual: "pulse" | "orbit" | "split" | "network" | "scale"; token: string };
type NextNode = { name: string; field: string; sector: SectorKey; promise: string; kind: "deeper" | "bridge" | "wild"; connection_reason: string };
type Resolution = { verdict: Verdict; echo: string; answer_title: string; scene: string; explanation: string; terms: Array<{ term: string; meaning: string }>; why_it_matters: string; spark: Spark; profile_signal: string; source_note: string; next_nodes: NextNode[] };
type PanelStage = "summary" | "loading" | "observe" | "resolving" | "reveal";
type EngineState = "checking" | "ready" | "offline";
type AtlasPosition = { x: number; y: number; sector: SectorKey };
type FlightDirection = "up" | "down" | "left" | "right";
type FlightTrace = { from: string; to: string; serial: number };
type FlightFeedback = { kind: "arrive" | "blocked"; serial: number };

const STORAGE_KEY = "spark-atlas-v5";
const OLD_STORAGE_KEYS = ["spark-atlas-v4", "spark-atlas-v3"];
const SECTORS: Array<{ key: SectorKey; label: string; angle: number }> = [
  { key: "life", label: "生命", angle: -150 }, { key: "mind", label: "心智", angle: -90 }, { key: "creation", label: "创造", angle: -30 },
  { key: "society", label: "社会", angle: 30 }, { key: "systems", label: "秩序", angle: 90 }, { key: "matter", label: "物质", angle: 150 },
];

function inferSector(field = ""): SectorKey {
  if (/生物|生态|真菌|医学|神经|基因|演化/.test(field)) return "life";
  if (/心理|认知|语言|哲学|意识|教育/.test(field)) return "mind";
  if (/艺术|音乐|文学|设计|历史|美学/.test(field)) return "creation";
  if (/社会|城市|经济|政治|人类|博弈|传播/.test(field)) return "society";
  if (/物理|化学|天文|地质|材料|量子/.test(field)) return "matter";
  return "systems";
}

const SEED_NODES: AtlasNode[] = [
  { id: "origin", name: "未完成的天球", field: "观测起点", hook: "所有尚未说出口的困惑。", status: "origin", sector: "systems" },
  { id: "cooperation", name: "替陌生雏鸟守夜", field: "演化生物学", hook: "看一张更大的嘴如何劫持照料本能", status: "frontier", sector: "life" },
  { id: "random", name: "硬币落下第一万次", field: "概率论", hook: "看混乱慢慢露出轮廓", status: "frontier", sector: "systems" },
  { id: "music", name: "两个音之间的拍频", field: "音乐与声学", hook: "听见空气制造期待", status: "frontier", sector: "creation" },
  { id: "language", name: "蓝色边界的几十毫秒", field: "心理语言学", hook: "看一个词如何抢先抵达", status: "frontier", sector: "mind" },
  { id: "city", name: "城市长大后的胃口", field: "城市科学", hook: "估量一座城的代谢", status: "frontier", sector: "society" },
  { id: "ship", name: "最后一块旧木板", field: "身份哲学", hook: "寻找事物留下自己的位置", status: "frontier", sector: "mind" },
  { id: "fungus", name: "白杨树下的糖", field: "真菌生态学", hook: "跟随地下资源的去向", status: "frontier", sector: "life" },
  { id: "quantum", name: "观测前的一粒光", field: "量子物理", hook: "触碰测量与现实的边缘", status: "frontier", sector: "matter" },
];

const INITIAL_ATLAS: AtlasState = { version: 5, nodes: SEED_NODES, edges: SEED_NODES.slice(1).map((node) => ({ from: "origin", to: node.id, kind: "normal" })), profileSignals: [], expeditions: 0, constellations: [] };

function migrateAtlas(value: unknown): AtlasState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AtlasState> & { version?: number };
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  if (raw.version === 5) return raw as AtlasState;
  if (raw.version === 3 || raw.version === 4) return { version: 5, nodes: raw.nodes.map((node) => ({ ...node, sector: node.sector || inferSector(node.field) })), edges: raw.edges, profileSignals: raw.profileSignals || [], expeditions: raw.expeditions || 0, constellations: [] };
  return null;
}

async function atlasRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/atlas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "制图台没有回信");
  return data;
}

function positionAtlas(nodes: AtlasNode[]) {
  const positions = new Map<string, AtlasPosition>();
  positions.set("origin", { x: 50, y: 50, sector: "systems" });
  for (const sector of SECTORS) {
    const group = nodes.filter((node) => node.id !== "origin" && (node.sector || inferSector(node.field)) === sector.key);
    const radians = sector.angle * Math.PI / 180;
    const centerX = 50 + Math.cos(radians) * 32;
    const centerY = 50 + Math.sin(radians) * 27;
    group.forEach((node, index) => {
      const spiral = index * 2.39996; const radius = Math.min(3 + Math.sqrt(index) * 6.2, 15);
      positions.set(node.id, { x: Math.max(6, Math.min(94, centerX + Math.cos(spiral) * radius)), y: Math.max(7, Math.min(93, centerY + Math.sin(spiral) * radius)), sector: sector.key });
    });
  }
  return positions;
}

function focusSector(nodes: AtlasNode[], base: Map<string, AtlasPosition>, activeSector: SectorKey | "all") {
  if (activeSector === "all") return base;
  const focused = new Map(base);
  focused.set("origin", { x: 13, y: 52, sector: "systems" });
  const group = nodes.filter((node) => node.id !== "origin" && (node.sector || inferSector(node.field)) === activeSector);
  group.forEach((node, index) => {
    const angle = index * 2.39996 - Math.PI / 2;
    const radius = Math.min(8 + Math.sqrt(index) * 11, 34);
    focused.set(node.id, { x: 52 + Math.cos(angle) * radius, y: 52 + Math.sin(angle) * radius * .66, sector: activeSector });
  });
  return focused;
}

function constellationPosition(constellation: Constellation, positions: Map<string, { x: number; y: number }>) {
  const points = constellation.nodeIds.map((id) => positions.get(id)).filter(Boolean) as Array<{ x: number; y: number }>;
  if (!points.length) return { x: 50, y: 50 };
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

function directionalTarget(currentId: string, candidates: AtlasNode[], positions: Map<string, AtlasPosition>, direction: FlightDirection) {
  const current = positions.get(currentId);
  if (!current) return null;
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.id === currentId) continue;
    const point = positions.get(candidate.id);
    if (!point) continue;
    const dx = point.x - current.x;
    const dy = point.y - current.y;
    const horizontal = direction === "left" || direction === "right";
    const forward = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    if (forward <= .8) continue;
    const sideways = horizontal ? Math.abs(dy) * 1.35 : Math.abs(dx) * .72;
    const score = forward + sideways * 2.7 + (sideways / forward) * 11;
    if (!best || score < best.score) best = { id: candidate.id, score };
  }
  return best?.id || null;
}

export function CuriosityGame() {
  const [atlas, setAtlas] = useState<AtlasState>(INITIAL_ATLAS);
  const [engine, setEngine] = useState<EngineState>("checking");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<PanelStage>("summary");
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [scaleValue, setScaleValue] = useState(50);
  const [arranged, setArranged] = useState<string[]>([]);
  const [chartInput, setChartInput] = useState("");
  const [charting, setCharting] = useState(false);
  const [activeSector, setActiveSector] = useState<SectorKey | "all">("all");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [constellationReveal, setConstellationReveal] = useState<Constellation | null>(null);
  const [toast, setToast] = useState("");
  const [newNodeIds, setNewNodeIds] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [navigatorId, setNavigatorId] = useState<string | null>(null);
  const [flightTrace, setFlightTrace] = useState<FlightTrace | null>(null);
  const [flightFeedback, setFlightFeedback] = useState<FlightFeedback>({ kind: "arrive", serial: 0 });
  const requestSerial = useRef(0);
  const flightSerial = useRef(0);

  const nodeById = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const basePositions = useMemo(() => positionAtlas(atlas.nodes), [atlas.nodes]);
  const positions = useMemo(() => focusSector(atlas.nodes, basePositions, activeSector), [atlas.nodes, basePositions, activeSector]);
  const selectedNode = selectedId ? nodeById.get(selectedId) || null : null;
  const discovered = useMemo(() => atlas.nodes.filter((node) => node.status === "discovered"), [atlas.nodes]);
  const frontiers = useMemo(() => atlas.nodes.filter((node) => node.status === "frontier"), [atlas.nodes]);
  const recentIds = useMemo(() => new Set(discovered.slice(-2).map((node) => node.id)), [discovered]);
  const discoveredFields = useMemo(() => new Set(discovered.map((node) => node.field)), [discovered]);
  const discoveredSectors = useMemo(() => new Set(discovered.map((node) => node.sector || inferSector(node.field))), [discovered]);
  const recommended = useMemo(() => frontiers.find((node) => !discoveredFields.has(node.field) && !discoveredSectors.has(node.sector || inferSector(node.field))) || frontiers.find((node) => !discoveredFields.has(node.field)) || frontiers[atlas.expeditions % Math.max(1, frontiers.length)] || null, [frontiers, discoveredFields, discoveredSectors, atlas.expeditions]);
  const fieldCount = discoveredFields.size;
  const expeditionStep = atlas.expeditions % 3;
  const expeditionNumber = Math.floor(atlas.expeditions / 3) + 1;
  const constellationWaiting = atlas.constellations.length < Math.floor(atlas.expeditions / 3);
  const observationsRemaining = constellationWaiting ? 0 : 3 - expeditionStep;
  const focusedGroupSize = useMemo(() => activeSector === "all" ? 0 : atlas.nodes.filter((node) => node.id !== "origin" && (node.sector || inferSector(node.field)) === activeSector).length, [activeSector, atlas.nodes]);
  const flightCandidates = useMemo(() => activeSector === "all" ? atlas.nodes : atlas.nodes.filter((node) => node.id === "origin" || (node.sector || inferSector(node.field)) === activeSector), [activeSector, atlas.nodes]);
  const visibleNavigatorNode = navigatorId ? flightCandidates.find((node) => node.id === navigatorId) || null : null;
  const flightNode = visibleNavigatorNode || flightCandidates.find((node) => node.id === recommended?.id) || flightCandidates.find((node) => node.status === "frontier") || flightCandidates[0] || null;
  const flightPosition = flightNode ? positions.get(flightNode.id) || null : null;
  const traceFrom = flightTrace ? positions.get(flightTrace.from) || null : null;
  const traceTo = flightTrace ? positions.get(flightTrace.to) || null : null;
  const chartConstellations = useMemo(() => { const seen = new Set<string>(); return atlas.constellations.filter((item) => { if (seen.has(item.name)) return false; seen.add(item.name); return true; }); }, [atlas.constellations]);

  useEffect(() => {
    try {
      let saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) for (const key of OLD_STORAGE_KEYS) { saved = window.localStorage.getItem(key); if (saved) break; }
      const migrated = saved ? migrateAtlas(JSON.parse(saved)) : null;
      if (migrated) {
        // Local storage is an external system; rehydrate it once after the client mounts.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAtlas(migrated); setIntroOpen(false);
      }
    } catch { window.localStorage.removeItem(STORAGE_KEY); } finally { setStorageReady(true); }
    fetch("/api/atlas").then((response) => response.json()).then((data) => setEngine(data.connected ? "ready" : "offline")).catch(() => setEngine("offline"));
  }, []);

  useEffect(() => { if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(atlas)); }, [atlas, storageReady]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2800); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!newNodeIds.length) return; const timer = window.setTimeout(() => setNewNodeIds([]), 2200); return () => window.clearTimeout(timer); }, [newNodeIds]);

  function mapContext() { return { discovered: discovered.map((node) => node.name), frontier: atlas.nodes.filter((node) => node.status === "frontier").map((node) => node.name), fields: [...new Set(discovered.map((node) => node.field))] }; }
  function clearObservation() { setEncounter(null); setResolution(null); setArranged([]); setScaleValue(50); }
  function closeObservation() { requestSerial.current += 1; setSelectedId(null); setStage("summary"); clearObservation(); }

  async function launchEncounter(node: AtlasNode) {
    setSelectedId(node.id); setIntroOpen(false); clearObservation();
    if (engine !== "ready") { setStage("summary"); setToast("制图台暂时离线"); return; }
    setStage("loading"); const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "encounter", node, map: mapContext() });
      if (requestId !== requestSerial.current) return;
      setEncounter(data as Encounter); setStage("observe");
    } catch (error) { if (requestId !== requestSerial.current) return; setToast(error instanceof Error ? error.message : "观测没有成形"); setStage("summary"); }
  }

  function selectNode(node: AtlasNode) {
    requestSerial.current += 1;
    if (node.status === "frontier") { launchEncounter(node); return; }
    setSelectedId(node.id); setStage("summary"); setIntroOpen(false); clearObservation();
  }

  function moveFlight(direction: FlightDirection) {
    if (!flightNode) return;
    const nextId = directionalTarget(flightNode.id, flightCandidates, positions, direction);
    const serial = ++flightSerial.current;
    if (!nextId) { setFlightFeedback({ kind: "blocked", serial }); return; }
    setFlightTrace({ from: flightNode.id, to: nextId, serial });
    setFlightFeedback({ kind: "arrive", serial });
    setNavigatorId(nextId);
    setInspectedId(nextId);
  }

  function activateFlightNode() { if (flightNode) selectNode(flightNode); }

  function chooseSector(sector: SectorKey | "all") {
    setActiveSector(sector);
    setNavigatorId(null);
    setFlightTrace(null);
    setInspectedId(null);
  }

  async function resolveObservation(payload: Record<string, unknown>) {
    if (!selectedNode || !encounter || stage !== "observe") return;
    setStage("resolving"); const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "resolve", token: encounter.token, ...payload });
      if (requestId !== requestSerial.current) return;
      const resolved = data as Resolution;
      setAtlas((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, status: "discovered" as const, spark: resolved.spark } : node), profileSignals: [...current.profileSignals, resolved.profile_signal].slice(-12), expeditions: current.expeditions + 1 }));
      setResolution(resolved); setStage("reveal");
    } catch (error) { if (requestId !== requestSerial.current) return; setToast(error instanceof Error ? error.message : "这页档案没有写完"); setStage("observe"); }
  }

  function pickArrangeItem(item: string) { setArranged((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]); }

  async function nameConstellationIfDue() {
    const earnedConstellations = Math.floor(atlas.expeditions / 3);
    if (earnedConstellations === 0 || atlas.constellations.length >= earnedConstellations) return;
    const recent = discovered.slice(-3).map((node) => ({ name: node.name, field: node.field, spark: node.spark?.insight }));
    if (recent.length < 3) return;
    try {
      const data = await atlasRequest({ mode: "constellation", recent_nodes: recent, profile_signals: atlas.profileSignals });
      const constellation: Constellation = { id: `constellation-${atlas.constellations.length + 1}`, name: data.name, line: data.line, motif: data.motif, nodeIds: discovered.slice(-3).map((node) => node.id) };
      setAtlas((current) => ({ ...current, constellations: [...current.constellations, constellation] }));
      setConstellationReveal(constellation);
    } catch { setToast("这组星还没有决定自己的名字"); }
  }

  async function chooseRoute(route: NextNode) {
    if (!selectedNode) return;
    const existing = atlas.nodes.find((node) => node.name === route.name);
    const nextId = existing?.id || `route-${atlas.nodes.length}-${atlas.expeditions}-${route.kind}`;
    setAtlas((current) => ({ ...current, nodes: existing ? current.nodes : [...current.nodes, { id: nextId, name: route.name, field: route.field, hook: route.promise, status: "frontier", sector: route.sector || inferSector(route.field), connectionReason: route.connection_reason }], edges: current.edges.some((edge) => edge.from === selectedNode.id && edge.to === nextId) ? current.edges : [...current.edges, { from: selectedNode.id, to: nextId, kind: route.kind === "deeper" ? "normal" : route.kind }] }));
    setNewNodeIds([nextId]); setActiveSector(route.sector || inferSector(route.field)); setNavigatorId(nextId); closeObservation();
    await nameConstellationIfDue();
  }

  async function chartThought() {
    const thought = chartInput.trim(); if (!thought || charting || engine !== "ready") return;
    setCharting(true);
    try {
      const data = await atlasRequest({ mode: "chart", thought, map: mapContext() });
      const parent = atlas.nodes.find((node) => node.name === data.parent_hint) || atlas.nodes[0]; const id = `charted-${atlas.nodes.length}-${atlas.expeditions}`; const sector = data.node.sector || inferSector(data.node.field);
      setAtlas((current) => ({ ...current, nodes: [...current.nodes, { id, ...data.node, status: "frontier", sector, connectionReason: data.nav_note }], edges: [...current.edges, { from: parent.id, to: id, kind: "bridge" }] }));
      setNewNodeIds([id]); setActiveSector(sector); setNavigatorId(id); setChartInput(""); setToast("这件事被收进了夜空");
    } catch (error) { setToast(error instanceof Error ? error.message : "这件事暂时找不到位置"); } finally { setCharting(false); }
  }

  async function copyConstellation(item: Constellation) {
    try {
      await navigator.clipboard.writeText(`我的好奇心星座：${item.name}\n${item.line}\n母题：${item.motif}\n——星火档案`);
      setToast("星座签已经复制");
    } catch { setToast("暂时无法复制，请稍后再试"); }
  }

  function resetAtlas() { setAtlas(INITIAL_ATLAS); closeObservation(); setIntroOpen(true); setArchiveOpen(false); setResetOpen(false); setActiveSector("all"); setInspectedId(null); setNavigatorId(null); setFlightTrace(null); for (const key of [STORAGE_KEY, ...OLD_STORAGE_KEYS]) window.localStorage.removeItem(key); }

  useEffect(() => {
    function onFlightKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (introOpen || archiveOpen || resetOpen || constellationReveal || selectedId) return;
      const direction: FlightDirection | null = event.key === "w" || event.key === "W" || event.key === "ArrowUp" ? "up" : event.key === "s" || event.key === "S" || event.key === "ArrowDown" ? "down" : event.key === "a" || event.key === "A" || event.key === "ArrowLeft" ? "left" : event.key === "d" || event.key === "D" || event.key === "ArrowRight" ? "right" : null;
      if (direction) { event.preventDefault(); moveFlight(direction); return; }
      if (event.key !== "Enter" && event.code !== "Space") return;
      if (target?.closest("button, a, summary")) return;
      event.preventDefault(); activateFlightNode();
    }
    window.addEventListener("keydown", onFlightKey);
    return () => window.removeEventListener("keydown", onFlightKey);
  }, [archiveOpen, constellationReveal, introOpen, resetOpen, selectedId, flightNode, flightCandidates, positions]);

  return (
    <main className="archive-shell">
      <a className="skip-link" href="#star-chart">跳到星图</a>
      <header className="archive-header">
        <button className="archive-brand" type="button" onClick={() => setIntroOpen(true)}><i aria-hidden="true">✦</i><span><b>星火档案</b><small>THE ATLAS OF UNFINISHED QUESTIONS</small></span></button>
        <p><span>百门计划 · {fieldCount} / 100</span><i /> <span>第 {expeditionNumber} 轮远征</span></p>
        <button className="archive-button" type="button" onClick={() => setArchiveOpen(true)}>打开档案 <b>{discovered.length}</b></button>
      </header>

      <section id="star-chart" className={`chart-viewport ${activeSector === "all" ? "overview" : "sector-focus"} ${navigatorId ? "flight-active" : "flight-standby"}`} aria-label="个人知识天球图" aria-keyshortcuts="W A S D ArrowUp ArrowDown ArrowLeft ArrowRight Enter">
        <div className="paper-grain" aria-hidden="true" />
        <nav className="sky-index" aria-label="星域索引">
          <button className={activeSector === "all" ? "active" : ""} type="button" aria-pressed={activeSector === "all"} onClick={() => chooseSector("all")}>全部星域</button>
          {SECTORS.map((sector) => <button key={sector.key} className={activeSector === sector.key ? "active" : ""} type="button" aria-pressed={activeSector === sector.key} onClick={() => chooseSector(sector.key)}>{sector.label}<sup>{atlas.nodes.filter((node) => node.id !== "origin" && (node.sector || inferSector(node.field)) === sector.key).length}</sup></button>)}
        </nav>

        <aside className="expedition-brief" aria-label="当前远征">
          <header><small>百门计划 · 第 {Math.min(100, fieldCount + 1)} 个领域</small><span>{constellationWaiting ? "星座等待命名" : `${expeditionStep} / 3`}</span></header>
          <h2>{constellationWaiting ? "有一组星正在等你命名" : observationsRemaining === 3 ? "从一个无法解释的现象出发" : `再完成 ${observationsRemaining} 次观测`}</h2>
          <p>{constellationWaiting ? "完成下一条航线，AI会从你最近的选择里找出一条好奇心母题。" : "不必学完一门专业。先带走一个事实、一幅画面和一个能继续追问的起点。"}</p>
          <div className="expedition-progress" aria-label={`本轮已完成 ${expeditionStep} 次观测`}>{[0,1,2].map((step) => <i className={step < expeditionStep || constellationWaiting ? "filled" : ""} key={step} />)}</div>
          <button type="button" disabled={!recommended || engine !== "ready"} onClick={() => { if (recommended) { setNavigatorId(recommended.id); launchEncounter(recommended); } }}><small>去一个你还没去过的方向</small><b>{recommended?.name || "等待新的信号"}</b><span>{recommended?.hook || "先写下一件你无法解释的事"}</span></button>
        </aside>

        <aside className={`flight-deck ${navigatorId ? "active" : ""}`} aria-label="星图航行控制">
          <header><small>{navigatorId ? "航行中" : "航标待命"}</small><span translate="no">WASD / 方向键</span></header>
          <div><p><b>{flightNode?.name || "等待星图"}</b><span>{flightNode?.field || ""}</span></p><div className="flight-keys" aria-hidden="true" translate="no"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div></div>
          <button type="button" disabled={!flightNode} onClick={activateFlightNode}><span>Enter</span>{flightNode?.status === "frontier" ? "开始观测" : flightNode?.status === "discovered" ? "打开档案" : "回到原点"}</button>
        </aside>

        <div className="chart-canvas">
          <div className="celestial-grid" aria-hidden="true" />
          {SECTORS.map((sector) => { const radians = sector.angle * Math.PI / 180; const isFocused = activeSector === sector.key; const x = isFocused ? 52 : 50 + Math.cos(radians) * 32; const y = isFocused ? 52 : 50 + Math.sin(radians) * 27; return <div key={sector.key} className={`chart-sector ${isFocused ? "focused" : ""} ${activeSector !== "all" && !isFocused ? "muted" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true"><span>{sector.label}</span></div>; })}
          <svg className="chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {atlas.edges.map((edge, index) => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (!from || !to) return null; const muted = activeSector !== "all" && from.sector !== activeSector && to.sector !== activeSector && edge.from !== "origin"; return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`${edge.kind} ${activeSector === "all" ? "overview" : ""} ${muted ? "muted" : ""}`} vectorEffect="non-scaling-stroke" />; })}
            {traceFrom && traceTo && flightTrace ? <line key={flightTrace.serial} className="flight-trace" x1={traceFrom.x} y1={traceFrom.y} x2={traceTo.x} y2={traceTo.y} vectorEffect="non-scaling-stroke" /> : null}
          </svg>

          {chartConstellations.map((constellation) => { const point = constellationPosition(constellation, positions); return <button type="button" className="constellation-mark" key={constellation.id} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={() => setConstellationReveal(constellation)}><i aria-hidden="true" /><span>{constellation.name}</span></button>; })}

          {atlas.nodes.map((node) => { const position = positions.get(node.id); if (!position) return null; const muted = activeSector !== "all" && node.id !== "origin" && position.sector !== activeSector; const guided = recommended?.id === node.id; const inspected = inspectedId === node.id; const navigated = flightNode?.id === node.id; const focusedLabel = node.id === "origin" || guided || recentIds.has(node.id) || (activeSector === position.sector && focusedGroupSize <= 9); const labelVisible = inspected || navigated || newNodeIds.includes(node.id) || (activeSector !== "all" && focusedLabel); return <button key={node.id} type="button" className={`archive-star ${node.status} ${selectedId === node.id ? "selected" : ""} ${guided ? "guided" : ""} ${inspected ? "inspected" : ""} ${navigated ? "navigated" : ""} ${newNodeIds.includes(node.id) ? "newborn" : ""} ${labelVisible ? "show-label" : ""} ${position.x > 72 ? "label-left" : ""} ${position.y > 76 ? "label-up" : ""} ${muted ? "muted" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} onPointerEnter={() => setInspectedId(node.id)} onPointerLeave={() => setInspectedId(null)} onFocus={() => setInspectedId(node.id)} onBlur={() => setInspectedId(null)} onClick={(event) => { event.stopPropagation(); setNavigatorId(node.id); selectNode(node); }} aria-current={navigated ? "true" : undefined} aria-label={`${node.name}，${node.field}，${node.status === "discovered" ? "已归档" : node.status === "origin" ? "起点" : "开始观测"}`}><span className="star-halo" aria-hidden="true" /><i aria-hidden="true">{node.status === "discovered" ? "·" : ""}</i><span className="archive-star-label"><small>{node.field}</small><b>{node.name}</b><em>{node.spark?.insight || node.hook}</em></span></button>; })}

          {flightPosition ? <div key={flightFeedback.serial} className={`star-navigator ${flightFeedback.kind}`} style={{ left: `${flightPosition.x}%`, top: `${flightPosition.y}%` }} aria-hidden="true"><i className="navigator-orbit" /><i className="navigator-arrival" /><b /></div> : null}
        </div>

        <form className="question-entry" onSubmit={(event) => { event.preventDefault(); chartThought(); }}><label htmlFor="new-question">写下一件你最近无法解释的事</label><input id="new-question" name="new-question" autoComplete="off" value={chartInput} onChange={(event) => setChartInput(event.target.value)} placeholder="例如，为什么熟悉的路回程总显得更短……" maxLength={100} disabled={charting} /><button type="submit" disabled={charting || !chartInput.trim()}>{charting ? "正在寻找位置…" : "收入夜空"}</button></form>
      </section>

      {introOpen ? <section className="archive-intro" role="dialog" aria-modal="false" aria-labelledby="intro-heading"><button type="button" className="quiet-close" onClick={() => setIntroOpen(false)} aria-label="关闭序言">×</button><p>百门计划 · 序言</p><h1 id="intro-heading">你被一个专业录取，<br />但世界不止一个专业。</h1><div><span>在100个领域里，各带走一个能继续提问的起点。</span><span>每3次观测，AI会把你的选择连成一组个人星座。</span></div><button type="button" onClick={() => setIntroOpen(false)}>从第1个领域出发</button></section> : null}

      {selectedNode ? <section className="observation-stage" role="dialog" aria-modal="true" aria-label={`${selectedNode.name}观测页`}>
        <div className="observation-sheet">
          <header><p>OBSERVATION {String(atlas.expeditions + (stage === "reveal" ? 0 : 1)).padStart(3, "0")} <i /> {selectedNode.field}</p><button type="button" className="quiet-close" onClick={closeObservation} aria-label="关闭观测页">×</button></header>

          {stage === "summary" ? <div className="sheet-summary"><small>{selectedNode.status === "origin" ? "天球中心" : "已归档标本"}</small><h2>{selectedNode.name}</h2><p>{selectedNode.spark?.insight || selectedNode.hook}</p>{selectedNode.status !== "origin" ? <button className="ink-action" type="button" onClick={() => launchEncounter(selectedNode)} disabled={engine !== "ready"}>再次观测</button> : <button className="ink-action" type="button" onClick={closeObservation}>返回天球</button>}</div> : null}

          {stage === "loading" ? <div className="sheet-loading"><div className="orrery" aria-hidden="true"><i /><i /></div><p>一页新的观测正在显影……</p></div> : null}

          {stage === "observe" && encounter ? <div className="sheet-observe">
            <div className={`specimen visual-${encounter.visual}`} aria-hidden="true"><i /><i /><i /><b>·</b></div>
            <p className="observation-line">{encounter.signal}</p><h2>{encounter.question}</h2>
            {encounter.interaction === "choice" ? <div className="observation-choices">{encounter.choices.map((choice) => <button key={choice} type="button" onClick={() => resolveObservation({ answer: choice })}>{choice}</button>)}</div> : null}
            {encounter.interaction === "scale" && encounter.scale ? <div className="scale-observation"><input type="range" min="0" max="100" value={scaleValue} onChange={(event) => setScaleValue(Number(event.target.value))} aria-label={`在${encounter.scale.left}与${encounter.scale.right}之间估计`} /><div><span>{encounter.scale.left}</span><i style={{ left: `${scaleValue}%` }} /><span>{encounter.scale.right}</span></div><button type="button" onClick={() => resolveObservation({ value: scaleValue })}>定在这里</button></div> : null}
            {encounter.interaction === "arrange" ? <div className="arrange-observation"><div className="arranged-slots">{[0,1,2].map((index) => <span key={index}>{arranged[index] || <i>{index + 1}</i>}</span>)}</div><div className="arrange-items">{encounter.items.map((item) => <button key={item} type="button" className={arranged.includes(item) ? "used" : ""} onClick={() => pickArrangeItem(item)}>{item}</button>)}</div><button className="ink-action" type="button" disabled={arranged.length !== 3} onClick={() => resolveObservation({ order: arranged })}>按这个顺序归档</button></div> : null}
          </div> : null}

          {stage === "resolving" ? <div className="sheet-loading"><div className="orrery resolving" aria-hidden="true"><i /><i /></div><p>墨迹正在沿着你的判断扩散……</p></div> : null}

          {stage === "reveal" && resolution ? <article className="sheet-reveal">
            <p className="echo">{resolution.echo}</p>
            <h2>{resolution.answer_title}</h2>
            <section className="knowledge-scene"><small>先看现场</small><p>{resolution.scene}</p></section>
            <section className="knowledge-explanation"><small>用白话说</small><p>{resolution.explanation}</p></section>
            {resolution.terms.length ? <section className="term-shelf"><small>第一次见到这些词</small><div>{resolution.terms.map((item) => <dl key={item.term}><dt>{item.term}</dt><dd>{item.meaning}</dd></dl>)}</div></section> : null}
            <aside className="why-card"><small>为什么值得记住</small><p>{resolution.why_it_matters}</p></aside>
            <details className="fact-boundary"><summary>依据与边界</summary><span>{resolution.source_note}</span></details>
            <div className="departures"><header><span>接下来，你想弄懂哪件事？</span><small>只取一条路</small></header>{resolution.next_nodes.map((route) => <button type="button" key={`${route.kind}-${route.name}`} onClick={() => chooseRoute(route)}><small>{route.kind === "deeper" ? "继续看" : route.kind === "bridge" ? "换个角度" : "跳到远处"}</small><b>{route.name}</b><span>{route.promise}</span></button>)}</div>
          </article> : null}
        </div>
      </section> : null}

      {archiveOpen ? <section className="archive-drawer" role="dialog" aria-modal="true" aria-labelledby="archive-heading"><header><div><small>百门计划 · 已点亮 {fieldCount} / 100 个领域</small><h2 id="archive-heading">你的档案</h2></div><button className="quiet-close" type="button" onClick={() => setArchiveOpen(false)} aria-label="关闭档案">×</button></header><div className="constellation-list">{atlas.constellations.length ? atlas.constellations.map((item, index) => <article key={item.id}><small>CONSTELLATION {String(index + 1).padStart(2,"0")}</small><h3>{item.name}</h3><p>{item.line}</p><span>{item.motif}</span></article>) : <p className="empty-archive">{constellationWaiting ? "下一条航线会唤醒第一组待命名的星。" : `再完成 ${observationsRemaining} 次观测，第一组星座就会获得名字。`}</p>}</div><div className="specimen-index"><small>已获得的提问起点</small>{discovered.map((node) => <button type="button" key={node.id} onClick={() => { setArchiveOpen(false); selectNode(node); }}><span>{node.name}</span><i>{node.field}</i></button>)}</div><button className="reset-link" type="button" onClick={() => setResetOpen(true)}>重新装订这本档案</button></section> : null}

      {constellationReveal ? <section className="constellation-reveal" role="dialog" aria-modal="true" aria-labelledby="constellation-title"><div className="seal" aria-hidden="true">✦</div><small>一组星获得了名字</small><h2 id="constellation-title">{constellationReveal.name}</h2><p>{constellationReveal.line}</p><div className="constellation-actions"><button type="button" onClick={() => copyConstellation(constellationReveal)}>复制星座签</button><button type="button" onClick={() => setConstellationReveal(null)}>把名字留在夜空</button></div></section> : null}

      {resetOpen ? <section className="reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title"><h2 id="reset-title">重新装订整本档案？</h2><p>所有观测、星座和未走完的路都会消失。</p><div><button type="button" onClick={() => setResetOpen(false)}>保留</button><button type="button" onClick={resetAtlas}>重新开始</button></div></section> : null}
      {engine === "offline" ? <div className="offline-mark" role="status">制图台离线</div> : null}
      {toast ? <div className="archive-toast" role="status">{toast}</div> : null}
    </main>
  );
}
