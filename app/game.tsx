"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";

type NodeStatus = "origin" | "frontier" | "discovered";
type EdgeKind = "normal" | "bridge" | "wild";
type SectorKey = "life" | "mind" | "society" | "matter" | "creation" | "systems";
type Verdict = "hit" | "near" | "twist";

type Spark = { title: string; field: string; insight: string };
type AtlasNode = {
  id: string;
  name: string;
  field: string;
  hook: string;
  status: NodeStatus;
  sector?: SectorKey;
  spark?: Spark;
  connectionReason?: string;
};
type AtlasEdge = { from: string; to: string; kind: EdgeKind };
type AtlasState = {
  version: 4;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  profileSignals: string[];
  expeditions: number;
  score: number;
  streak: number;
};
type Encounter = {
  signal: string;
  question: string;
  choices: string[];
  visual: "pulse" | "orbit" | "split" | "network" | "scale";
  token: string;
};
type NextNode = {
  name: string;
  field: string;
  sector: SectorKey;
  promise: string;
  kind: "deeper" | "bridge" | "wild";
  connection_reason: string;
};
type Resolution = {
  verdict: Verdict;
  verdict_line: string;
  reveal: string;
  spark: Spark;
  profile_signal: string;
  next_nodes: NextNode[];
};
type PanelStage = "summary" | "loading" | "question" | "resolving" | "reveal";
type EngineState = "checking" | "ready" | "offline";

const STORAGE_KEY = "spark-atlas-v4";
const OLD_STORAGE_KEY = "spark-atlas-v3";

const SECTORS: Array<{ key: SectorKey; label: string; angle: number }> = [
  { key: "life", label: "生命星系", angle: -150 },
  { key: "mind", label: "心智星系", angle: -90 },
  { key: "creation", label: "创造星系", angle: -30 },
  { key: "society", label: "社会星系", angle: 30 },
  { key: "systems", label: "系统星系", angle: 90 },
  { key: "matter", label: "物质星系", angle: 150 },
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
  { id: "origin", name: "好奇心原点", field: "你的起点", hook: "所有尚未提出的问题。", status: "origin", sector: "systems" },
  { id: "cooperation", name: "陌生鸟为何帮忙养娃", field: "演化生物学", hook: "自私如何长出合作？", status: "frontier", sector: "life" },
  { id: "random", name: "硬币为何越来越诚实", field: "概率论", hook: "随机为何会稳定？", status: "frontier", sector: "systems" },
  { id: "music", name: "两个音为何会打架", field: "音乐与声学", hook: "振动怎样制造情绪？", status: "frontier", sector: "creation" },
  { id: "language", name: "没有蓝色的人看见什么", field: "语言学", hook: "词语会改变感知吗？", status: "frontier", sector: "mind" },
  { id: "city", name: "大城市为何更省", field: "城市科学", hook: "城市也有代谢率吗？", status: "frontier", sector: "society" },
  { id: "ship", name: "换完零件还是原物吗", field: "身份哲学", hook: "身份藏在哪里？", status: "frontier", sector: "mind" },
  { id: "fungus", name: "森林地下谁在交易", field: "真菌生态学", hook: "没有大脑也能分配资源？", status: "frontier", sector: "life" },
  { id: "quantum", name: "观测之前它在哪里", field: "量子物理", hook: "现实需要被看见吗？", status: "frontier", sector: "matter" },
];

const INITIAL_ATLAS: AtlasState = {
  version: 4,
  nodes: SEED_NODES,
  edges: SEED_NODES.slice(1).map((node) => ({ from: "origin", to: node.id, kind: "normal" })),
  profileSignals: [],
  expeditions: 0,
  score: 0,
  streak: 0,
};

function migrateAtlas(value: unknown): AtlasState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AtlasState> & { version?: number };
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  if (raw.version === 4) return raw as AtlasState;
  if (raw.version === 3) {
    return {
      version: 4,
      nodes: raw.nodes.map((node) => ({ ...node, sector: node.sector || inferSector(node.field) })),
      edges: raw.edges,
      profileSignals: raw.profileSignals || [],
      expeditions: raw.expeditions || 0,
      score: (raw.expeditions || 0) * 20,
      streak: 0,
    };
  }
  return null;
}

async function atlasRequest(body: Record<string, unknown>) {
  const response = await fetch("/api/atlas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "AI导航员没有回应");
  return data;
}

function fieldCount(nodes: AtlasNode[]) {
  return new Set(nodes.filter((node) => node.status === "discovered").map((node) => node.field)).size;
}

function positionAtlas(nodes: AtlasNode[]) {
  const positions = new Map<string, { x: number; y: number; showLabel: boolean; sector: SectorKey }>();
  positions.set("origin", { x: 50, y: 50, showLabel: true, sector: "systems" });
  for (const sector of SECTORS) {
    const group = nodes.filter((node) => node.id !== "origin" && (node.sector || inferSector(node.field)) === sector.key);
    const radians = sector.angle * Math.PI / 180;
    const centerX = 50 + Math.cos(radians) * 32;
    const centerY = 50 + Math.sin(radians) * 27;
    group.forEach((node, index) => {
      const spiral = index * 2.39996;
      const radius = Math.min(3 + Math.sqrt(index) * 6.2, 15);
      positions.set(node.id, {
        x: Math.max(6, Math.min(94, centerX + Math.cos(spiral) * radius)),
        y: Math.max(7, Math.min(93, centerY + Math.sin(spiral) * radius)),
        showLabel: node.status === "discovered" || index < 2,
        sector: sector.key,
      });
    });
  }
  return positions;
}

function verdictPoints(verdict: Verdict) {
  return verdict === "hit" ? 30 : verdict === "near" ? 22 : 18;
}

export function CuriosityGame() {
  const [atlas, setAtlas] = useState<AtlasState>(INITIAL_ATLAS);
  const [engine, setEngine] = useState<EngineState>("checking");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelStage, setPanelStage] = useState<PanelStage>("summary");
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [chosenAnswer, setChosenAnswer] = useState("");
  const [chartInput, setChartInput] = useState("");
  const [charting, setCharting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeSector, setActiveSector] = useState<SectorKey | "all">("all");
  const [introOpen, setIntroOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [newNodeIds, setNewNodeIds] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const requestSerial = useRef(0);
  const drag = useRef({ active: false, x: 0, y: 0, panX: 0, panY: 0 });

  const nodeById = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const positions = useMemo(() => positionAtlas(atlas.nodes), [atlas.nodes]);
  const selectedNode = selectedId ? nodeById.get(selectedId) || null : null;
  const discovered = atlas.nodes.filter((node) => node.status === "discovered");
  const frontier = atlas.nodes.filter((node) => node.status === "frontier");
  const diversity = fieldCount(atlas.nodes);
  const level = Math.floor(atlas.score / 100) + 1;
  const recentDiscoveredIds = useMemo(() => new Set(atlas.nodes.filter((node) => node.status === "discovered").slice(-2).map((node) => node.id)), [atlas.nodes]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(OLD_STORAGE_KEY);
      const migrated = saved ? migrateAtlas(JSON.parse(saved)) : null;
      if (migrated) {
        setAtlas(migrated);
        setIntroOpen(false);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
    fetch("/api/atlas")
      .then((response) => response.json())
      .then((data) => setEngine(data.connected ? "ready" : "offline"))
      .catch(() => setEngine("offline"));
  }, []);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(atlas));
  }, [atlas, storageReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!newNodeIds.length) return;
    const timer = window.setTimeout(() => setNewNodeIds([]), 2000);
    return () => window.clearTimeout(timer);
  }, [newNodeIds]);

  function mapContext() {
    return {
      discovered: discovered.map((node) => node.name),
      frontier: frontier.map((node) => node.name),
      fields: [...new Set(discovered.map((node) => node.field))],
    };
  }

  function clearRound() {
    setEncounter(null);
    setResolution(null);
    setChosenAnswer("");
  }

  function closePanel() {
    requestSerial.current += 1;
    setSelectedId(null);
    setPanelStage("summary");
    clearRound();
  }

  async function launchEncounter(node: AtlasNode) {
    setSelectedId(node.id);
    setIntroOpen(false);
    clearRound();
    if (engine !== "ready") {
      setPanelStage("summary");
      setToast("AI导航员未连接");
      return;
    }
    setPanelStage("loading");
    const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "encounter", node, map: mapContext() });
      if (requestId !== requestSerial.current) return;
      setEncounter(data as Encounter);
      setPanelStage("question");
    } catch (error) {
      if (requestId !== requestSerial.current) return;
      setToast(error instanceof Error ? error.message : "信号生成失败");
      setPanelStage("summary");
    }
  }

  function selectNode(node: AtlasNode) {
    requestSerial.current += 1;
    if (node.status === "frontier") {
      launchEncounter(node);
      return;
    }
    setSelectedId(node.id);
    setPanelStage("summary");
    setIntroOpen(false);
    clearRound();
  }

  async function placeBet(choice: string) {
    if (!selectedNode || !encounter || panelStage !== "question") return;
    setChosenAnswer(choice);
    setPanelStage("resolving");
    const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "resolve", token: encounter.token, answer: choice });
      if (requestId !== requestSerial.current) return;
      const resolved = data as Resolution;
      const points = verdictPoints(resolved.verdict);
      setAtlas((current) => ({
        ...current,
        nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, status: "discovered" as const, spark: resolved.spark } : node),
        profileSignals: [...current.profileSignals, resolved.profile_signal].slice(-8),
        expeditions: current.expeditions + 1,
        score: current.score + points,
        streak: resolved.verdict === "hit" ? current.streak + 1 : 0,
      }));
      setResolution(resolved);
      setPanelStage("reveal");
    } catch (error) {
      if (requestId !== requestSerial.current) return;
      setToast(error instanceof Error ? error.message : "揭晓失败");
      setPanelStage("question");
    }
  }

  function chooseRoute(route: NextNode) {
    if (!selectedNode) return;
    const existingNode = atlas.nodes.find((node) => node.name === route.name);
    const nextId = existingNode?.id || `route-${Date.now()}`;
    setAtlas((current) => {
      const existing = current.nodes.find((node) => node.id === nextId || node.name === route.name);
      const hasEdge = current.edges.some((edge) => edge.from === selectedNode.id && edge.to === nextId);
      return {
        ...current,
        nodes: existing ? current.nodes : [...current.nodes, {
          id: nextId,
          name: route.name,
          field: route.field,
          hook: route.promise,
          status: "frontier" as const,
          sector: route.sector || inferSector(route.field),
          connectionReason: route.connection_reason,
        }],
        edges: hasEdge ? current.edges : [...current.edges, {
          from: selectedNode.id,
          to: nextId,
          kind: route.kind === "deeper" ? "normal" : route.kind,
        }],
      };
    });
    setNewNodeIds([nextId]);
    setActiveSector(route.sector || inferSector(route.field));
    setToast(`航线锁定：${route.name}`);
    closePanel();
  }

  async function chartThought() {
    const thought = chartInput.trim();
    if (!thought || charting || engine !== "ready") return;
    setCharting(true);
    try {
      const data = await atlasRequest({ mode: "chart", thought, map: mapContext() });
      const parent = atlas.nodes.find((node) => node.name === data.parent_hint) || atlas.nodes[0];
      const id = `charted-${Date.now()}`;
      const sector = data.node.sector || inferSector(data.node.field);
      setAtlas((current) => ({
        ...current,
        nodes: [...current.nodes, { id, ...data.node, status: "frontier", sector, connectionReason: data.nav_note }],
        edges: [...current.edges, { from: parent.id, to: id, kind: "bridge" }],
      }));
      setNewNodeIds([id]);
      setActiveSector(sector);
      setChartInput("");
      setToast("新坐标已进入星图");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "坐标绘制失败");
    } finally {
      setCharting(false);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, input")) return;
    drag.current = { active: true, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current.active) return;
    setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function onWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setZoom((current) => Math.max(.68, Math.min(1.5, current - event.deltaY * .001)));
  }

  function resetAtlas() {
    setAtlas(INITIAL_ATLAS);
    closePanel();
    setIntroOpen(true);
    setActiveSector("all");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(OLD_STORAGE_KEY);
  }

  return (
    <main className="atlas-shell">
      <header className="atlas-header">
        <button className="atlas-brand" type="button" onClick={() => setIntroOpen(true)}>
          <i>✦</i><span><b>星火档案</b><small>PERSONAL ATLAS</small></span>
        </button>
        <div className="voyage-objective">
          <span>探索等级 {level}</span>
          <b>{atlas.score % 100} / 100 星尘</b>
          <div><i style={{ width: `${atlas.score % 100}%` }} /></div>
        </div>
        <div className="atlas-stats">
          {atlas.streak > 1 ? <span className="streak"><b>{atlas.streak}</b> 连中</span> : null}
          <span><b>{discovered.length}</b> 已点亮</span>
          <span><b>{diversity}</b> 个领域</span>
          <span className={`engine-indicator ${engine}`}><i />{engine === "ready" ? "AI在线" : engine === "checking" ? "连接中" : "AI离线"}</span>
        </div>
      </header>

      <section className="map-viewport" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} aria-label="分区个人知识星图">
        <div className="cosmic-fog fog-a" /><div className="cosmic-fog fog-b" />
        <div className="sector-filter" aria-label="知识星系筛选">
          <button className={activeSector === "all" ? "active" : ""} type="button" onClick={() => setActiveSector("all")}>全图</button>
          {SECTORS.map((sector) => {
            const count = atlas.nodes.filter((node) => node.id !== "origin" && (node.sector || inferSector(node.field)) === sector.key).length;
            return <button key={sector.key} className={activeSector === sector.key ? "active" : ""} type="button" onClick={() => setActiveSector(sector.key)}>{sector.label.replace("星系", "")} <b>{count}</b></button>;
          })}
        </div>

        <div className="map-canvas" style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}>
          <div className="map-grid" />
          {SECTORS.map((sector) => {
            const radians = sector.angle * Math.PI / 180;
            const x = 50 + Math.cos(radians) * 32;
            const y = 50 + Math.sin(radians) * 27;
            const muted = activeSector !== "all" && activeSector !== sector.key;
            return <div key={sector.key} className={`sector-cloud ${muted ? "muted" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}><span>{sector.label}</span></div>;
          })}
          <svg className="edge-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {atlas.edges.map((edge, index) => {
              const from = positions.get(edge.from); const to = positions.get(edge.to);
              if (!from || !to) return null;
              const muted = activeSector !== "all" && from.sector !== activeSector && to.sector !== activeSector && edge.from !== "origin";
              return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`edge-${edge.kind} ${activeSector === "all" ? "overview" : ""} ${muted ? "muted" : ""}`} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>

          {atlas.nodes.map((node) => {
            const position = positions.get(node.id); if (!position) return null;
            const muted = activeSector !== "all" && node.id !== "origin" && position.sector !== activeSector;
            const labelVisible = node.id === "origin" || newNodeIds.includes(node.id) || (activeSector === "all" ? recentDiscoveredIds.has(node.id) : position.sector === activeSector);
            return (
              <button key={node.id} type="button"
                className={`star-node status-${node.status} ${selectedId === node.id ? "selected" : ""} ${newNodeIds.includes(node.id) ? "newborn" : ""} ${labelVisible ? "label-priority" : ""} ${muted ? "sector-muted" : ""}`}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                onClick={(event) => { event.stopPropagation(); selectNode(node); }}
                aria-label={`${node.name}，${node.field}，${node.status === "discovered" ? "已点亮" : node.status === "origin" ? "起点" : "开始挑战"}`}>
                <span className="star-rings" /><i>{node.status === "discovered" ? "✦" : node.status === "origin" ? "◎" : ""}</i>
                <span className="star-label"><small>{node.field}</small><b>{node.name}</b></span>
              </button>
            );
          })}
        </div>

        <div className="map-controls">
          <button type="button" onClick={() => setZoom((value) => Math.min(1.5, value + .12))} aria-label="放大星图">＋</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(.68, value - .12))} aria-label="缩小星图">−</button>
          <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="回到星图中心">⌾</button>
        </div>

        <section className="navigator-bar">
          <div><i>✦</i><span><small>AI制图员</small><b>{charting ? "定位中…" : "把念头变成下一局"}</b></span></div>
          <input value={chartInput} onChange={(event) => setChartInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") chartThought(); }} placeholder="最近什么让你好奇？" maxLength={100} disabled={charting} aria-label="把一个问题变成知识星" />
          <button type="button" onClick={chartThought} disabled={charting || !chartInput.trim()} aria-label="绘制新坐标">↗</button>
        </section>
      </section>

      {introOpen ? (
        <section className="intro-card" role="dialog" aria-modal="false" aria-labelledby="intro-title">
          <button type="button" className="panel-close" onClick={() => setIntroOpen(false)} aria-label="关闭介绍">×</button>
          <p>每颗星，都是一局</p>
          <h1 id="intro-title">看异常。押直觉。<br />只带走一条航线。</h1>
          <span>没有课程，也没有标准答案。AI会根据你的选择，即时改写下一片宇宙。</span>
          <button type="button" className="intro-action" onClick={() => setIntroOpen(false)}>选择第一颗星 <b>→</b></button>
        </section>
      ) : null}

      {selectedNode ? (
        <aside className="exploration-panel" aria-label={`${selectedNode.name}挑战舱`}>
          <header><span>回合 {atlas.expeditions + (panelStage === "reveal" ? 0 : 1)} · {selectedNode.field}</span><button type="button" className="panel-close" onClick={closePanel} aria-label="关闭挑战舱">×</button></header>

          {panelStage === "summary" ? (
            <div className="panel-content summary-stage">
              <p className="field-tag">{selectedNode.status === "origin" ? "你的宇宙" : "已点亮"}</p>
              <h2>{selectedNode.name}</h2>
              <p className="node-hook">{selectedNode.spark?.insight || selectedNode.hook}</p>
              {selectedNode.status !== "origin" ? <button className="launch-button" type="button" onClick={() => launchEncounter(selectedNode)} disabled={engine !== "ready"}>再玩一局 <span>→</span></button> : <div className="origin-note"><b>{atlas.score}</b><span>星尘 · {atlas.expeditions} 次远征</span></div>}
            </div>
          ) : null}

          {panelStage === "loading" ? <div className="panel-content loading-stage"><div className="scan-orb"><i /></div><h2>正在生成异常信号</h2><p>这局只会出现一次。</p></div> : null}

          {panelStage === "question" && encounter ? (
            <div className="panel-content wager-stage">
              <div className={`encounter-visual visual-${encounter.visual}`} aria-hidden="true"><i /><i /><i /><b>?</b></div>
              <p className="signal-line">{encounter.signal}</p>
              <h2>{encounter.question}</h2>
              <div className="choice-grid">
                {encounter.choices.map((choice, index) => <button key={choice} type="button" onClick={() => placeBet(choice)}><i>{String.fromCharCode(65 + index)}</i><span>{choice}</span></button>)}
              </div>
              <small className="wager-note">押一个直觉 · 不是考试</small>
            </div>
          ) : null}

          {panelStage === "resolving" ? <div className="panel-content loading-stage"><div className="scan-orb resolving"><i /></div><h2>AI正在判读你的直觉</h2><p>你押了：{chosenAnswer}</p></div> : null}

          {panelStage === "reveal" && resolution ? (
            <div className="panel-content reveal-stage compact-reveal">
              <div className={`verdict-badge verdict-${resolution.verdict}`}>{resolution.verdict === "hit" ? "+30 命中" : resolution.verdict === "near" ? "+22 擦边" : "+18 反转"}</div>
              <h2>{resolution.verdict_line}</h2>
              <p className="ai-reply">{resolution.reveal}</p>
              <div className="spark-reward"><span>带回一枚火种</span><p>{resolution.spark.insight}</p></div>
              <div className="route-choice">
                <header><span>只能带走一条航线</span><small>另外两条将消失</small></header>
                {resolution.next_nodes.map((route) => <button type="button" key={`${route.kind}-${route.name}`} onClick={() => chooseRoute(route)}><i className={`route-${route.kind}`} /><span><b>{route.name}</b><small>{route.promise}</small></span><em>→</em></button>)}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      <button className="reset-atlas" type="button" onClick={resetAtlas}>重置宇宙</button>
      {toast ? <div className="atlas-toast" role="status"><i>✦</i>{toast}</div> : null}
    </main>
  );
}
