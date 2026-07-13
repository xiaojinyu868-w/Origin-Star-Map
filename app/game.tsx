"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";

type NodeStatus = "origin" | "frontier" | "discovered";
type EdgeKind = "normal" | "bridge" | "wild";

type Spark = { title: string; field: string; insight: string };

type AtlasNode = {
  id: string;
  name: string;
  field: string;
  hook: string;
  x: number;
  y: number;
  status: NodeStatus;
  spark?: Spark;
  connectionReason?: string;
};

type AtlasEdge = { from: string; to: string; kind: EdgeKind };

type AtlasState = {
  version: 3;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  profileSignals: string[];
  expeditions: number;
};

type Encounter = {
  scene: string;
  question: string;
  quick_starts: string[];
  token: string;
};

type NextNode = {
  name: string;
  field: string;
  hook: string;
  kind: "deeper" | "bridge" | "wild";
  connection_reason: string;
};

type Resolution = {
  reply: string;
  spark: Spark;
  profile_signal: string;
  bridge_statement: string;
  next_nodes: NextNode[];
};

type PanelStage = "summary" | "loading" | "question" | "resolving" | "reveal";
type EngineState = "checking" | "ready" | "offline";

const STORAGE_KEY = "spark-atlas-v3";

const SEED_NODES: AtlasNode[] = [
  { id: "origin", name: "好奇心原点", field: "你的起点", hook: "所有尚未提出的问题，都从这里向外生长。", x: 50, y: 50, status: "origin" },
  { id: "cooperation", name: "合作为何出现", field: "演化生物学", hook: "自私的个体，为什么会共同养大别人的孩子？", x: 31, y: 29, status: "frontier" },
  { id: "random", name: "随机有形状吗", field: "概率论", hook: "杂乱无章的结果，为什么常常呈现稳定图案？", x: 52, y: 20, status: "frontier" },
  { id: "music", name: "和弦为何动人", field: "音乐与声学", hook: "空气振动如何变成紧张、安慰与期待？", x: 73, y: 31, status: "frontier" },
  { id: "language", name: "语言制造颜色", field: "语言学", hook: "没有某个颜色词，人还会以同样方式看见它吗？", x: 77, y: 57, status: "frontier" },
  { id: "city", name: "城市会呼吸吗", field: "城市科学", hook: "道路、人口和能源为何呈现出生命般的尺度规律？", x: 66, y: 76, status: "frontier" },
  { id: "ship", name: "哪一艘才是原船", field: "身份哲学", hook: "逐块替换所有零件之后，原来的事物还存在吗？", x: 42, y: 78, status: "frontier" },
  { id: "fungus", name: "地下的无声网络", field: "真菌生态学", hook: "没有大脑的菌丝，如何协调一整片森林？", x: 20, y: 61, status: "frontier" },
];

const SEED_EDGES: AtlasEdge[] = SEED_NODES.slice(1).map((node) => ({ from: "origin", to: node.id, kind: "normal" }));

const INITIAL_ATLAS: AtlasState = {
  version: 3,
  nodes: SEED_NODES,
  edges: SEED_EDGES,
  profileSignals: [],
  expeditions: 0,
};

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

function clamp(value: number, min = 8, max = 92) {
  return Math.max(min, Math.min(max, value));
}

function nextPosition(parent: AtlasNode, kind: NextNode["kind"], index: number, total: number) {
  if (kind === "deeper") return { x: clamp(parent.x + 13), y: clamp(parent.y - 13) };
  if (kind === "bridge") return { x: clamp(parent.x - 16), y: clamp(parent.y + 12) };
  const angle = (total * 137.5 + index * 71) * Math.PI / 180;
  return { x: clamp(50 + Math.cos(angle) * 42), y: clamp(50 + Math.sin(angle) * 38) };
}

function fieldCount(nodes: AtlasNode[]) {
  return new Set(nodes.filter((node) => node.status === "discovered").map((node) => node.field)).size;
}

export function CuriosityGame() {
  const [atlas, setAtlas] = useState<AtlasState>(INITIAL_ATLAS);
  const [engine, setEngine] = useState<EngineState>("checking");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelStage, setPanelStage] = useState<PanelStage>("summary");
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [answer, setAnswer] = useState("");
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [chartInput, setChartInput] = useState("");
  const [charting, setCharting] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [introOpen, setIntroOpen] = useState(true);
  const [toast, setToast] = useState("");
  const [newNodeIds, setNewNodeIds] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const requestSerial = useRef(0);
  const drag = useRef<{ active: boolean; x: number; y: number; panX: number; panY: number }>({ active: false, x: 0, y: 0, panX: 0, panY: 0 });

  const selectedNode = atlas.nodes.find((node) => node.id === selectedId) || null;
  const discovered = atlas.nodes.filter((node) => node.status === "discovered");
  const frontier = atlas.nodes.filter((node) => node.status === "frontier");
  const diversity = fieldCount(atlas.nodes);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AtlasState;
        if (parsed.version === 3) {
          setAtlas(parsed);
          setIntroOpen(false);
        }
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
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(atlas));
  }, [atlas, storageReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!newNodeIds.length) return;
    const timer = window.setTimeout(() => setNewNodeIds([]), 2200);
    return () => window.clearTimeout(timer);
  }, [newNodeIds]);

  function mapContext() {
    return {
      discovered: discovered.map((node) => node.name),
      frontier: frontier.map((node) => node.name),
      fields: [...new Set(discovered.map((node) => node.field))],
    };
  }

  function selectNode(node: AtlasNode) {
    requestSerial.current += 1;
    setSelectedId(node.id);
    setPanelStage("summary");
    setEncounter(null);
    setResolution(null);
    setAnswer("");
    setIntroOpen(false);
  }

  function closePanel() {
    requestSerial.current += 1;
    setSelectedId(null);
    setEncounter(null);
    setResolution(null);
    setAnswer("");
    setPanelStage("summary");
  }

  async function startEncounter() {
    if (!selectedNode || selectedNode.status === "origin") return;
    if (engine !== "ready") {
      setToast("AI导航员未连接，无法生成这次微远征");
      return;
    }
    setPanelStage("loading");
    setAnswer("");
    setResolution(null);
    const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "encounter", node: selectedNode, map: mapContext() });
      if (requestId !== requestSerial.current) return;
      setEncounter(data as Encounter);
      setPanelStage("question");
    } catch (error) {
      if (requestId !== requestSerial.current) return;
      setToast(error instanceof Error ? error.message : "远征生成失败");
      setPanelStage("summary");
    }
  }

  async function resolveEncounter() {
    if (!selectedNode || !encounter || !answer.trim()) return;
    setPanelStage("resolving");
    const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "resolve", token: encounter.token, answer });
      if (requestId !== requestSerial.current) return;
      const resolved = data as Resolution;
      const parent = selectedNode;
      const addedIds: string[] = [];

      setAtlas((current) => {
        const existingNames = new Set(current.nodes.map((node) => node.name));
        const freshNodes: AtlasNode[] = [];
        const freshEdges: AtlasEdge[] = [];
        resolved.next_nodes.forEach((candidate, index) => {
          if (existingNames.has(candidate.name)) return;
          const id = `ai-${Date.now()}-${index}`;
          const position = nextPosition(parent, candidate.kind, index, current.nodes.length);
          addedIds.push(id);
          freshNodes.push({
            id,
            name: candidate.name,
            field: candidate.field,
            hook: candidate.hook,
            x: position.x,
            y: position.y,
            status: "frontier",
            connectionReason: candidate.connection_reason,
          });
          freshEdges.push({
            from: parent.id,
            to: id,
            kind: candidate.kind === "deeper" ? "normal" : candidate.kind,
          });
        });

        return {
          ...current,
          nodes: [
            ...current.nodes.map((node) => node.id === parent.id ? { ...node, status: "discovered" as const, spark: resolved.spark } : node),
            ...freshNodes,
          ],
          edges: [...current.edges, ...freshEdges],
          profileSignals: [...current.profileSignals, resolved.profile_signal].slice(-8),
          expeditions: current.expeditions + 1,
        };
      });
      setNewNodeIds(addedIds);
      setResolution(resolved);
      setPanelStage("reveal");
    } catch (error) {
      if (requestId !== requestSerial.current) return;
      setToast(error instanceof Error ? error.message : "星图生长失败");
      setPanelStage("question");
    }
  }

  async function chartThought() {
    const thought = chartInput.trim();
    if (!thought || charting) return;
    if (engine !== "ready") {
      setToast("AI导航员未连接，暂时无法绘制新坐标");
      return;
    }
    setCharting(true);
    try {
      const data = await atlasRequest({ mode: "chart", thought, map: mapContext() });
      const parent = atlas.nodes.find((node) => node.name === data.parent_hint) || atlas.nodes[0];
      const id = `charted-${Date.now()}`;
      const angle = atlas.nodes.length * 137.5 * Math.PI / 180;
      const node: AtlasNode = {
        id,
        name: data.node.name,
        field: data.node.field,
        hook: data.node.hook,
        x: clamp(parent.x + Math.cos(angle) * 18),
        y: clamp(parent.y + Math.sin(angle) * 16),
        status: "frontier",
        connectionReason: data.nav_note,
      };
      setAtlas((current) => ({
        ...current,
        nodes: [...current.nodes, node],
        edges: [...current.edges, { from: parent.id, to: id, kind: "bridge" }],
      }));
      setNewNodeIds([id]);
      setChartInput("");
      setSelectedId(id);
      setPanelStage("summary");
      setToast(data.nav_note);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "坐标绘制失败");
    } finally {
      setCharting(false);
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button, input, textarea")) return;
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
    setZoom((current) => Math.max(.72, Math.min(1.45, current - event.deltaY * .001)));
  }

  function resetAtlas() {
    setAtlas(INITIAL_ATLAS);
    setSelectedId(null);
    setIntroOpen(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <main className="atlas-shell">
      <header className="atlas-header">
        <button className="atlas-brand" type="button" onClick={() => setIntroOpen(true)}>
          <i>✦</i><span><b>星火档案</b><small>个人知识宇宙</small></span>
        </button>
        <div className="voyage-objective">
          <span>本次航行</span>
          <b>{diversity >= 3 ? "已跨越三个领域" : `再点亮 ${3 - diversity} 个不同领域`}</b>
          <div><i style={{ width: `${Math.min(diversity / 3 * 100, 100)}%` }} /></div>
        </div>
        <div className="atlas-stats">
          <span><b>{discovered.length}</b> 已点亮</span>
          <span><b>{diversity}</b> 个领域</span>
          <span className={`engine-indicator ${engine}`}><i />{engine === "ready" ? "AI在线" : engine === "checking" ? "连接中" : "AI离线"}</span>
        </div>
      </header>

      <section
        className="map-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        aria-label="可拖拽和缩放的个人知识星图"
      >
        <div className="cosmic-fog fog-a" aria-hidden="true" />
        <div className="cosmic-fog fog-b" aria-hidden="true" />
        <div
          className="map-canvas"
          style={{ transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})` }}
        >
          <div className="map-grid" aria-hidden="true" />
          <svg className="edge-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {atlas.edges.map((edge, index) => {
              const from = atlas.nodes.find((node) => node.id === edge.from);
              const to = atlas.nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;
              return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`edge-${edge.kind}`} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>

          {atlas.nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`star-node status-${node.status} ${selectedId === node.id ? "selected" : ""} ${newNodeIds.includes(node.id) ? "newborn" : ""}`}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onClick={(event) => { event.stopPropagation(); selectNode(node); }}
              aria-label={`${node.name}，${node.field}，${node.status === "discovered" ? "已点亮" : node.status === "origin" ? "起点" : "可以探索"}`}
            >
              <span className="star-rings" />
              <i>{node.status === "discovered" ? "✦" : node.status === "origin" ? "◎" : ""}</i>
              <span className="star-label"><small>{node.field}</small><b>{node.name}</b></span>
            </button>
          ))}
        </div>

        <div className="map-controls">
          <button type="button" onClick={() => setZoom((value) => Math.min(1.45, value + .12))} aria-label="放大星图">＋</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(.72, value - .12))} aria-label="缩小星图">−</button>
          <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="回到星图中心">⌾</button>
        </div>

        <div className="map-legend">
          <span><i className="legend-frontier" />等待探索</span>
          <span><i className="legend-lit" />已经点亮</span>
          <span><i className="legend-bridge" />跨学科连接</span>
        </div>

        <section className="navigator-bar">
          <div><i>✦</i><span><small>AI制图员</small><b>{charting ? "正在寻找这个念头的坐标…" : "把任何念头画进你的宇宙"}</b></span></div>
          <input
            value={chartInput}
            onChange={(event) => setChartInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") chartThought(); }}
            placeholder="例如：为什么最近总感觉时间过得很快？"
            maxLength={240}
            disabled={charting}
            aria-label="把一个问题变成知识星"
          />
          <button type="button" onClick={chartThought} disabled={charting || !chartInput.trim()} aria-label="绘制新坐标">↗</button>
        </section>
      </section>

      {introOpen ? (
        <section className="intro-card" role="dialog" aria-modal="false" aria-labelledby="intro-title">
          <button type="button" className="panel-close" onClick={() => setIntroOpen(false)} aria-label="关闭介绍">×</button>
          <p>你的宇宙从八个微弱信号开始</p>
          <h1 id="intro-title">不是选一个专业。<br />是先看见世界有多大。</h1>
          <span>点击任意发光星星，进行一次2分钟微远征。每次点亮都会留下记录，并由AI生长出三条新的知识航路。</span>
          <button type="button" className="intro-action" onClick={() => setIntroOpen(false)}>开始观察星图 <b>→</b></button>
        </section>
      ) : null}

      {selectedNode ? (
        <aside className="exploration-panel" aria-label={`${selectedNode.name}探索舱`}>
          <header>
            <span>{selectedNode.status === "discovered" ? "已点亮的知识星" : selectedNode.status === "origin" ? "知识宇宙中心" : "等待探索的信号"}</span>
            <button type="button" className="panel-close" onClick={closePanel} aria-label="关闭探索舱">×</button>
          </header>

          {panelStage === "summary" ? (
            <div className="panel-content summary-stage">
              <p className="field-tag">{selectedNode.field}</p>
              <h2>{selectedNode.name}</h2>
              <p className="node-hook">{selectedNode.hook}</p>
              {selectedNode.connectionReason ? <blockquote>{selectedNode.connectionReason}</blockquote> : null}
              {selectedNode.spark ? (
                <div className="stored-spark"><span>你带回的知识火种</span><b>{selectedNode.spark.title}</b><p>{selectedNode.spark.insight}</p></div>
              ) : null}
              {selectedNode.status !== "origin" ? (
                <button className="launch-button" type="button" onClick={startEncounter} disabled={engine !== "ready"}>
                  {selectedNode.status === "discovered" ? "从这里继续延伸" : "生成这次微远征"}<span>→</span>
                </button>
              ) : (
                <div className="origin-note"><b>{atlas.nodes.length - 1}</b><span>颗知识星正在围绕你的好奇心生长。</span></div>
              )}
              {engine === "offline" && selectedNode.status !== "origin" ? <small className="offline-note">AI导航员未连接，无法临时生成探索内容。</small> : null}
            </div>
          ) : null}

          {panelStage === "loading" ? (
            <div className="panel-content loading-stage"><div className="scan-orb"><i /></div><h2>正在接收这颗星的信号</h2><p>AI正在从这个领域里挑选一个值得两分钟的反常现象。</p></div>
          ) : null}

          {panelStage === "question" && encounter ? (
            <div className="panel-content question-stage">
              <p className="field-tag">2分钟微远征 · {selectedNode.field}</p>
              <h2>{selectedNode.name}</h2>
              <div className="phenomenon"><span>你观察到</span><p>{encounter.scene}</p></div>
              <label htmlFor="intuition-answer">{encounter.question}</label>
              <textarea id="intuition-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="写下第一反应即可，不需要知道术语……" maxLength={280} />
              <div className="quick-starts">
                {encounter.quick_starts.map((item) => <button type="button" key={item} onClick={() => setAnswer(item)}>{item}</button>)}
              </div>
              <button className="launch-button" type="button" onClick={resolveEncounter} disabled={!answer.trim()}>看看这个直觉通向哪里 <span>→</span></button>
            </div>
          ) : null}

          {panelStage === "resolving" ? (
            <div className="panel-content loading-stage"><div className="scan-orb resolving"><i /></div><h2>正在连接你的直觉</h2><p>AI正在把这次回答连接到已有知识，并寻找一条意外的新航路。</p></div>
          ) : null}

          {panelStage === "reveal" && resolution ? (
            <div className="panel-content reveal-stage">
              <p className="field-tag">远征完成 · 星图正在生长</p>
              <h2>{resolution.spark.title}</h2>
              <p className="ai-reply">{resolution.reply}</p>
              <div className="spark-reward"><span>知识火种</span><p>{resolution.spark.insight}</p><small>{resolution.spark.field}</small></div>
              <blockquote>{resolution.bridge_statement}</blockquote>
              <div className="new-routes">
                <span>刚刚出现的三条航路</span>
                {resolution.next_nodes.map((node) => <div key={`${node.kind}-${node.name}`}><i className={`route-${node.kind}`} /> <b>{node.name}</b><small>{node.field}</small></div>)}
              </div>
              <button className="launch-button" type="button" onClick={closePanel}>看它们在星图上亮起 <span>→</span></button>
            </div>
          ) : null}
        </aside>
      ) : null}

      <button className="reset-atlas" type="button" onClick={resetAtlas}>重置这片宇宙</button>
      {toast ? <div className="atlas-toast" role="status"><i>✦</i>{toast}</div> : null}
    </main>
  );
}
