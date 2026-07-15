"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

type NodeStatus = "origin" | "frontier" | "discovered";
type EdgeKind = "normal" | "bridge" | "wild";
type SectorKey = "life" | "mind" | "society" | "matter" | "creation" | "systems";
type Verdict = "hit" | "near" | "twist";
type Interaction = "choice" | "scale" | "arrange";
type ChoiceVisual = { value: number; uncertainty: number; annotation: string };
type VisualContext = { measure: string; unit: string; baseline_label: string; changed_label: string; baseline_value: number };

type Spark = { title: string; field: string; insight: string };
type NextNode = { name: string; field: string; sector: SectorKey; promise: string; kind: "deeper" | "bridge" | "wild"; connection_reason: string };
type KnowledgeRecord = {
  signal: string;
  question: string;
  playerAnswer: string;
  verdict: Verdict;
  echo: string;
  answerTitle: string;
  scene: string;
  explanation: string;
  terms: Array<{ term: string; meaning: string }>;
  whyItMatters: string;
  transfer?: string;
  sourceNote: string;
  nextNodes: NextNode[];
  discoveredAt: number;
};
type AtlasNode = { id: string; name: string; field: string; hook: string; status: NodeStatus; sector?: SectorKey; spark?: Spark; knowledge?: KnowledgeRecord; connectionReason?: string };
type AtlasEdge = { from: string; to: string; kind: EdgeKind; reason?: string; traversed?: boolean; createdAt?: number };
type Constellation = { id: string; name: string; line: string; motif: string; nodeIds: string[] };
type KnowledgeVolume = { id: string; name: string; line: string; law: string; faceIds: string[]; nodeIds: string[] };
type AtlasState = { version: 7; nodes: AtlasNode[]; edges: AtlasEdge[]; profileSignals: string[]; expeditions: number; constellations: Constellation[]; volumes: KnowledgeVolume[]; trail: string[] };
type GeneratedArtifact = { medium: "svg" | "html" | "canvas"; html: string; title: string; hint: string; can_commit: boolean };
type Encounter = { signal: string; question: string; interaction: Interaction; choices: string[]; choice_visuals?: ChoiceVisual[]; visual_context?: VisualContext | null; scale: { left: string; right: string } | null; items: string[]; visual: "pulse" | "orbit" | "split" | "network" | "scale"; artifact?: GeneratedArtifact | null; token: string };
type Resolution = { verdict: Verdict; echo: string; answer_title: string; scene: string; explanation: string; terms: Array<{ term: string; meaning: string }>; why_it_matters: string; transfer: string; spark: Spark; profile_signal: string; source_note: string; next_nodes: NextNode[]; player_answer: string };
type PanelStage = "summary" | "loading" | "observe" | "resolving" | "reveal";
type EngineState = "checking" | "ready" | "offline";
type AtlasPosition = { x: number; y: number; sector: SectorKey };
type FlightDirection = "up" | "down" | "left" | "right";
type StructureLens = "all" | "point" | "line" | "face" | "volume";
type FlightTrace = { from: string; to: string; serial: number };
type FlightFeedback = { kind: "arrive" | "blocked"; serial: number };

const STORAGE_KEY = "spark-atlas-v7";
const OLD_STORAGE_KEYS = ["spark-atlas-v6", "spark-atlas-v5", "spark-atlas-v4", "spark-atlas-v3"];
const SECTORS: Array<{ key: SectorKey; label: string; angle: number; description: string; color: string }> = [
  { key: "life", label: "生命", angle: -150, description: "会生长、竞争与合作的世界", color: "#a8b68f" },
  { key: "mind", label: "心智", angle: -90, description: "感知、语言与自我的边界", color: "#aaa3c2" },
  { key: "creation", label: "创造", angle: -30, description: "形式、声音与想象如何发生", color: "#c4a778" },
  { key: "society", label: "社会", angle: 30, description: "人群如何形成制度与城市", color: "#c18e72" },
  { key: "systems", label: "秩序", angle: 90, description: "规则、计算与复杂系统", color: "#7fa6a0" },
  { key: "matter", label: "物质", angle: 150, description: "从粒子、材料到宇宙尺度", color: "#91aab8" },
];
const WAIT_COPY = {
  loading: ["寻找一个能亲手判断的瞬间", "把现象写成可操作的代码世界", "核对事实锚点与知识边界"],
  resolving: ["读取你刚才留下的判断", "写下一条可以复述的答案", "为下一次远行生成三条航线"],
  charting: ["辨认这句话真正指向的问题", "在六片星域中寻找坐标", "寻找它与旧星之间的联系"],
};

function inferSector(field = ""): SectorKey {
  if (/生物|生态|真菌|医学|神经|基因|演化/.test(field)) return "life";
  if (/心理|认知|语言|哲学|意识|教育/.test(field)) return "mind";
  if (/艺术|音乐|文学|设计|历史|美学/.test(field)) return "creation";
  if (/社会|城市|经济|政治|人类|博弈|传播/.test(field)) return "society";
  if (/物理|化学|天文|地质|材料|量子/.test(field)) return "matter";
  return "systems";
}

function sectorFor(node: AtlasNode) { return node.sector || inferSector(node.field); }
function sectorInfo(key: SectorKey) { return SECTORS.find((sector) => sector.key === key) || SECTORS[4]; }
function roundCoord(value: number) { return Number(value.toFixed(4)); }
function sectorCenter(sector: (typeof SECTORS)[number]) {
  const radians = sector.angle * Math.PI / 180;
  return { x: roundCoord(50 + Math.cos(radians) * 31), y: roundCoord(50 + Math.sin(radians) * 27) };
}
function sectorCaption(sector: (typeof SECTORS)[number]) {
  const radians = sector.angle * Math.PI / 180;
  return { x: roundCoord(50 + Math.cos(radians) * 64), y: roundCoord(50 + Math.sin(radians) * 56) };
}

const SEED_NODES: AtlasNode[] = [
  { id: "origin", name: "未完成的天球", field: "观测起点", hook: "所有尚未说出口的困惑，都可以从这里获得第一个问题。", status: "origin", sector: "systems" },
  { id: "cooperation", name: "动物为何照顾别人的幼崽？", field: "演化生物学", hook: "看一张更大的嘴如何劫持照料本能", status: "frontier", sector: "life" },
  { id: "random", name: "随机为什么也能预测？", field: "概率论", hook: "看一万次硬币落下后出现稳定轮廓", status: "frontier", sector: "systems" },
  { id: "music", name: "两个近似的声音为何忽大忽小？", field: "音乐与声学", hook: "听见两列声波怎样制造拍频", status: "frontier", sector: "creation" },
  { id: "language", name: "一个词会改变我们看见的颜色吗？", field: "心理语言学", hook: "看词语如何抢先影响颜色边界", status: "frontier", sector: "mind" },
  { id: "city", name: "城市越大，人均资源越省吗？", field: "城市科学", hook: "估量人口翻倍时基础设施怎样变化", status: "frontier", sector: "society" },
  { id: "ship", name: "换掉所有零件后，还是原来的东西吗？", field: "身份哲学", hook: "用一艘不断换木板的船追问身份", status: "frontier", sector: "mind" },
  { id: "fungus", name: "树会通过真菌交换养分吗？", field: "真菌生态学", hook: "跟随白杨树根下的碳与矿物质", status: "frontier", sector: "life" },
  { id: "quantum", name: "观测会改变量子结果吗？", field: "量子物理", hook: "触碰测量与现实之间的边界", status: "frontier", sector: "matter" },
];

const INITIAL_ATLAS: AtlasState = {
  version: 7,
  nodes: SEED_NODES,
  edges: SEED_NODES.slice(1).map((node) => ({ from: "origin", to: node.id, kind: "normal", reason: "从一个未完成的问题出发", traversed: false, createdAt: 0 })),
  profileSignals: [],
  expeditions: 0,
  constellations: [],
  volumes: [],
  trail: [],
};

function dedupeConstellations(items: Constellation[]) {
  const seen = new Set<string>();
  return items.filter((item) => { const key = item.name.trim().replace(/\s+/g, ""); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

function dedupeVolumes(items: KnowledgeVolume[]) {
  const seen = new Set<string>();
  return items.filter((item) => { const key = item.name.trim().replace(/\s+/g, ""); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

function migrateAtlas(value: unknown): AtlasState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { version?: number; nodes?: AtlasNode[]; edges?: AtlasEdge[]; profileSignals?: string[]; expeditions?: number; constellations?: Constellation[]; volumes?: KnowledgeVolume[]; trail?: string[] };
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  const nodes = raw.nodes.map((node) => ({ ...node, sector: sectorFor(node) }));
  const edges = raw.edges.map((edge) => ({ ...edge, reason: edge.reason || nodes.find((node) => node.id === edge.to)?.connectionReason || "由一次选择相连", traversed: Boolean(edge.traversed || nodes.find((node) => node.id === edge.to)?.status === "discovered"), createdAt: edge.createdAt || 0 }));
  return {
    version: 7,
    nodes,
    edges,
    profileSignals: raw.profileSignals || [],
    expeditions: raw.expeditions || 0,
    constellations: dedupeConstellations(raw.constellations || []),
    volumes: dedupeVolumes(raw.volumes || []),
    trail: raw.trail || nodes.filter((node) => node.status === "discovered").map((node) => node.id),
  };
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
    const group = nodes.filter((node) => node.id !== "origin" && sectorFor(node) === sector.key);
    const center = sectorCenter(sector);
    group.forEach((node, index) => {
      const spiral = index * 2.39996 - Math.PI / 2;
      const radius = Math.min(2.2 + Math.sqrt(index) * 3.1, 10.8);
      positions.set(node.id, { x: roundCoord(center.x + Math.cos(spiral) * radius), y: roundCoord(center.y + Math.sin(spiral) * radius * .82), sector: sector.key });
    });
  }
  return positions;
}

function projectAtlas(nodes: AtlasNode[], base: Map<string, AtlasPosition>, activeSector: SectorKey | "all") {
  if (activeSector === "all") return base;
  const sector = sectorInfo(activeSector);
  const center = sectorCenter(sector);
  const projected = new Map<string, AtlasPosition>();
  for (const node of nodes) {
    if (node.id === "origin" || sectorFor(node) !== activeSector) continue;
    const point = base.get(node.id);
    if (!point) continue;
    projected.set(node.id, { x: roundCoord(50 + (point.x - center.x) * 2.35), y: roundCoord(52 + (point.y - center.y) * 2.35), sector: activeSector });
  }
  return projected;
}

function constellationPosition(constellation: Constellation, positions: Map<string, { x: number; y: number }>) {
  const points = constellation.nodeIds.map((id) => positions.get(id)).filter(Boolean) as Array<{ x: number; y: number }>;
  if (!points.length) return null;
  return { x: roundCoord(points.reduce((sum, point) => sum + point.x, 0) / points.length), y: roundCoord(points.reduce((sum, point) => sum + point.y, 0) / points.length) };
}

function faceGeometry(face: Constellation, positions: Map<string, { x: number; y: number }>) {
  const points = face.nodeIds.map((id) => positions.get(id)).filter(Boolean) as Array<{ x: number; y: number }>;
  if (points.length < 3) return null;
  return {
    points: points.map((point) => `${point.x},${point.y}`).join(" "),
    x: roundCoord(points.reduce((sum, point) => sum + point.x, 0) / points.length),
    y: roundCoord(points.reduce((sum, point) => sum + point.y, 0) / points.length),
  };
}

function volumePosition(volume: KnowledgeVolume, positions: Map<string, { x: number; y: number }>) {
  const points = volume.nodeIds.map((id) => positions.get(id)).filter(Boolean) as Array<{ x: number; y: number }>;
  if (!points.length) return null;
  return { x: roundCoord(points.reduce((sum, point) => sum + point.x, 0) / points.length), y: roundCoord(points.reduce((sum, point) => sum + point.y, 0) / points.length) };
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
    if (forward <= .7) continue;
    const sideways = horizontal ? Math.abs(dy) * 1.25 : Math.abs(dx) * .75;
    const score = forward + sideways * 2.4 + (sideways / forward) * 9;
    if (!best || score < best.score) best = { id: candidate.id, score };
  }
  return best?.id || null;
}

function playerAnswerFrom(payload: Record<string, unknown>) {
  if (typeof payload.answer === "string") return payload.answer;
  if (typeof payload.value === "number") return `${payload.value}/100`;
  if (Array.isArray(payload.order)) return payload.order.join(" → ");
  return "完成了一次判断";
}

const FALLBACK_CHOICE_VISUALS: ChoiceVisual[] = [
  { value: 28, uncertainty: 0, annotation: "下降" },
  { value: 54, uncertainty: 0, annotation: "接近原值" },
  { value: 82, uncertainty: 12, annotation: "上升并波动" },
];

const CHOICE_COLORS = ["#c65740", "#b49768", "#7fa6a0"];
const STRUCTURE_LENSES: Array<{ key: Exclude<StructureLens, "all">; label: string; dimension: string; ability: string }> = [
  { key: "point", label: "点", dimension: "0D", ability: "我见过什么" },
  { key: "line", label: "线", dimension: "1D", ability: "它为何相连" },
  { key: "face", label: "面", dimension: "2D", ability: "共同解释什么" },
  { key: "volume", label: "体", dimension: "3D", ability: "如何迁移出去" },
];

function atlasEdgeKey(edge: Pick<AtlasEdge, "from" | "to">) { return `${edge.from}->${edge.to}`; }
function edgeMidpoint(edge: AtlasEdge, positions: Map<string, { x: number; y: number }>) {
  const from = positions.get(edge.from); const to = positions.get(edge.to);
  if (!from || !to) return null;
  return { x: roundCoord((from.x + to.x) / 2), y: roundCoord((from.y + to.y) / 2) };
}

function plotY(value: number) { return 182 - Math.max(0, Math.min(100, value)) * 1.28; }

function ChoiceHypothesisGraphic({ encounter, selectedIndex }: { encounter: Encounter; selectedIndex: number | null }) {
  const context = encounter.visual_context || { measure: "结果变化", unit: "相对尺度", baseline_label: "变化前", changed_label: "变化后", baseline_value: 50 };
  const visuals = encounter.choices.map((_, index) => encounter.choice_visuals?.[index] || FALLBACK_CHOICE_VISUALS[index]);
  const baselineY = plotY(context.baseline_value);
  const active = selectedIndex === null ? null : visuals[selectedIndex];
  return <figure className="observation-instrument semantic-chart mode-choice">
    <svg viewBox="0 0 640 224" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="hypothesis-chart-title hypothesis-chart-description">
      <title id="hypothesis-chart-title">{context.measure}的三种变化假设</title>
      <desc id="hypothesis-chart-description">从{context.baseline_label}到{context.changed_label}，三条轨迹分别对应下方三个答案。纵轴单位为{context.unit}。</desc>
      <g className="semantic-grid" aria-hidden="true">
        {[25, 50, 75].map((tick) => <g key={tick}><path d={`M86 ${plotY(tick)}H590`} /><text x="72" y={plotY(tick) + 4}>{tick}</text></g>)}
      </g>
      <text className="chart-measure" x="86" y="25">{context.measure}</text>
      <text className="chart-unit" x="590" y="25" textAnchor="end">纵轴 · {context.unit}</text>
      <g className="baseline-mark">
        <path d={`M150 ${baselineY}V190`} />
        <circle cx="150" cy={baselineY} r="8" />
        <text x="150" y="210" textAnchor="middle">{context.baseline_label}</text>
      </g>
      {visuals.map((visual, index) => {
        const y = plotY(visual.value);
        const rangeTop = plotY(Math.min(100, visual.value + visual.uncertainty));
        const rangeBottom = plotY(Math.max(0, visual.value - visual.uncertainty));
        const dimmed = selectedIndex !== null && selectedIndex !== index;
        return <g className={`hypothesis-series ${dimmed ? "dimmed" : ""} ${selectedIndex === index ? "selected" : ""}`} key={encounter.choices[index]} style={{ "--series-color": CHOICE_COLORS[index] } as CSSProperties}>
          <path className="series-path" d={`M150 ${baselineY}C270 ${baselineY},390 ${y},510 ${y}`} />
          {visual.uncertainty > 0 ? <><path className="uncertainty-line" d={`M510 ${rangeTop}V${rangeBottom}`} /><path className="uncertainty-cap" d={`M500 ${rangeTop}H520M500 ${rangeBottom}H520`} /></> : null}
          <circle className="series-point" cx="510" cy={y} r="7" />
          <text className="series-number" x="532" y={y + 5}>0{index + 1}</text>
        </g>;
      })}
      <text className="changed-label" x="510" y="210" textAnchor="middle">{context.changed_label}</text>
      {active ? <text className="active-annotation" x="320" y="47" textAnchor="middle">当前假设：{active.annotation}</text> : null}
    </svg>
    <figcaption aria-live="polite"><span><b>{context.measure}</b><small>同一纵轴比较三种答案</small></span><strong>{active ? active.annotation : "先选一条轨迹，再锁定判断"}</strong></figcaption>
  </figure>;
}

function ObservationInstrument({ encounter, scaleValue, arranged, selectedChoice }: { encounter: Encounter; scaleValue: number; arranged: string[]; selectedChoice: number | null }) {
  if (encounter.interaction === "choice") return <ChoiceHypothesisGraphic encounter={encounter} selectedIndex={selectedChoice} />;
  if (encounter.interaction === "scale" && encounter.scale) {
    const probeX = 80 + Math.max(0, Math.min(100, scaleValue)) * 4.8;
    return <figure className="observation-instrument semantic-chart mode-scale">
      <svg viewBox="0 0 640 190" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="scale-chart-title scale-chart-description">
        <title id="scale-chart-title">在{encounter.scale.left}与{encounter.scale.right}之间估计</title>
        <desc id="scale-chart-description">当前判断位于刻度{scaleValue}。</desc>
        <g className="scale-grid" aria-hidden="true">{[0, 25, 50, 75, 100].map((tick) => <g key={tick}><path d={`M${80 + tick * 4.8} 58V132`} /><text x={80 + tick * 4.8} y="153" textAnchor="middle">{tick}</text></g>)}</g>
        <path className="scale-track" d="M80 96H560" />
        <path className="scale-fill" d={`M80 96H${probeX}`} />
        <g className="scale-probe" transform={`translate(${probeX} 0)`}><circle cx="0" cy="96" r="11" /><path d="M0 50V142" /></g>
        <text className="scale-value" x={probeX} y="39" textAnchor="middle">{scaleValue}</text>
        <text className="scale-end" x="80" y="177">{encounter.scale.left}</text><text className="scale-end" x="560" y="177" textAnchor="end">{encounter.scale.right}</text>
      </svg>
      <figcaption aria-live="polite"><span><b>连续变化</b><small>拖动下方滑杆，图中的位置同步变化</small></span><strong>当前判断 {scaleValue} / 100</strong></figcaption>
    </figure>;
  }
  return <figure className="observation-instrument semantic-chart mode-arrange">
    <svg viewBox="0 0 640 190" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="timeline-title timeline-description">
      <title id="timeline-title">把三个阶段排成一条因果时间线</title>
      <desc id="timeline-description">当前已经放入{arranged.length}个阶段。</desc>
      <path className="timeline-track" d="M110 92H530" />
      {[0, 1, 2].map((index) => { const x = 110 + index * 210; const item = arranged[index]; return <g className={`timeline-stop ${item ? "filled" : ""}`} key={index}><circle cx={x} cy="92" r="22" /><text className="timeline-number" x={x} y="98" textAnchor="middle">{index + 1}</text><text className="timeline-label" x={x} y="145" textAnchor="middle">{item || "等待放入"}</text></g>; })}
    </svg>
    <figcaption aria-live="polite"><span><b>因果顺序</b><small>图上每一个位置都对应一个真实阶段</small></span><strong>已经放入 {arranged.length} / 3</strong></figcaption>
  </figure>;
}

function GeneratedWorld({ artifact, encounter, onCommit }: { artifact: GeneratedArtifact; encounter: Encounter; onCommit: (payload: Record<string, unknown>) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => { commitRef.current = onCommit; }, [onCommit]);
  useEffect(() => {
    function receiveArtifactAction(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, unknown>;
      if (message.source !== "spark-atlas-artifact" || message.type !== "commit") return;
      if (encounter.interaction === "choice" && typeof message.answer === "string" && encounter.choices.includes(message.answer)) commitRef.current({ answer: message.answer });
      else if (encounter.interaction === "scale" && Number.isFinite(Number(message.value))) commitRef.current({ value: Math.max(0, Math.min(100, Number(message.value))) });
      else if (encounter.interaction === "arrange" && Array.isArray(message.order)) {
        const order = message.order.slice(0, 3).map(String);
        if (order.length === 3 && order.every((item) => encounter.items.includes(item))) commitRef.current({ order });
      }
    }
    window.addEventListener("message", receiveArtifactAction);
    return () => window.removeEventListener("message", receiveArtifactAction);
  }, [encounter.choices, encounter.interaction, encounter.items]);
  const srcDoc = useMemo(() => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; media-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none';"><style>:root{color-scheme:dark}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#080b08;color:#f2ebdc;font-family:Inter,'PingFang SC','Microsoft YaHei',sans-serif}button,input{font:inherit}button{color:inherit}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}</style></head><body>${artifact.html}</body></html>`, [artifact.html]);
  return <figure className={`generated-world medium-${artifact.medium}`}>
    <header><span><i aria-hidden="true" />AI 生成世界</span><b>{artifact.title}</b><small>{artifact.medium.toUpperCase()} · 本次实时生成</small></header>
    <iframe ref={frameRef} title={`${artifact.title}互动知识可视化`} sandbox="allow-scripts" srcDoc={srcDoc} loading="eager" />
    <figcaption><span>{artifact.hint}</span><small>{artifact.can_commit ? "完成世界里的操作即可提交判断；下方控制仍可备用。" : "先在世界里观察；再用下方通用控制留下判断。"}</small></figcaption>
  </figure>;
}

function KnowledgeArticle({ record, onRoute, onReplay, live }: { record: KnowledgeRecord; onRoute: (route: NextNode) => void; onReplay: () => void; live?: boolean }) {
  const verdictCopy = record.verdict === "hit" ? { label: "命中", title: "你抓住了关键关系" } : record.verdict === "near" ? { label: "接近", title: "方向对了，还差一个变量" } : { label: "反转", title: "现实让直觉拐了个弯" };
  return <article className={`sheet-reveal ${live ? "live" : "memory"}`}>
    <header className={`verdict-banner verdict-${record.verdict}`}><span>{verdictCopy.label}</span><div><b>{verdictCopy.title}</b><p>{live ? record.echo : "这次判断已经留在你的星图里"}</p></div></header>
    <div className="answer-contrast"><section><small>你押下的答案</small><b>{record.playerAnswer}</b></section><i aria-hidden="true">→</i><section><small>现实里的关系</small><h2>{record.answerTitle}</h2></section></div>
    <aside className="question-upgrade"><small>你刚刚获得的新问题</small><p>{record.whyItMatters}</p></aside>
    <section className="knowledge-scene"><small>把现场放到眼前</small><p>{record.scene}</p></section>
    <section className="knowledge-explanation"><small>它为什么会这样</small><p>{record.explanation}</p></section>
    {record.transfer ? <aside className="transfer-card"><small>把这个模型带回日常</small><p>{record.transfer}</p></aside> : null}
    {record.terms.length ? <section className="term-shelf"><small>只记住这两个词</small><div>{record.terms.map((item) => <dl key={item.term}><dt>{item.term}</dt><dd>{item.meaning}</dd></dl>)}</div></section> : null}
    <details className="fact-boundary"><summary>依据与边界</summary><span>{record.sourceNote}</span></details>
    <div className="departures"><header><span>这个问题还能把你带到哪里？</span><small>只取一条路</small></header>{record.nextNodes.map((route) => <button type="button" key={`${route.kind}-${route.name}`} onClick={() => onRoute(route)}><small>{route.kind === "deeper" ? "继续追问" : route.kind === "bridge" ? "换个角度" : "跳到远处"}</small><b>{route.name}</b><span>{route.promise}</span></button>)}</div>
    {!live ? <button className="reobserve-link" type="button" onClick={onReplay}>换一种方式再次观测</button> : null}
  </article>;
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
  const [hypothesisIndex, setHypothesisIndex] = useState<number | null>(null);
  const [charting, setCharting] = useState(false);
  const [activeSector, setActiveSector] = useState<SectorKey | "all">("all");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [introOpen, setIntroOpen] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [constellationReveal, setConstellationReveal] = useState<Constellation | null>(null);
  const [volumeReveal, setVolumeReveal] = useState<KnowledgeVolume | null>(null);
  const [toast, setToast] = useState("");
  const [newNodeIds, setNewNodeIds] = useState<string[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [navigatorId, setNavigatorId] = useState<string | null>(null);
  const [flightTrace, setFlightTrace] = useState<FlightTrace | null>(null);
  const [flightFeedback, setFlightFeedback] = useState<FlightFeedback>({ kind: "arrive", serial: 0 });
  const [waitBeat, setWaitBeat] = useState(0);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [structureLens, setStructureLens] = useState<StructureLens>("all");
  const [inspectedEdgeKey, setInspectedEdgeKey] = useState<string | null>(null);
  const [freshEdgeKey, setFreshEdgeKey] = useState<string | null>(null);
  const requestSerial = useRef(0);
  const flightSerial = useRef(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLElement>(null);
  const observationRef = useRef<HTMLElement>(null);
  const archiveRef = useRef<HTMLElement>(null);
  const constellationRef = useRef<HTMLElement>(null);
  const volumeRef = useRef<HTMLElement>(null);
  const resetRef = useRef<HTMLElement>(null);

  const nodeById = useMemo(() => new Map(atlas.nodes.map((node) => [node.id, node])), [atlas.nodes]);
  const basePositions = useMemo(() => positionAtlas(atlas.nodes), [atlas.nodes]);
  const positions = useMemo(() => projectAtlas(atlas.nodes, basePositions, activeSector), [atlas.nodes, basePositions, activeSector]);
  const selectedNode = selectedId ? nodeById.get(selectedId) || null : null;
  const discovered = useMemo(() => atlas.nodes.filter((node) => node.status === "discovered"), [atlas.nodes]);
  const frontiers = useMemo(() => atlas.nodes.filter((node) => node.status === "frontier"), [atlas.nodes]);
  const recentIds = useMemo(() => new Set(atlas.trail.slice(-3)), [atlas.trail]);
  const discoveredFields = useMemo(() => new Set(discovered.map((node) => node.field)), [discovered]);
  const discoveredSectors = useMemo(() => new Set(discovered.map(sectorFor)), [discovered]);
  const recommended = useMemo(() => frontiers.find((node) => !discoveredFields.has(node.field) && !discoveredSectors.has(sectorFor(node))) || frontiers.find((node) => !discoveredFields.has(node.field)) || frontiers[atlas.expeditions % Math.max(1, frontiers.length)] || null, [frontiers, discoveredFields, discoveredSectors, atlas.expeditions]);
  const fieldCount = discoveredFields.size;
  const expeditionStep = atlas.expeditions % 3;
  const expeditionNumber = Math.floor(atlas.expeditions / 3) + 1;
  const constellationWaiting = atlas.constellations.length < Math.floor(atlas.expeditions / 3);
  const observationsRemaining = constellationWaiting ? 0 : 3 - expeditionStep;
  const uniqueConstellations = useMemo(() => dedupeConstellations(atlas.constellations), [atlas.constellations]);
  const uniqueVolumes = useMemo(() => dedupeVolumes(atlas.volumes), [atlas.volumes]);
  const traversedEdges = useMemo(() => atlas.edges.filter((edge) => edge.traversed).length, [atlas.edges]);
  const facesUntilVolume = 3 - uniqueConstellations.length % 3 || 3;
  const faceProgress = constellationWaiting ? 3 : expeditionStep;
  const volumeProgress = uniqueConstellations.length % 3;
  const lensCounts: Record<Exclude<StructureLens, "all">, number> = { point: discovered.length, line: traversedEdges, face: uniqueConstellations.length, volume: uniqueVolumes.length };
  const activeLens = STRUCTURE_LENSES.find((lens) => lens.key === structureLens) || null;
  const visibleNodes = useMemo(() => activeSector === "all" ? atlas.nodes : atlas.nodes.filter((node) => node.id !== "origin" && sectorFor(node) === activeSector), [activeSector, atlas.nodes]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleNavigatorNode = navigatorId && visibleNodeIds.has(navigatorId) ? nodeById.get(navigatorId) || null : null;
  const flightNode = visibleNavigatorNode || (recommended && visibleNodeIds.has(recommended.id) ? recommended : null) || visibleNodes.find((node) => node.status === "frontier") || visibleNodes[0] || null;
  const inspectedNode = inspectedId && visibleNodeIds.has(inspectedId) ? nodeById.get(inspectedId) || null : null;
  const dockNode = inspectedNode || flightNode;
  const flightPosition = flightNode ? positions.get(flightNode.id) || null : null;
  const traceFrom = flightTrace ? positions.get(flightTrace.from) || null : null;
  const traceTo = flightTrace ? positions.get(flightTrace.to) || null : null;
  const activeSectorInfo = activeSector === "all" ? null : sectorInfo(activeSector);
  const overlayKey = resetOpen ? "reset" : volumeReveal ? "volume" : constellationReveal ? "constellation" : archiveOpen ? "archive" : selectedId ? "observation" : introOpen && storageReady ? "intro" : "";
  const latestProfile = atlas.profileSignals.at(-1) || "你的好奇心轮廓会随着探索逐渐显影";

  useEffect(() => {
    try {
      let migrated: AtlasState | null = null;
      for (const key of [STORAGE_KEY, ...OLD_STORAGE_KEYS]) {
        const saved = window.localStorage.getItem(key);
        if (!saved) continue;
        try {
          const candidate = migrateAtlas(JSON.parse(saved));
          const candidateScore = candidate ? candidate.expeditions * 1000 + candidate.constellations.length * 10 + candidate.volumes.length : -1;
          const currentScore = migrated ? migrated.expeditions * 1000 + migrated.constellations.length * 10 + migrated.volumes.length : -1;
          if (candidate && candidateScore > currentScore) migrated = candidate;
        } catch { window.localStorage.removeItem(key); }
      }
      // Browser storage is an external system; restore it once after mounting.
      if (migrated) { setAtlas(migrated); setIntroOpen(false); }
    } finally { setStorageReady(true); }
    fetch("/api/atlas").then((response) => response.json()).then((data) => setEngine(data.connected ? "ready" : "offline")).catch(() => setEngine("offline"));
  }, []);

  useEffect(() => { if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(atlas)); }, [atlas, storageReady]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3000); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!newNodeIds.length) return; const timer = window.setTimeout(() => setNewNodeIds([]), 2400); return () => window.clearTimeout(timer); }, [newNodeIds]);
  useEffect(() => { if (!freshEdgeKey) return; const timer = window.setTimeout(() => setFreshEdgeKey(null), 3200); return () => window.clearTimeout(timer); }, [freshEdgeKey]);
  useEffect(() => { if (!charting && stage !== "loading" && stage !== "resolving") return; const timer = window.setInterval(() => setWaitBeat((beat) => (beat + 1) % 3), 1350); return () => window.clearInterval(timer); }, [charting, stage]);
  useEffect(() => {
    if (!overlayKey) return;
    const target = overlayKey === "reset" ? resetRef.current : overlayKey === "volume" ? volumeRef.current : overlayKey === "constellation" ? constellationRef.current : overlayKey === "archive" ? archiveRef.current : overlayKey === "observation" ? observationRef.current : introRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => target?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), summary")?.focus());
    return () => { window.cancelAnimationFrame(frame); previous?.focus?.(); };
  }, [overlayKey]);

  function mapContext() { return { discovered: discovered.map((node) => node.name), frontier: frontiers.map((node) => node.name), fields: [...discoveredFields] }; }
  function haptic(pattern: number | number[] = 10) { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern); }
  function clearObservation() { setEncounter(null); setResolution(null); setArranged([]); setScaleValue(50); setHypothesisIndex(null); }
  function closeObservation() { requestSerial.current += 1; setSelectedId(null); setStage("summary"); clearObservation(); }
  function closeTopOverlay() {
    if (resetOpen) setResetOpen(false);
    else if (volumeReveal) setVolumeReveal(null);
    else if (constellationReveal) setConstellationReveal(null);
    else if (archiveOpen) setArchiveOpen(false);
    else if (selectedId) closeObservation();
    else if (introOpen) setIntroOpen(false);
  }
  function trapDialog(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeTopOverlay(); return; }
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex='-1'])"));
    if (!items.length) return;
    const first = items[0]; const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  async function launchEncounter(node: AtlasNode) {
    setSelectedId(node.id); setIntroOpen(false); clearObservation(); haptic(12);
    if (engine !== "ready") { setStage("summary"); setToast("AI世界引擎尚未连接；检查密钥后再试一次"); return; }
    setWaitBeat(0); setStage("loading"); const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "encounter", node, map: mapContext() });
      if (requestId !== requestSerial.current) return;
      setEncounter(data as Encounter); setStage("observe"); haptic([8, 35, 8]);
    } catch (error) { if (requestId !== requestSerial.current) return; setToast(error instanceof Error ? error.message : "观测没有成形，请再试一次"); setStage("summary"); }
  }

  function selectNode(node: AtlasNode) {
    requestSerial.current += 1;
    if (node.status === "frontier") { launchEncounter(node); return; }
    setSelectedId(node.id); setStage("summary"); setIntroOpen(false); clearObservation(); haptic(8);
  }

  function chooseSector(sector: SectorKey | "all", targetId?: string) {
    setActiveSector(sector); setNavigatorId(targetId || null); setFlightTrace(null); setInspectedId(targetId || null); haptic(7);
  }

  function chooseStructureLens(lens: StructureLens) {
    setStructureLens(lens);
    if (lens === "face" || lens === "volume") chooseSector("all");
    if (lens !== "line") setInspectedEdgeKey(null);
    haptic(6);
  }

  function lockRecommended() {
    if (!recommended) return;
    chooseSector(sectorFor(recommended), recommended.id);
    setToast(`航线已锁定：${recommended.name}`);
  }

  function focusNode(node: AtlasNode) {
    if (activeSector === "all" && node.id !== "origin") { chooseSector(sectorFor(node), node.id); return; }
    if (navigatorId === node.id || node.id === "origin") { selectNode(node); return; }
    setNavigatorId(node.id); setInspectedId(node.id); haptic(7);
  }

  function moveFlight(direction: FlightDirection) {
    if (!flightNode) return;
    const nextId = directionalTarget(flightNode.id, visibleNodes, positions, direction);
    const serial = ++flightSerial.current;
    if (!nextId) { setFlightFeedback({ kind: "blocked", serial }); haptic([12, 30, 12]); return; }
    setFlightTrace({ from: flightNode.id, to: nextId, serial }); setFlightFeedback({ kind: "arrive", serial }); setNavigatorId(nextId); setInspectedId(nextId); haptic(7);
  }

  function activateFlightNode() {
    if (!flightNode) return;
    if (activeSector === "all" && flightNode.id !== "origin") { chooseSector(sectorFor(flightNode), flightNode.id); return; }
    selectNode(flightNode);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, input, summary")) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (!pointerStart.current) return;
    const dx = event.clientX - pointerStart.current.x; const dy = event.clientY - pointerStart.current.y;
    pointerStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 34) return;
    moveFlight(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }

  async function resolveObservation(payload: Record<string, unknown>) {
    if (!selectedNode || !encounter || stage !== "observe") return;
    setWaitBeat(0); setStage("resolving"); const requestId = ++requestSerial.current;
    try {
      const data = await atlasRequest({ mode: "resolve", token: encounter.token, ...payload });
      if (requestId !== requestSerial.current) return;
      const resolved = { ...(data as Omit<Resolution, "player_answer">), player_answer: playerAnswerFrom(payload) } as Resolution;
      const knowledge: KnowledgeRecord = { signal: encounter.signal, question: encounter.question, playerAnswer: playerAnswerFrom(payload), verdict: resolved.verdict, echo: resolved.echo, answerTitle: resolved.answer_title, scene: resolved.scene, explanation: resolved.explanation, terms: resolved.terms, whyItMatters: resolved.why_it_matters, transfer: resolved.transfer, sourceNote: resolved.source_note, nextNodes: resolved.next_nodes, discoveredAt: atlas.expeditions + 1 };
      setAtlas((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, status: "discovered" as const, spark: resolved.spark, knowledge } : node), profileSignals: [...current.profileSignals, resolved.profile_signal].slice(-12), expeditions: current.expeditions + 1, trail: [...current.trail, selectedNode.id].slice(-60) }));
      setNewNodeIds([selectedNode.id]); setStructureLens("point"); setResolution(resolved); setStage("reveal"); haptic([10, 45, 18]);
    } catch (error) { if (requestId !== requestSerial.current) return; setToast(error instanceof Error ? error.message : "这页档案没有写完，请再试一次"); setStage("observe"); }
  }

  function pickArrangeItem(item: string) { setArranged((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]); haptic(5); }

  async function nameVolumeIfDue(faces: Constellation[]) {
    const earnedVolumes = Math.floor(faces.length / 3);
    if (earnedVolumes === 0 || uniqueVolumes.length >= earnedVolumes) return;
    const recentFaces = faces.slice(-3);
    try {
      const data = await atlasRequest({ mode: "volume", faces: recentFaces.map((face) => ({ name: face.name, line: face.line, motif: face.motif })), existing_names: uniqueVolumes.map((item) => item.name) });
      let name = String(data.name || "迁移之体");
      if (uniqueVolumes.some((item) => item.name.replace(/\s/g, "") === name.replace(/\s/g, ""))) name = `${String(data.law || "迁移").slice(0, 6)}体`;
      const volume: KnowledgeVolume = {
        id: `volume-${earnedVolumes}`,
        name,
        line: String(data.line || "三个问题形状折叠成了一种可以迁移的看法"),
        law: String(data.law || "遇到新问题时，先寻找同一种关系是否也在这里出现。"),
        faceIds: recentFaces.map((face) => face.id),
        nodeIds: [...new Set(recentFaces.flatMap((face) => face.nodeIds))],
      };
      setAtlas((current) => current.volumes.some((item) => item.id === volume.id) ? current : { ...current, volumes: [...current.volumes, volume] });
      setStructureLens("volume"); setConstellationReveal(null); setVolumeReveal(volume); haptic([18, 45, 18, 45, 18, 70, 30]);
    } catch { setToast("三张解释面已经闭合；世界模型还在寻找最准确的名字"); }
  }

  async function nameConstellationIfDue() {
    const earnedConstellations = Math.floor(atlas.expeditions / 3);
    if (earnedConstellations === 0 || uniqueConstellations.length >= earnedConstellations) return;
    const orderedDiscoveries = atlas.trail.map((id) => nodeById.get(id)).filter((node): node is AtlasNode => Boolean(node && node.status === "discovered"));
    const orderedSource = orderedDiscoveries.length >= discovered.length ? orderedDiscoveries : [...discovered].sort((a, b) => (a.knowledge?.discoveredAt || 0) - (b.knowledge?.discoveredAt || 0));
    const faceNodes = orderedSource.slice(uniqueConstellations.length * 3, uniqueConstellations.length * 3 + 3);
    const recent = faceNodes.map((node) => ({ name: node.name, field: node.field, spark: node.spark?.insight }));
    if (faceNodes.length < 3) return;
    try {
      const data = await atlasRequest({ mode: "constellation", recent_nodes: recent, profile_signals: atlas.profileSignals, existing_names: uniqueConstellations.map((item) => item.name) });
      let name = String(data.name || "未命名解释面");
      if (uniqueConstellations.some((item) => item.name.replace(/\s/g, "") === name.replace(/\s/g, ""))) name = `${String(data.motif || "远近之间").slice(0, 8)}面`;
      const constellation: Constellation = { id: `constellation-${atlas.constellations.length + 1}`, name, line: data.line, motif: data.motif, nodeIds: faceNodes.map((node) => node.id) };
      const nextFaces = [...uniqueConstellations, constellation];
      setAtlas((current) => current.constellations.some((item) => item.id === constellation.id) ? current : { ...current, constellations: [...current.constellations, constellation] }); setStructureLens("face"); setConstellationReveal(constellation); haptic([12, 50, 12, 50, 24]);
      await nameVolumeIfDue(nextFaces);
    } catch { setToast("这三个问题还没有闭合成解释面；下一条航线会再试一次"); }
  }

  async function chooseRoute(route: NextNode) {
    if (!selectedNode) return;
    const existing = atlas.nodes.find((node) => node.name === route.name);
    const nextId = existing?.id || `route-${atlas.nodes.length}-${atlas.expeditions}-${route.kind}`;
    const newEdgeKey = `${selectedNode.id}->${nextId}`;
    setAtlas((current) => ({ ...current, nodes: existing ? current.nodes : [...current.nodes, { id: nextId, name: route.name, field: route.field, hook: route.promise, status: "frontier", sector: route.sector || inferSector(route.field), connectionReason: route.connection_reason }], edges: current.edges.some((edge) => edge.from === selectedNode.id && edge.to === nextId) ? current.edges.map((edge) => edge.from === selectedNode.id && edge.to === nextId ? { ...edge, traversed: true } : edge) : [...current.edges, { from: selectedNode.id, to: nextId, kind: route.kind === "deeper" ? "normal" : route.kind, reason: route.connection_reason, traversed: true, createdAt: current.expeditions }] }));
    setNewNodeIds([nextId]); setFreshEdgeKey(newEdgeKey); setInspectedEdgeKey(newEdgeKey); setStructureLens("line"); setActiveSector(route.sector || inferSector(route.field)); setNavigatorId(nextId); closeObservation(); setToast(`一条新线出现：${route.connection_reason}`); await nameConstellationIfDue();
  }

  async function chartThought() {
    const thought = questionRef.current?.value.trim() || "";
    if (!thought || charting || engine !== "ready") { if (engine !== "ready") setToast("AI世界引擎尚未连接；检查密钥后再试一次"); return; }
    setWaitBeat(0); setCharting(true);
    try {
      const data = await atlasRequest({ mode: "chart", thought, map: mapContext() });
      const parent = atlas.nodes.find((node) => node.name === data.parent_hint) || atlas.nodes[0]; const id = `charted-${atlas.nodes.length}-${atlas.expeditions}`; const sector = data.node.sector || inferSector(data.node.field);
      setAtlas((current) => ({ ...current, nodes: [...current.nodes, { id, ...data.node, status: "frontier", sector, connectionReason: data.nav_note }], edges: [...current.edges, { from: parent.id, to: id, kind: "bridge", reason: data.nav_note, traversed: false, createdAt: current.expeditions }] }));
      setNewNodeIds([id]); setActiveSector(sector); setNavigatorId(id); if (questionRef.current) questionRef.current.value = ""; setQuestionOpen(false); setToast(`它落在${sectorInfo(sector).label}星域：${data.nav_note}`); haptic([10, 40, 15]);
    } catch (error) { setToast(error instanceof Error ? error.message : "这件事暂时找不到位置，请换一种说法"); } finally { setCharting(false); }
  }

  async function copyConstellation(item: Constellation) {
    try { await navigator.clipboard.writeText(`我的知识解释面：${item.name}\n${item.line}\n共同问题：${item.motif}\n——星火档案`); setToast("解释面已经复制，可以分享给朋友了"); }
    catch { setToast("暂时无法复制；请允许剪贴板权限后再试一次"); }
  }

  async function copyVolume(item: KnowledgeVolume) {
    try { await navigator.clipboard.writeText(`我的世界模型：${item.name}\n${item.line}\n迁移法则：${item.law}\n——星火档案`); setToast("世界模型已经复制，可以带去别的问题里了"); }
    catch { setToast("暂时无法复制；请允许剪贴板权限后再试一次"); }
  }

  function resetAtlas() { setAtlas(INITIAL_ATLAS); closeObservation(); setIntroOpen(true); setArchiveOpen(false); setResetOpen(false); setActiveSector("all"); setStructureLens("all"); setInspectedId(null); setInspectedEdgeKey(null); setFreshEdgeKey(null); setNavigatorId(null); setFlightTrace(null); for (const key of [STORAGE_KEY, ...OLD_STORAGE_KEYS]) window.localStorage.removeItem(key); }

  useEffect(() => {
    function onFlightKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (overlayKey) return;
      if (event.key === "Escape" && activeSector !== "all") { event.preventDefault(); chooseSector("all"); return; }
      const direction: FlightDirection | null = event.key === "w" || event.key === "W" || event.key === "ArrowUp" ? "up" : event.key === "s" || event.key === "S" || event.key === "ArrowDown" ? "down" : event.key === "a" || event.key === "A" || event.key === "ArrowLeft" ? "left" : event.key === "d" || event.key === "D" || event.key === "ArrowRight" ? "right" : null;
      if (direction) { event.preventDefault(); moveFlight(direction); return; }
      if (event.key !== "Enter" && event.code !== "Space") return;
      if (target?.closest("button, a, summary")) return;
      event.preventDefault(); activateFlightNode();
    }
    window.addEventListener("keydown", onFlightKey);
    return () => window.removeEventListener("keydown", onFlightKey);
  // The navigation helpers intentionally capture the current projected map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSector, flightNode, overlayKey, positions, visibleNodes]);

  const liveKnowledge = selectedNode && encounter && resolution ? { signal: encounter.signal, question: encounter.question, playerAnswer: resolution.player_answer, verdict: resolution.verdict, echo: resolution.echo, answerTitle: resolution.answer_title, scene: resolution.scene, explanation: resolution.explanation, terms: resolution.terms, whyItMatters: resolution.why_it_matters, transfer: resolution.transfer, sourceNote: resolution.source_note, nextNodes: resolution.next_nodes, discoveredAt: atlas.expeditions } satisfies KnowledgeRecord : null;
  const routeReason = dockNode?.connectionReason || atlas.edges.find((edge) => edge.to === dockNode?.id)?.reason || dockNode?.hook || "选择一个方向，世界会从这里继续长大";
  return (
    <main className={`archive-shell ${storageReady ? "is-ready" : "is-opening"}`}>
      <a className="skip-link" href="#star-chart">跳到星图</a>
      <header className="archive-header">
        <h1><button className="archive-brand" type="button" onClick={() => setIntroOpen(true)}><i aria-hidden="true">✦</i><span><b>星火档案</b><small translate="no">ATLAS OF UNFINISHED QUESTIONS</small></span></button></h1>
        <p><span>百门计划</span><i /><b>{fieldCount}</b><small>/ 100 个领域</small></p>
        <nav className="archive-tools" aria-label="档案工具"><button type="button" onClick={() => setIntroOpen(true)} aria-label="查看百门计划序言">为什么</button><button className="archive-button" type="button" onClick={() => setArchiveOpen(true)}>提问地图 <b>{fieldCount}</b></button></nav>
      </header>

      <section id="star-chart" className={`chart-viewport lens-${structureLens} ${activeSector === "all" ? "overview" : "sector-focus"} ${navigatorId ? "flight-active" : "flight-standby"} ${charting ? "is-charting" : ""}`} aria-label="个人知识天球图" aria-keyshortcuts="W A S D ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        <div className="paper-grain" aria-hidden="true" />
        <nav className="sky-index" aria-label="知识星域">
          <button className={activeSector === "all" ? "active" : ""} type="button" aria-pressed={activeSector === "all"} onClick={() => chooseSector("all")}>全图 <sup>{fieldCount}/100</sup></button>
          {SECTORS.map((sector) => { const count = atlas.nodes.filter((node) => node.id !== "origin" && sectorFor(node) === sector.key).length; return <button key={sector.key} className={activeSector === sector.key ? "active" : ""} type="button" aria-pressed={activeSector === sector.key} onClick={() => chooseSector(sector.key)}>{sector.label}<sup>{count}</sup></button>; })}
        </nav>

        <div className="camera-crumb" aria-live="polite"><span>知识宇宙</span>{activeSectorInfo ? <><i>／</i><b>{activeSectorInfo.label}星域</b><button type="button" onClick={() => chooseSector("all")}>返回全图 <kbd>Esc</kbd></button></> : <b>六片星域</b>}</div>

        <nav className="structure-lens" aria-label="点线面体结构透镜">
          <header><small translate="no">STRUCTURE LENS</small><b>{activeLens ? activeLens.ability : "看见完整知识结构"}</b></header>
          <button className={structureLens === "all" ? "active lens-all" : "lens-all"} type="button" aria-pressed={structureLens === "all"} onClick={() => chooseStructureLens("all")}><i aria-hidden="true" /><b>全结构</b><small>同时观察</small></button>
          {STRUCTURE_LENSES.map((lens) => <button className={structureLens === lens.key ? `active lens-${lens.key}` : `lens-${lens.key}`} type="button" aria-pressed={structureLens === lens.key} key={lens.key} onClick={() => chooseStructureLens(lens.key)}><i aria-hidden="true" /><b>{lens.label}<em>{lens.dimension}</em></b><small>{lens.ability}</small><strong>{lensCounts[lens.key]}</strong></button>)}
          <footer>完成观测成为点，作出选择拉出线；三个点闭合成面，三个面支撑成体。</footer>
        </nav>

        <aside className="expedition-brief" aria-label="本轮探索目标">
          <header><small>第 {expeditionNumber} 次远征</small><span>{constellationWaiting ? "正在闭合" : `${expeditionStep} / 3`}</span></header>
          <h2>{constellationWaiting ? "最近3个问题正在闭合成一张面" : observationsRemaining === 3 ? "去获得一个新的提问起点" : `再走 ${observationsRemaining} 步，让解释面闭合`}</h2>
          <div className="expedition-progress" aria-label={`本轮已完成 ${expeditionStep} 次观测`}>{[0,1,2].map((step) => <i className={step < expeditionStep || constellationWaiting ? "filled" : ""} key={step} />)}</div>
          <button type="button" disabled={!recommended || engine !== "ready"} onClick={lockRecommended}><small>AI 发现：你的地图还缺这一块</small><b>{recommended?.name || "等待新的信号"}</b><span>{recommended?.hook || "写下一个最近无法解释的问题"}</span></button>
        </aside>

        <div className="chart-canvas">
          <div className="celestial-grid" aria-hidden="true" />
          {activeSector === "all" ? SECTORS.map((sector) => { const center = sectorCenter(sector); const caption = sectorCaption(sector); const total = atlas.nodes.filter((node) => node.id !== "origin" && sectorFor(node) === sector.key).length; const lit = discovered.filter((node) => sectorFor(node) === sector.key).length; return <button type="button" className="chart-sector" key={sector.key} style={{ left: `${center.x}%`, top: `${center.y}%`, "--sector-color": sector.color, "--caption-x": `${caption.x}%`, "--caption-y": `${caption.y}%` } as CSSProperties} onClick={() => chooseSector(sector.key)} aria-label={`进入${sector.label}星域，已探索${lit}个，共${total}颗星`}><span className="sector-caption"><b>{sector.label}</b><small>{lit}/{total}</small></span></button>; }) : <div className="sector-field" style={{ "--sector-color": activeSectorInfo?.color } as CSSProperties} aria-hidden="true"><span>{activeSectorInfo?.label}</span><small>{activeSectorInfo?.description}</small></div>}

          <svg className="chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {activeSector === "all" ? uniqueConstellations.map((face) => { const geometry = faceGeometry(face, positions); if (!geometry) return null; return <polygon className="knowledge-face" key={face.id} points={geometry.points} vectorEffect="non-scaling-stroke" />; }) : null}
            {atlas.edges.map((edge, index) => { const from = positions.get(edge.from); const to = positions.get(edge.to); if (!from || !to) return null; const key = atlasEdgeKey(edge); const adjacent = edge.from === flightNode?.id || edge.to === flightNode?.id; return <line key={`${key}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={`${edge.kind} ${edge.traversed ? "traversed" : "untraversed"} ${adjacent ? "adjacent" : ""} ${freshEdgeKey === key ? "structure-newborn" : ""} ${inspectedEdgeKey === key ? "structure-selected" : ""}`} vectorEffect="non-scaling-stroke" />; })}
            {traceFrom && traceTo && flightTrace ? <line key={flightTrace.serial} className="flight-trace" x1={traceFrom.x} y1={traceFrom.y} x2={traceTo.x} y2={traceTo.y} vectorEffect="non-scaling-stroke" /> : null}
          </svg>

          {structureLens === "line" ? atlas.edges.filter((edge) => edge.traversed).map((edge) => { const point = edgeMidpoint(edge, positions); if (!point) return null; const key = atlasEdgeKey(edge); const fromNode = nodeById.get(edge.from); const toNode = nodeById.get(edge.to); const selected = inspectedEdgeKey === key; return <button className={`edge-marker ${selected ? "selected" : ""} ${freshEdgeKey === key ? "newborn" : ""} ${point.x > 58 ? "label-left" : ""} ${point.y > 62 ? "label-up" : ""}`} type="button" key={key} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={(event) => { event.stopPropagation(); setInspectedEdgeKey(key); haptic(5); }} aria-label={`${fromNode?.name || "起点"}连接${toNode?.name || "下一点"}：${edge.reason || "由一次选择相连"}`}><i aria-hidden="true" /><span><small>{fromNode?.name || "起点"} → {toNode?.name || "下一点"}</small><b>{edge.reason || "由一次选择相连"}</b></span></button>; }) : null}

          {uniqueConstellations.map((constellation) => { const point = constellationPosition(constellation, positions); if (!point) return null; return <button className="constellation-mark" type="button" tabIndex={structureLens === "face" ? 0 : -1} key={constellation.id} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={(event) => { event.stopPropagation(); setConstellationReveal(constellation); }} aria-label={`解释面：${constellation.name}`}><i aria-hidden="true" /><span>{constellation.name}</span></button>; })}
          {activeSector === "all" ? uniqueVolumes.map((volume) => { const point = volumePosition(volume, positions); if (!point) return null; return <button className="knowledge-volume-mark" type="button" tabIndex={structureLens === "volume" ? 0 : -1} key={volume.id} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={(event) => { event.stopPropagation(); setVolumeReveal(volume); }} aria-label={`世界模型：${volume.name}`}><i /><i /><i /><b /><span>{volume.name}</span></button>; }) : null}

          {visibleNodes.map((node) => { const position = positions.get(node.id); if (!position) return null; const guided = recommended?.id === node.id; const inspected = inspectedId === node.id; const navigated = flightNode?.id === node.id; const recent = recentIds.has(node.id); const labelVisible = inspected || newNodeIds.includes(node.id); const info = sectorInfo(sectorFor(node)); const pointInteractive = structureLens === "all" || structureLens === "point"; return <button key={node.id} type="button" tabIndex={pointInteractive ? 0 : -1} className={`archive-star ${node.status} ${guided ? "guided" : ""} ${inspected ? "inspected" : ""} ${navigated ? "navigated" : ""} ${recent ? "recent" : ""} ${newNodeIds.includes(node.id) ? "newborn" : ""} ${labelVisible ? "show-label" : ""} ${position.x > 62 ? "label-left" : ""} ${position.y > 62 ? "label-up" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%`, "--star-color": info.color } as CSSProperties} onPointerEnter={() => pointInteractive && setInspectedId(node.id)} onPointerLeave={() => pointInteractive && setInspectedId(null)} onFocus={() => pointInteractive && setInspectedId(node.id)} onBlur={() => pointInteractive && setInspectedId(null)} onClick={(event) => { event.stopPropagation(); if (pointInteractive) focusNode(node); }} aria-current={navigated ? "true" : undefined} aria-label={`${node.name}，${node.field}，${node.status === "discovered" ? "已归档" : node.status === "origin" ? "起点" : "尚未观测"}`}><span className="star-halo" aria-hidden="true" /><i aria-hidden="true" /><span className="archive-star-label"><small>{node.field}</small><b>{node.name}</b></span></button>; })}

          {flightPosition ? <div key={flightFeedback.serial} className={`star-navigator ${flightFeedback.kind}`} style={{ left: `${flightPosition.x}%`, top: `${flightPosition.y}%` }} aria-hidden="true"><i className="navigator-orbit" /><i className="navigator-arrival" /><b /></div> : null}
        </div>

        <aside className="structure-index" aria-label="知识结构涌现进度">
          <header><small translate="no">DIMENSION ENGINE</small><b>知识正在升维</b></header>
          <div className="dimension-ladder" aria-label="点线面体数量">{STRUCTURE_LENSES.map((lens) => <button type="button" className={`${structureLens === lens.key ? "active" : ""} ${lensCounts[lens.key] ? "emerged" : ""}`} aria-pressed={structureLens === lens.key} onClick={() => chooseStructureLens(lens.key)} key={lens.key}><i>{lens.label}</i><b>{lensCounts[lens.key]}</b><small>{lens.dimension}</small></button>)}</div>
          <div className="formation-progress" aria-label="升维进度">
            <section><header><small>点 → 面</small><b>{faceProgress}/3</b></header><div>{[0,1,2].map((index) => <i className={index < faceProgress ? "filled" : ""} key={index} />)}</div></section>
            <section><header><small>面 → 体</small><b>{volumeProgress}/3</b></header><div className="face-slots">{[0,1,2].map((index) => <i className={index < volumeProgress ? "filled" : ""} key={index} />)}</div></section>
          </div>
          <p className="next-emergence"><b>{constellationWaiting ? "下一次选择将闭合解释面" : uniqueConstellations.length ? `还差 ${facesUntilVolume} 张面形成世界模型` : `再完成 ${observationsRemaining || 1} 次观测形成第一张面`}</b><span>点不是收藏，线不是跳转；它们最终要长成可以迁移的理解。</span></p>
          {(uniqueVolumes.length || uniqueConstellations.length) ? <div className="structure-list">{uniqueVolumes.map((volume) => <button className="volume-row" type="button" key={volume.id} onClick={() => setVolumeReveal(volume)}><i aria-hidden="true" /><span><b>{volume.name}</b><small>可迁移的世界模型</small></span></button>)}{uniqueConstellations.slice().reverse().map((face) => <button className="face-row" type="button" key={face.id} onClick={() => setConstellationReveal(face)}><i aria-hidden="true" /><span><b>{face.name}</b><small>{face.motif}</small></span></button>)}</div> : null}
        </aside>

        <div className="map-legend" aria-live="polite"><strong>{activeLens ? `${activeLens.label} · ${activeLens.ability}` : "全结构 · 从观测到世界模型"}</strong><span><i />已走过</span><span><i />可探索</span><span><i />跨领域线</span><span><i />解释面</span></div>

        <aside className="flight-dock" aria-label="星图航行控制">
          <header><small>{activeSector === "all" ? "远景导航" : `${activeSectorInfo?.label}星域 · 局部航行`}</small><span className="desktop-hint">WASD / 方向键</span><button className="question-toggle" type="button" onClick={() => setQuestionOpen((open) => !open)}>{questionOpen ? "收起问题" : "投下问题"}</button></header>
          <div className="flight-target" aria-live="polite"><i style={{ "--star-color": dockNode ? sectorInfo(sectorFor(dockNode)).color : undefined } as CSSProperties} aria-hidden="true" /><p><b>{dockNode?.name || "等待星图"}</b><span>{dockNode?.field || ""}</span></p></div>
          <p className="route-reason">{routeReason}</p>
          <footer>{activeSector !== "all" ? <button className="back-action" type="button" onClick={() => chooseSector("all")}>返回全图</button> : <span className="swipe-hint">滑动或用方向键选择</span>}<button className="primary-flight" type="button" disabled={!flightNode} onClick={activateFlightNode}>{activeSector === "all" && flightNode?.id !== "origin" ? "进入星域" : flightNode?.status === "frontier" ? "开始观测" : flightNode?.status === "discovered" ? "打开完整档案" : "回到起点"}<kbd>Enter</kbd></button></footer>
        </aside>

        <form className={`question-entry ${questionOpen ? "open" : ""}`} onSubmit={(event) => { event.preventDefault(); chartThought(); }}><label htmlFor="new-question">把一个真实困惑变成知识入口</label><input ref={questionRef} id="new-question" name="new-question" autoComplete="off" placeholder="例如：为什么熟悉的路回程总显得更短…" maxLength={100} disabled={charting} /><button type="submit" disabled={charting}>{charting ? "正在寻找坐标…" : "收入夜空"}</button></form>

        {charting ? <div className="mapping-status" role="status" aria-live="polite"><div className="mapping-orbit" aria-hidden="true"><i /><i /><i /></div><small>正在为你的问题制图</small><p>{WAIT_COPY.charting[waitBeat]}</p><span>{waitBeat + 1} / 3</span></div> : null}
      </section>

      {!storageReady ? <div className="archive-opening" role="status"><i aria-hidden="true" /><span>正在打开你的星图…</span></div> : null}

      {introOpen ? <div className="overlay-scrim"><section ref={introRef} className="archive-intro" role="dialog" aria-modal="true" aria-labelledby="intro-heading" onKeyDown={trapDialog}>
        <button type="button" className="quiet-close" onClick={() => setIntroOpen(false)} aria-label="关闭序言">×</button>
        <p className="intro-kicker">百门计划 · AI 时代的通识实验</p>
        <h2 id="intro-heading">AI 能回答几乎一切。<br /><em>但它不能替你拥有问题。</em></h2>
        <p className="intro-lede">你被一个专业录取，只是从一扇门出发。一个从未接触过的领域，对你不只是“没有答案”——它甚至不会产生问题。星火档案要做的，是把 100 个陌生世界变成 100 个可以继续追问的起点。</p>
        <section className="intro-example" aria-labelledby="intro-example-title">
          <header><small>比如，你问</small><b id="intro-example-title">“为什么刷短视频，总是停不下来？”</b></header>
          <div>
            <article><small>神经科学</small><p>大脑怎样学会期待下一次奖励？</p></article>
            <article><small>行为经济学</small><p>眼前的快乐为什么会压过长期目标？</p></article>
            <article><small>产品设计</small><p>无限滚动怎样拿走了“停下”的时刻？</p></article>
          </div>
          <footer>你不必先学完三门课。只要知道这些门存在，就能带着更好的问题调用 AI。</footer>
        </section>
        <div className="intro-principle"><span><b>100</b><small>种问世界的方法</small></span><p>不是囤积 100 篇答案。AI 会为每个问题临时写出一个可操作的代码世界；你负责观察、判断和选择，让知识从点长成可以迁移的世界模型。</p></div>
        <ol aria-label="知识从点生长为世界模型"><li><b>点</b><span>一次观测，获得一个能继续提问的入口</span></li><li><b>线</b><span>一次选择，说清两个世界为何相连</span></li><li><b>面</b><span>三个问题闭合，得到新的共同解释</span></li><li><b>体</b><span>三张解释面支撑出可迁移的思考工具</span></li></ol>
        <div className="intro-outcome"><small>玩完之后，你得到的不是“看过很多”</small><b>而是知道世界有哪些入口、自己对什么真正心动、下一步该往哪里走。</b></div>
        <div className="intro-footer"><button type="button" className="intro-start" onClick={() => { setIntroOpen(false); if (recommended) chooseSector(sectorFor(recommended), recommended.id); }}>去获得第 1 个提问起点</button><div className="intro-controls"><span><kbd>WASD</kbd> 航行</span><span><kbd>Enter</kbd> 观测</span><span>手机滑动选星</span></div></div>
      </section></div> : null}

      {selectedNode ? <section ref={observationRef} className="observation-stage" role="dialog" aria-modal="true" aria-label={`${selectedNode.name}观测页`} onKeyDown={trapDialog}>
        <div className="observation-sheet">
          <header><p><span translate="no">OBSERVATION {String(selectedNode.knowledge?.discoveredAt || atlas.expeditions + (stage === "reveal" ? 0 : 1)).padStart(3, "0")}</span><i /> {selectedNode.field}</p><button type="button" className="quiet-close" onClick={closeObservation} aria-label="关闭观测页">×</button></header>

          {stage === "summary" && selectedNode.knowledge ? <KnowledgeArticle record={selectedNode.knowledge} onRoute={chooseRoute} onReplay={() => launchEncounter(selectedNode)} /> : null}
          {stage === "summary" && !selectedNode.knowledge ? <div className="sheet-summary"><small>{selectedNode.status === "origin" ? "天球中心" : "旧档案 · 只留下了一条结论"}</small><h2>{selectedNode.name}</h2><p>{selectedNode.spark?.insight || selectedNode.hook}</p>{selectedNode.status !== "origin" ? <><span className="legacy-note">再次观测后，这里会保存完整现场、白话解释、术语与事实边界。</span><button className="ink-action" type="button" onClick={() => launchEncounter(selectedNode)} disabled={engine !== "ready"}>补全这页知识档案</button></> : <button className="ink-action" type="button" onClick={closeObservation}>返回天球</button>}</div> : null}

          {stage === "loading" ? <div className="sheet-loading"><div className="orrery" aria-hidden="true"><i /><i /><b /></div><small>AI 正在生成一次只属于这颗星的观测</small><p>{WAIT_COPY.loading[waitBeat]}</p><ol>{WAIT_COPY.loading.map((item, index) => <li className={index <= waitBeat ? "active" : ""} key={item}>{item}</li>)}</ol></div> : null}

          {stage === "observe" && encounter ? <div className="sheet-observe">
            <p className="observation-line">{encounter.signal}</p>
            <h2>{encounter.question}</h2>
            <p className="observation-instruction">先在这个由 AI 临时写出的世界里观察、拖动或比较。这里不考记忆，只看你会押哪一种关系。</p>
            {encounter.artifact ? <GeneratedWorld artifact={encounter.artifact} encounter={encounter} onCommit={resolveObservation} /> : <ObservationInstrument encounter={encounter} scaleValue={scaleValue} arranged={arranged} selectedChoice={hypothesisIndex} />}
            {encounter.interaction === "choice" ? <div className="choice-console"><div className="observation-choices" role="group" aria-label="选择一条变化假设">{encounter.choices.map((choice, index) => <button className={hypothesisIndex === index ? "selected" : ""} aria-pressed={hypothesisIndex === index} key={choice} type="button" onClick={() => { setHypothesisIndex(index); haptic(6); }}><i className={`hypothesis-swatch swatch-${index + 1}`} aria-hidden="true" /><span><small>假设 0{index + 1}</small><b>{choice}</b></span></button>)}</div><button className="hypothesis-lock" type="button" disabled={hypothesisIndex === null} onClick={() => { if (hypothesisIndex !== null) resolveObservation({ answer: encounter.choices[hypothesisIndex] }); }}>{hypothesisIndex === null ? "先检视并选择一条轨迹" : `锁定 0${hypothesisIndex + 1} · ${encounter.choices[hypothesisIndex]}`}</button></div> : null}
            {encounter.interaction === "scale" && encounter.scale ? <div className="scale-observation"><input type="range" min="0" max="100" value={scaleValue} onChange={(event) => setScaleValue(Number(event.target.value))} aria-label={`在${encounter.scale.left}与${encounter.scale.right}之间估计`} /><div><span>{encounter.scale.left}</span><i style={{ left: `${scaleValue}%` }} /><b>{scaleValue}</b><span>{encounter.scale.right}</span></div><button type="button" onClick={() => resolveObservation({ value: scaleValue })}>把判断定在这里</button></div> : null}
            {encounter.interaction === "arrange" ? <div className="arrange-observation"><div className="arranged-slots">{[0,1,2].map((index) => arranged[index] ? <button type="button" key={index} onClick={() => pickArrangeItem(arranged[index])} aria-label={`移除第${index + 1}位：${arranged[index]}`}><small>0{index + 1}</small><span>{arranged[index]}</span></button> : <span key={index}><small>0{index + 1}</small><i>等待放入</i></span>)}</div><div className="arrange-items">{encounter.items.map((item) => <button key={item} type="button" className={arranged.includes(item) ? "used" : ""} disabled={arranged.includes(item)} onClick={() => pickArrangeItem(item)}>{item}</button>)}</div><button className="ink-action" type="button" disabled={arranged.length !== 3} onClick={() => resolveObservation({ order: arranged })}>按这个顺序归档</button></div> : null}
          </div> : null}

          {stage === "resolving" ? <div className="sheet-loading resolving"><div className="orrery" aria-hidden="true"><i /><i /><b /></div><small>你的判断正在变成一页知识</small><p>{WAIT_COPY.resolving[waitBeat]}</p><ol>{WAIT_COPY.resolving.map((item, index) => <li className={index <= waitBeat ? "active" : ""} key={item}>{item}</li>)}</ol></div> : null}
          {stage === "reveal" && liveKnowledge ? <KnowledgeArticle record={liveKnowledge} onRoute={chooseRoute} onReplay={() => launchEncounter(selectedNode)} live /> : null}
        </div>
      </section> : null}

      {archiveOpen ? <section ref={archiveRef} className="archive-drawer" role="dialog" aria-modal="true" aria-labelledby="archive-heading" onKeyDown={trapDialog}><header><div><small>百门计划 · 已获得 {fieldCount} / 100 个提问起点</small><h2 id="archive-heading">你的提问地图</h2><p>{latestProfile}</p></div><button className="quiet-close" type="button" onClick={() => setArchiveOpen(false)} aria-label="关闭档案">×</button></header><section className="archive-sector-progress" aria-label="各星域探索进度">{SECTORS.map((sector) => { const total = atlas.nodes.filter((node) => node.id !== "origin" && sectorFor(node) === sector.key).length; const lit = discovered.filter((node) => sectorFor(node) === sector.key).length; return <button type="button" key={sector.key} onClick={() => { setArchiveOpen(false); chooseSector(sector.key); }}><span>{sector.label}<small>{lit}/{total}</small></span><i><b style={{ width: `${total ? lit / total * 100 : 0}%`, background: sector.color }} /></i></button>; })}</section><div className="constellation-list">{uniqueVolumes.map((item, index) => <article className="volume-archive-card" key={item.id}><small translate="no">WORLD MODEL {String(index + 1).padStart(2,"0")}</small><h3>{item.name}</h3><p>{item.line}</p><span>{item.law}</span><button type="button" onClick={() => setVolumeReveal(item)}>打开这个世界模型</button></article>)}{uniqueConstellations.length ? uniqueConstellations.map((item, index) => <article key={item.id}><small translate="no">KNOWLEDGE FACE {String(index + 1).padStart(2,"0")}</small><h3>{item.name}</h3><p>{item.line}</p><span>{item.motif}</span><button type="button" onClick={() => setConstellationReveal(item)}>展开这张解释面</button></article>) : <p className="empty-archive">再完成 {observationsRemaining || 1} 次观测，三个问题会闭合成第一张解释面。</p>}</div><div className="specimen-index"><small>已经带走的提问起点</small>{discovered.map((node, index) => <button type="button" key={node.id} onClick={() => { setArchiveOpen(false); selectNode(node); }}><b>{String(index + 1).padStart(2,"0")}</b><span>{node.name}<small>{node.spark?.insight || node.hook}</small></span><i>{node.field}</i></button>)}</div><button className="reset-link" type="button" onClick={() => setResetOpen(true)}>重新装订这本档案</button></section> : null}

      {constellationReveal ? <div className="overlay-scrim constellation-scrim"><section ref={constellationRef} className="constellation-reveal" role="dialog" aria-modal="true" aria-labelledby="constellation-title" onKeyDown={trapDialog}><div className="constellation-glyph" aria-hidden="true"><i /><i /><i /><b /><b /><b /></div><small>三次观测，闭合成一张新的解释面</small><h2 id="constellation-title">{constellationReveal.name}</h2><p>{constellationReveal.line}</p><div className="motif-stamp"><span>它们共同解释的问题</span><b>{constellationReveal.motif}</b></div><div className="constellation-actions"><button type="button" onClick={() => copyConstellation(constellationReveal)}>复制这张解释面</button><button type="button" onClick={() => setConstellationReveal(null)}>留在星图</button></div></section></div> : null}

      {volumeReveal ? <div className="overlay-scrim volume-scrim"><section ref={volumeRef} className="volume-reveal" role="dialog" aria-modal="true" aria-labelledby="volume-title" onKeyDown={trapDialog}><div className="volume-glyph" aria-hidden="true"><i /><i /><i /><i /><b /><b /><b /><b /></div><small>三张解释面互相支撑，世界模型涌现</small><h2 id="volume-title">{volumeReveal.name}</h2><p>{volumeReveal.line}</p><div className="volume-law"><span>现在你可以带走的思考工具</span><b>{volumeReveal.law}</b></div><div className="constellation-actions"><button type="button" onClick={() => copyVolume(volumeReveal)}>复制这个世界模型</button><button type="button" onClick={() => setVolumeReveal(null)}>放回知识宇宙</button></div></section></div> : null}

      {resetOpen ? <div className="overlay-scrim"><section ref={resetRef} className="reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" onKeyDown={trapDialog}><h2 id="reset-title">重新装订整本档案？</h2><p>所有观测、航线、解释面、世界模型和未走完的路都会消失。这个动作无法撤销。</p><div><button type="button" onClick={() => setResetOpen(false)}>保留我的星图</button><button type="button" onClick={resetAtlas}>确认重新开始</button></div></section></div> : null}
      {engine === "offline" ? <div className="offline-mark" role="status">AI世界引擎离线 · 检查 DashScope Key</div> : null}
      {toast ? <div className="archive-toast" role="status" aria-live="polite">{toast}</div> : null}
    </main>
  );
}
