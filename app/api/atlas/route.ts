import { NextResponse } from "next/server";

type SectorKey = "life" | "mind" | "society" | "matter" | "creation" | "systems";
type Verdict = "hit" | "near" | "twist";
type Interaction = "world" | "choice" | "scale" | "arrange";
type ChoiceVisual = { value: number; uncertainty: number; annotation: string };
type VisualContext = { measure: string; unit: string; baseline_label: string; changed_label: string; baseline_value: number };
type WorldOutcome = { id: string; label: string; verdict: Verdict };
type GeneratedArtifact = { medium: string; html: string; title: string; hint: string; verb: string; duration_seconds: number; accent: string; focus: string; can_commit: boolean };

type AtlasNode = { id?: string; name: string; field: string; hook: string; sector?: SectorKey };
type AtlasRequest = {
  mode?: "encounter" | "resolve" | "chart" | "constellation" | "volume";
  node?: AtlasNode;
  map?: { discovered?: string[]; frontier?: string[]; fields?: string[] };
  answer?: string;
  outcome?: string;
  value?: number;
  order?: string[];
  thought?: string;
  token?: string;
  recent_nodes?: Array<{ name: string; field: string; spark?: string }>;
  profile_signals?: string[];
  existing_names?: string[];
  faces?: Array<{ name: string; line: string; motif: string }>;
  flight?: { signal?: number; samples?: number; probes?: number };
};

type EncounterState = {
  node: AtlasNode;
  signal: string;
  question: string;
  interaction: Interaction;
  outcomes: WorldOutcome[];
  choices: string[];
  choice_verdicts: Verdict[];
  choice_visuals: ChoiceVisual[];
  visual_context: VisualContext | null;
  scale: { left: string; right: string; target: number; tolerance: number } | null;
  items: string[];
  target_order: string[];
  visual: "pulse" | "orbit" | "split" | "network" | "scale";
  concept: string;
  explanation: string;
  source_anchor: string;
  caveat: string;
  map_fields: string[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sectors: SectorKey[] = ["life", "mind", "society", "matter", "creation", "systems"];

type ModelPurpose = "scene" | "knowledge";
type ModelConfig = { apiKey: string; endpoint: string; model: string; jsonMode: boolean; dashScope: boolean; maxTokens: number; timeoutMs: number };

function modelConfig(purpose: ModelPurpose): ModelConfig | null {
  const apiKey = process.env.AI_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return null;
  const base = (process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").replace(/\/+$/, "");
  const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const model = (purpose === "scene" ? process.env.AI_SCENE_MODEL : process.env.AI_KNOWLEDGE_MODEL) || process.env.AI_MODEL || process.env.DASHSCOPE_MODEL || "qwen3.7-plus";
  return {
    apiKey,
    endpoint,
    model,
    jsonMode: process.env.AI_DISABLE_JSON_MODE !== "1",
    dashScope: endpoint.includes("dashscope.aliyuncs.com"),
    maxTokens: Math.max(4096, Math.min(32000, Number(process.env.AI_MAX_OUTPUT_TOKENS) || 12000)),
    timeoutMs: Math.max(15000, Math.min(120000, Number(process.env.AI_TIMEOUT_MS) || 60000)),
  };
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function seal(value: EncounterState, secret: string) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function unseal(token: string, secret: string): Promise<EncounterState | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(signature), encoder.encode(payload));
  if (!valid) return null;
  try { return JSON.parse(decoder.decode(fromBase64Url(payload))) as EncounterState; } catch { return null; }
}

async function callModel(config: ModelConfig, system: string, user: string, temperature = 0.72) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        ...(config.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(config.dashScope ? { enable_thinking: false } : {}),
        max_tokens: config.maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Model provider ${response.status}`);
    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Missing output");
    return JSON.parse(content) as Record<string, unknown>;
  } finally { clearTimeout(timeout); }
}

function normalizeArtifact(result: Record<string, unknown>): GeneratedArtifact | null {
  const raw = String(result.artifact_html || "").trim();
  const maxSceneChars = Math.max(26000, Math.min(120000, Number(process.env.AI_MAX_SCENE_CHARS) || 60000));
  if (raw.length < 120 || raw.length > maxSceneChars || !/<(?:svg|canvas|div|section|main)\b/i.test(raw)) return null;
  const html = raw
    .replace(/```(?:html|svg|javascript|js|css)?/gi, "")
    .replace(/```/g, "")
    .replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<(?:iframe|object|embed|base|link|meta|form)\b[^>]*>/gi, "")
    .replace(/<\/(?:iframe|object|embed|form)>/gi, "")
    .replace(/\b(?:href|src)\s*=\s*["'](?:https?:|\/\/)[^"']*["']/gi, "")
    .trim();
  if (html.length < 120) return null;
  const proposed = String(result.artifact_medium || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18);
  const medium = proposed || (/webgl|getContext\s*\(\s*["']webgl/i.test(html) ? "webgl" : /<canvas\b/i.test(html) ? "canvas" : /<svg\b/i.test(html) ? "svg" : "html");
  const rawAccent = String(result.artifact_accent || "");
  return {
    medium,
    html,
    title: String(result.artifact_title || "为这次问题生成的可操作世界").slice(0, 36),
    hint: String(result.artifact_hint || "先操作画面，再留下你的判断").slice(0, 80),
    verb: String(result.artifact_verb || "动手试试").slice(0, 10),
    duration_seconds: Math.max(8, Math.min(90, Number(result.artifact_duration_seconds) || 30)),
    accent: /^#[0-9a-f]{6}$/i.test(rawAccent) ? rawAccent : "#7fa6a0",
    focus: String(result.artifact_focus || "").slice(0, 10),
    can_commit: /(?:window\.)?SparkRuntime\s*(?:\?\.|\.)\s*commit\s*\(/.test(html) || html.includes("spark-atlas-artifact"),
  };
}

function sceneIsPlayable(artifact: GeneratedArtifact | null) {
  if (!artifact) return false;
  const interactive = /addEventListener\s*\(|\bon(?:click|pointer|mouse|touch|input|change|key)/i.test(artifact.html);
  const kinetic = /requestAnimationFrame\s*\(|@keyframes\b|\.animate\s*\(|<animate\b|transition\s*:/i.test(artifact.html);
  const visibleText = artifact.html.replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
  return interactive && kinetic && visibleText.length <= 650;
}

function focusMatchesNode(result: Record<string, unknown>, node: AtlasNode) {
  const focus = String(result.artifact_focus || "").trim();
  if (focus.length < 2 || focus.length > 10 || /^(两个|两列|相近|忽大|忽小|忽大忽小|越大|越省|翻倍|怎样|为何|为什么|制造|听见|估量|改变|调节|控制|选择|移动|拖动|观察|变化|关系|结果|影响|世界|现象|过程|系统)$/.test(focus)) return false;
  const source = `${node.name} ${node.field} ${node.hook}`;
  return source.includes(focus);
}

function requiredFocus(node: AtlasNode) {
  return node.field.replace(/[\s，。！？、·/]+/g, "").slice(0, 10) || node.name.replace(/[\s，。！？、·/]+/g, "").slice(0, 10);
}

function sceneMatchesNode(result: Record<string, unknown>, node: AtlasNode, artifact: GeneratedArtifact | null) {
  if (!focusMatchesNode(result, node)) return false;
  const focus = String(result.artifact_focus || "").trim();
  const scene = `${artifact?.title || ""} ${artifact?.html || ""}`;
  return scene.includes(focus);
}

async function createBlueprint(config: ModelConfig, node: AtlasNode, mapFields: string[], focus: string) {
  return callModel(
    config,
    `你是知识游戏的事实设计师。先只设计一次可靠、有动作的观测蓝图，不写任何前端代码。
- 唯一主题是档案hook承诺的现象，结束后必须能直接回答它；不得换成同学科的相邻知识。
- 面向第一次接触该领域的高中毕业生。signal只给一个可想象现场；question要求玩家改变一个变量或完成一个动作，不考术语。
- interaction固定为world。设计三个由玩家真实操作导致的结果，id固定o1、o2、o3，verdict恰好使用hit、near、twist各一次。
  - artifact_focus固定为“${focus}”，必须逐字复制。
- 事实必须可靠；concept与explanation说明正确关系，source_anchor给出可核对的规律、实验或效应，caveat说明边界。
输出JSON：{"signal":"22至42字","question":"10至24字的动作问题","interaction":"world","world_outcomes":[{"id":"o1","label":"5至16字的具体行动结果","verdict":"hit"}],"artifact_focus":"具体领域名词","concept":"真实概念","explanation":"35至65字","source_anchor":"事实锚点","caveat":"12至30字"}`,
    `唯一主题档案：${JSON.stringify(node)}\n已经走过的领域：${JSON.stringify(mapFields)}\n锁定知识锚点：${focus}`,
    0.48,
  );
}

function gradeEncounter(state: EncounterState, body: AtlasRequest): { verdict: Verdict; answer: string } {
  if (state.interaction === "world") {
    const outcome = state.outcomes.find((item) => item.id === String(body.outcome || ""));
    return outcome ? { verdict: outcome.verdict, answer: outcome.label } : { verdict: "near", answer: "完成了一次观测" };
  }
  if (state.interaction === "scale" && state.scale) {
    const value = Math.max(0, Math.min(100, Number(body.value ?? 50)));
    const distance = Math.abs(value - state.scale.target);
    return { verdict: distance <= state.scale.tolerance ? "hit" : distance <= state.scale.tolerance * 2.4 ? "near" : "twist", answer: `${value}/100，靠近“${value < 50 ? state.scale.left : state.scale.right}”` };
  }
  if (state.interaction === "arrange") {
    const order = Array.isArray(body.order) ? body.order.slice(0, 3) : [];
    const exact = order.join("|") === state.target_order.join("|");
    const overlap = order.filter((item, index) => item === state.target_order[index]).length;
    return { verdict: exact ? "hit" : overlap >= 1 ? "near" : "twist", answer: order.join(" → ") };
  }
  const answer = String(body.answer || "").slice(0, 80);
  const index = state.choices.findIndex((choice) => choice === answer);
  return { verdict: index >= 0 ? state.choice_verdicts[index] || "near" : "near", answer };
}

export async function GET() {
  return NextResponse.json({ connected: Boolean(modelConfig("scene")) });
}

export async function POST(request: Request) {
  const sceneModel = modelConfig("scene");
  const knowledgeModel = modelConfig("knowledge");
  if (!sceneModel || !knowledgeModel) return NextResponse.json({ error: "制图台尚未连接" }, { status: 503 });
  let body: AtlasRequest;
  try { body = (await request.json()) as AtlasRequest; } catch { return NextResponse.json({ error: "这页档案无法辨认" }, { status: 400 }); }

  try {
    if (body.mode === "encounter") {
      if (!body.node?.name || !body.node.field || !body.node.hook) return NextResponse.json({ error: "观测坐标不完整" }, { status: 400 });
      const mapFields = body.map?.fields?.slice(0, 24) || [];
      const lockedFocus = requiredFocus(body.node);
      const blueprintPromise = createBlueprint(knowledgeModel, body.node, mapFields, lockedFocus);
      const generatedPromise = callModel(
        sceneModel,
        `你是《星火档案》的无名策展人。这里不是课堂、问答产品或科幻控制台，而是一座安静的夜间天文档案馆。你要从真实知识中挑出一个值得亲手触碰的瞬间。

为指定档案生成一次20至40秒的“观测”。优先使用world：它是一段真正能玩的微型代码世界，玩法完全由知识本身决定。choice、scale、arrange只作为生成代码确实无法表达时的兼容方案：
- world：玩家可以追逐、搭建、拖拽、控制、寻找、调参、演奏、模拟、穿越或做任何更适合本题的动作。world_outcomes定义三个可能结束状态，只用于安全判定，不限制中间玩法。
- choice：适合比较三种具体结果。
- scale：适合估计连续变化、比例、强弱或位置。left/right必须是两个有意义的极端，target为0至100的答案。
- arrange：适合排列三个事件、尺度或因果阶段。items是展示顺序打乱的三个短语，target_order是真实顺序。

文字与事实纪律：
- 档案中的hook是本次观测的核心承诺；signal、question与答案必须直接解释或检验这个现象，禁止只在同一学科内另找一个无关知识点。
- 如果name带有隐喻，以hook中的具体问题为准；玩家结束后应能回答hook，而不是只学到一个相邻事实。
- signal是可观察的具体情景，不使用“你知道吗”，不写背景讲义。
- question邀请一个动作，不能要求背术语。
- choices必须让第一次接触该领域的人直接看懂。用可见结果说话，例如“两边次数越试越接近”，不要写“概率波函数、次线性标度、涌现、熵增”这类需要先上课的词。
- 结束时，玩家应获得一个原先问不出来的后续问题，而不只是记住一条结论。
- choice必须生成一张可以读懂的“假设比较图”，而不是装饰插画。visual_context定义同一张图的测量对象、单位与变化前后；choice_visuals把三个答案映射到同一纵轴。
- visual_context中的measure、baseline_label、changed_label也必须使用普通人一眼能懂的可见量，例如“两边次数有多接近”，不能使用“吻合度、效应强度、综合指数”这类没有直观含义的自造指标。
- baseline_value与三个value都使用0至100的共享绘图刻度。请挑选baseline_value，使三种假设的相对高低都能看清。它们不是伪造的百分比；真实倍数、百分比或范围必须写进annotation。
- uncertainty只表示选项本身声称的波动或不确定范围；没有范围含义时填0。三个value与annotation必须忠实对应三个choices，不能随机装饰。
- 除了用于判定的字段，还要为本题编写一个全新的“代码世界”。它不是装饰图，也不受固定图表类型限制。可以自由组合HTML、CSS、内联SVG、Canvas 2D、WebGL/WebGL2、CSS 3D、Web Animations API、Web Audio与浏览器原生JavaScript；也可以像code-to-video一样实时绘制镜头、转场、字幕、时间演化和可操作动画。
- artifact_html是可直接插入body的自包含代码片段。它必须在宽度900、高度500左右的区域内自适应并占据主要画面；允许拖动、点击、悬停、滑杆、键盘、触摸、多阶段任务、物理近似、实时动画和用户手势后合成的轻量声音。
- 不要套用“折线图/三个卡片/圆点连线”的固定模板，也不要为了炫技堆粒子。先问：这个知识如果真的能动起来，玩家最该亲手改变哪个变量、看到哪个因果？
- 代码内只用浏览器原生能力；禁止外链、fetch、WebSocket、localStorage、eval、表单、iframe、外部音视频、第三方库和无限循环。可以用Canvas/WebGL逐帧生成动画，也可以将Canvas流送入无外部源的video元素。requestAnimationFrame必须轻量，并在页面不可见时停止重计算。
- artifact_html不包含html、head、body标签，不使用Markdown代码围栏。中文标注不得小于14px，关键对象必须有可见名称；不能提前泄露正确答案，只展示可供判断的证据或三种假设。
- 运行时会预先提供window.SparkRuntime。代码可在加载后调用SparkRuntime.ready()；过程中调用SparkRuntime.progress(0至100)与SparkRuntime.pulse()提供进度和触觉反馈；完成时调用SparkRuntime.commit(payload)。world发送{outcome:'o1/o2/o3'}；choice发送{answer:'必须与choices某一项完全相同'}；scale发送{value:0至100}；arrange发送{order:[来自items的三项]}。artifact_html必须包含精确字符串SparkRuntime.commit；提交前必须让玩家主动操作，不能加载后自动发送。
- 游戏必须在10秒内让第一次接触该领域的人明白“我能动什么”，在40秒内产生一个结果。首屏只保留一个极短动作提示；不要把说明书、知识解释或答案写进场景。
- 对world生成world_outcomes三个状态，id固定为o1、o2、o3，label是玩家完成后能复述的具体行动结果，verdict分别恰好使用hit、near、twist一次。代码必须根据玩家真正做出的结果提交对应id，不能用随机数代替。
- 从档案name或hook原样复制一个2至10字的具体名词作为artifact_focus。signal、question以及代码世界可见内容都必须出现这个词。不能用“变化、关系、结果、影响、世界、现象、过程、系统”充当锚点。这是服务端硬校验；换题、只做同学科的相邻主题或遗漏锚点都会整次作废。
- 必须来自可重复实验、稳定规律或明确机制，并保留事实锚点与边界。
- 不把相关写成因果，不把假说写成定论；有争议就换一个更可靠的现象。
- 禁用模型腔与宣传腔：显著、赋能、重塑、深层、揭示、背后逻辑、系统性、颠覆、神奇、竟然。
- 句子具体、克制、有画面。不要让每个标题都成为“为什么”。

输出JSON：
{
  "signal":"22至42字，只有一个画面",
  "question":"10至24字",
  "interaction":"优先world；也可choice、scale或arrange",
  "world_outcomes":[{"id":"o1","label":"5至16字的具体结果","verdict":"hit、near、twist各一次"}],
  "choices":["仅choice填写3项，每项5至16字"],
  "choice_verdicts":["仅choice填写，与选项对应，hit、near、twist各一次"],
  "visual_context":{"measure":"仅choice填写，纵轴正在测量什么，2至10字","unit":"真实单位；没有可靠绝对数值就写相对尺度","baseline_label":"变化前的具体条件，2至10字","changed_label":"变化后的具体条件，2至10字","baseline_value":"0至100整数"},
  "choice_visuals":[{"value":"与该选项对应的0至100绘图位置","uncertainty":"0至25整数","annotation":"该选项声称的真实变化，3至12字"}],
  "scale":{"left":"2至6字","right":"2至6字","target":0至100整数,"tolerance":8至18整数},
  "items":["仅arrange填写3项，每项3至10字"],
  "target_order":["仅arrange填写真实顺序"],
  "visual":"pulse、orbit、split、network、scale五选一",
  "artifact_medium":"自由描述主要呈现技术，如svg、canvas、webgl、css-3d、motion或hybrid",
  "artifact_title":"6至18字，说明这个可操作世界是什么",
  "artifact_hint":"6至18字，只用一个动词告诉玩家第一步",
  "artifact_verb":"2至6字的核心动作，如拖动、捕捉、保持平衡",
  "artifact_duration_seconds":"预计游玩秒数，8至90",
  "artifact_accent":"与知识世界匹配的六位十六进制颜色",
  "artifact_focus":"从档案name或hook原样复制的具体名词",
  "artifact_html":"自包含的开放式前端代码片段，必须JSON转义",
  "concept":"真实概念",
  "explanation":"35至65字，准确解释结果",
  "source_anchor":"实验、效应或规律名称",
  "caveat":"12至30字，说明不能推出什么"
}`,
        `唯一允许的主题档案：${JSON.stringify(body.node)}\n锁定知识锚点：${lockedFocus}。artifact_focus必须逐字复制为这个词，代码世界可见内容也必须出现它。\n已经走过的领域：${JSON.stringify(mapFields)}\n硬约束：不得换题。代码世界必须让玩家亲手检验hook承诺的同一个现象。`,
        0.76,
      );
      let [blueprint, generated] = await Promise.all([blueprintPromise, generatedPromise]);
      blueprint = { ...blueprint, artifact_focus: lockedFocus };
      generated = { ...generated, artifact_focus: lockedFocus };
      if (!String(generated.artifact_html || "").includes(lockedFocus)) {
        const safeFocus = lockedFocus.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] || character));
        generated.artifact_html = `<div style="position:absolute;z-index:999;left:14px;top:12px;padding:5px 8px;border:1px solid rgba(255,255,255,.18);background:rgba(3,6,5,.72);color:#e8dfcc;font:600 14px/1.2 sans-serif;letter-spacing:.08em;pointer-events:none">${safeFocus}</div>${String(generated.artifact_html || "")}`;
      }
      if (!blueprint.signal || !blueprint.question || !blueprint.concept || !blueprint.explanation || !blueprint.source_anchor || !blueprint.caveat || !Array.isArray(blueprint.world_outcomes) || !focusMatchesNode(blueprint, body.node)) throw new Error("Blueprint incomplete");
      const factualCore = { concept: blueprint.concept, explanation: blueprint.explanation, source_anchor: blueprint.source_anchor, caveat: blueprint.caveat, artifact_focus: lockedFocus };
      const draft = { ...generated, ...factualCore, interaction: "world" };
      const draftArtifact = normalizeArtifact(draft);
      if (!draftArtifact?.can_commit || !sceneMatchesNode(draft, body.node, draftArtifact)) {
        const repaired = await callModel(
          sceneModel,
          `你是浏览器原生游戏代码的修复者。只修复一个已经设计好的知识场景，不改题、不改观测蓝图。
- 输出完整、自包含的artifact_html以及artifact_medium、artifact_title、artifact_hint、artifact_verb、artifact_duration_seconds、artifact_accent。
- 代码必须把artifact_focus直接显示在画面中，并真正表现蓝图描述的现象。
- 保留或增强原有交互与动画。玩家完成动作后，必须根据真实结果调用SparkRuntime.commit({outcome:'o1'})、o2或o3；不得自动提交或随机提交。
- 可以使用HTML、CSS、SVG、Canvas 2D、WebGL、Web Audio、CSS 3D、Web Animations和逐帧代码动画，不用外链、fetch、第三方库、iframe或localStorage。
- 只输出JSON，不写Markdown。`,
          `档案：${JSON.stringify(body.node)}\n不可修改的蓝图：${JSON.stringify(blueprint)}\n待修复场景：${JSON.stringify(generated)}`,
          0.42,
        );
        generated = { ...generated, ...repaired };
      }
      const result = { ...generated, ...factualCore, interaction: "world" };

      const interaction = ["world", "choice", "scale", "arrange"].includes(String(result.interaction)) ? String(result.interaction) as Interaction : "world";
      const rawOutcomes = Array.isArray(result.world_outcomes) ? result.world_outcomes.slice(0, 3) : [];
      const outcomes: WorldOutcome[] = rawOutcomes.map((item, index) => {
        const entry = item as Record<string, unknown>;
        return { id: `o${index + 1}`, label: String(entry.label || `结果${index + 1}`).slice(0, 20), verdict: ["hit", "near", "twist"].includes(String(entry.verdict)) ? String(entry.verdict) as Verdict : (["hit", "near", "twist"] as Verdict[])[index] };
      });
      const choices = Array.isArray(result.choices) ? result.choices.slice(0, 3).map((item) => String(item).slice(0, 20)) : [];
      const verdicts = Array.isArray(result.choice_verdicts) ? result.choice_verdicts.slice(0, 3).map(String) as Verdict[] : [];
      const rawChoiceVisuals = Array.isArray(result.choice_visuals) ? result.choice_visuals.slice(0, 3) : [];
      const choiceVisuals: ChoiceVisual[] = choices.map((_, index) => {
        const entry = (rawChoiceVisuals[index] || {}) as Record<string, unknown>;
        return {
          value: Math.max(5, Math.min(95, Number(entry.value) || 28 + index * 26)),
          uncertainty: Math.max(0, Math.min(25, Number(entry.uncertainty) || 0)),
          annotation: String(entry.annotation || choices[index] || "一种可能").slice(0, 18),
        };
      });
      const rawVisualContext = result.visual_context as Record<string, unknown> | undefined;
      const visualContext: VisualContext | null = interaction === "choice" ? {
        measure: String(rawVisualContext?.measure || "结果变化").slice(0, 14),
        unit: String(rawVisualContext?.unit || "相对尺度").slice(0, 12),
        baseline_label: String(rawVisualContext?.baseline_label || "变化前").slice(0, 14),
        changed_label: String(rawVisualContext?.changed_label || "变化后").slice(0, 14),
        baseline_value: Math.max(5, Math.min(95, Number(rawVisualContext?.baseline_value) || 50)),
      } : null;
      const rawScale = result.scale as Record<string, unknown> | undefined;
      const scale = rawScale ? { left: String(rawScale.left || "更少").slice(0, 8), right: String(rawScale.right || "更多").slice(0, 8), target: Math.max(0, Math.min(100, Number(rawScale.target || 50))), tolerance: Math.max(8, Math.min(18, Number(rawScale.tolerance || 12))) } : null;
      const items = Array.isArray(result.items) ? result.items.slice(0, 3).map((item) => String(item).slice(0, 14)) : [];
      const targetOrder = Array.isArray(result.target_order) ? result.target_order.slice(0, 3).map((item) => String(item).slice(0, 14)) : [];
      const artifact = normalizeArtifact(result);
      const worldChecks = { outcomes: outcomes.length === 3 && ["hit", "near", "twist"].every((grade) => outcomes.some((item) => item.verdict === grade)), commit: Boolean(artifact?.can_commit), topic: sceneMatchesNode(result, body.node, artifact), playable: sceneIsPlayable(artifact) };
      if (artifact && !worldChecks.topic) {
        const focus = String(result.artifact_focus || "本题");
        artifact.title = `${focus} · ${artifact.title}`.slice(0, 36);
        artifact.hint = `${focus}：${artifact.hint}`.slice(0, 80);
      }
      const validMechanic = interaction === "world" ? worldChecks.outcomes && Boolean(artifact) && worldChecks.playable : interaction === "choice" ? choices.length === 3 && ["hit", "near", "twist"].every((grade) => verdicts.includes(grade)) : interaction === "scale" ? Boolean(scale) : items.length === 3 && targetOrder.length === 3;
      if (!result.signal || !result.question || !result.concept || !result.explanation || !result.source_anchor || !result.caveat || !validMechanic) throw new Error(`Encounter incomplete:${JSON.stringify(worldChecks)}`);

      const state: EncounterState = {
        node: body.node,
        signal: String(result.signal).slice(0, 52),
        question: String(result.question).slice(0, 30),
        interaction,
        outcomes,
        choices,
        choice_verdicts: verdicts,
        choice_visuals: choiceVisuals,
        visual_context: visualContext,
        scale,
        items,
        target_order: targetOrder,
        visual: ["pulse", "orbit", "split", "network", "scale"].includes(String(result.visual)) ? String(result.visual) as EncounterState["visual"] : "pulse",
        concept: String(result.concept),
        explanation: String(result.explanation),
        source_anchor: String(result.source_anchor),
        caveat: String(result.caveat),
        map_fields: mapFields,
      };
      return NextResponse.json({ signal: state.signal, question: state.question, interaction: state.interaction, outcomes: state.outcomes.map(({ id, label }) => ({ id, label })), choices: state.choices, choice_visuals: state.choice_visuals, visual_context: state.visual_context, scale: state.scale ? { left: state.scale.left, right: state.scale.right } : null, items: state.items, visual: state.visual, artifact, token: await seal(state, sceneModel.apiKey) });
    }

    if (body.mode === "resolve") {
      if (!body.token) return NextResponse.json({ error: "观测尚未完成" }, { status: 400 });
      const state = await unseal(body.token, sceneModel.apiKey);
      if (!state) return NextResponse.json({ error: "这次观测已经褪色" }, { status: 400 });
      const graded = gradeEncounter(state, body);
      const flight = { signal: Math.max(0, Math.min(100, Number(body.flight?.signal) || 0)), samples: Math.max(0, Math.min(4, Number(body.flight?.samples) || 0)), probes: Math.max(0, Math.min(20, Number(body.flight?.probes) || 0)) };
      const flightStyle = flight.samples >= 3 ? "主动偏航采样：wild航线应更大胆地跨到远领域" : flight.probes >= 2 ? "远距探测：bridge航线应从相邻可见现象建立连接" : "直达航行：deeper航线应提供最容易继续追问的台阶";
      const result = await callModel(
        knowledgeModel,
        `你是《星火档案》的知识编辑。根据固定判定完成一页让陌生人真正学会东西的微型百科。
观测：${state.signal}
问题：${state.question}
玩家动作：${graded.answer}
固定判定：${graded.verdict}
概念：${state.concept}
准确解释：${state.explanation}
事实锚点：${state.source_anchor}
边界：${state.caveat}
已经走过的领域：${JSON.stringify(state.map_fields)}
本次飞行记录：信号${flight.signal}/100，捕获${flight.samples}/4个样本，发射${flight.probes}枚探针。
航行风格：${flightStyle}

知识编辑纪律：
- 假设读者是聪明但对该领域一无所知的高中毕业生。任何人名、制度、实验、年代或术语第一次出现时都要顺手解释，不能靠读者预习。
- answer_title直接用白话回答问题，像百科条目的小标题，不写格言、隐喻或文学判断。
- scene用2至4个短句还原一个具体现场。尽量出现“谁、在什么处境、做了什么、结果怎样”；历史题给出时代与人物位置，科学题给出可想象的物体、尺度或实验动作。
- explanation再用白话讲清因果链。每句话只承担一个意思，禁止把五个抽象名词压进一句话。
- terms最多2个，只收录不解释就会挡住理解的词；meaning像给朋友解释，不可用另一个生词兜圈。
- 不夹未经解释的英文、拉丁文或缩写；能用准确中文就直接用中文。
- why_it_matters必须写成一个玩家今后真的能使用的提问句式，优先使用“以后看到……，先问……，而不是……”；不要泛泛说“很重要”。
- transfer换一个高中毕业生日常可见的场景，展示同一关系还能解释什么。必须具体到人、物体、数字或动作，不能只换一组抽象名词。
- echo只回应玩家刚才的动作，不说“正确/错误”，但要点明玩家押中了什么或忽略了哪一个变量，让反馈有抓力。
- 不把基因、分子、城市或算法写成人，不说它们“选择、渴望、谈判、记住”了什么。
- 禁用文案腔：身份即被铸入、抽象天赋、资产总和、显著、赋能、重塑、深层、揭示、机制、背后、系统性、颠覆、神奇、竟然、无声的契约、完成复制。
- 生成3条去向：deeper留在当前问题；bridge换一个熟悉角度；wild跳到遥远领域。bridge与wild必须优先选择“已经走过的领域”之外的学科，并且彼此也不能属于同一领域；目标是帮助玩家逐渐点亮100个不同领域，而不是在少数主题里打转。
- 飞行记录不能改变事实或固定判定，只用来决定三条航线的跨度与切入角度。flight_note用一句话明确告诉玩家，他的驾驶方式怎样影响了下一跳。
- name必须写成普通人一眼能懂、想点开的具体问题，优先使用“为什么/怎样/如果”；不能只丢出“百夫队投票权重”式名词。
- promise用一句白话说明点进去会看见什么。如果name不可避免地含有生词，promise必须当场解释这个词。

输出JSON：
{
  "echo":"8至18字",
  "answer_title":"10至24字，直接回答本题",
  "scene":"70至130字，2至4个短句的具体现场",
  "explanation":"45至90字，白话因果解释",
  "terms":[{"term":"2至8字","meaning":"18至38字的白话解释"}],
  "why_it_matters":"28至55字",
  "transfer":"28至60字，以‘这也能解释’或具体追问开头的日常迁移例子",
  "spark":{"title":"4至10字","field":"真实领域","insight":"18至38字，读者可以复述的白话结论"},
  "profile_signal":"10至22字，描述玩家反复偏爱的提问角度",
  "flight_note":"14至32字，说明本次驾驶怎样改变下一批航线",
  "next_nodes":[
    {"name":"8至18字的具体问题","field":"领域","sector":"六类之一","promise":"12至26字","kind":"deeper","connection_reason":"10至22字"},
    {"name":"8至18字的具体问题","field":"领域","sector":"六类之一","promise":"12至26字","kind":"bridge","connection_reason":"10至22字"},
    {"name":"8至18字的具体问题","field":"领域","sector":"六类之一","promise":"12至26字","kind":"wild","connection_reason":"10至22字"}
  ]
}`,
        `请为这次观测归档。判定必须保持为${graded.verdict}。`,
        0.7,
      );
      const spark = result.spark as Record<string, unknown> | undefined;
      const terms = Array.isArray(result.terms) ? result.terms.slice(0, 2).map((item) => {
        const entry = item as Record<string, unknown>;
        return { term: String(entry.term || "").slice(0, 16), meaning: String(entry.meaning || "").slice(0, 60) };
      }).filter((item) => item.term && item.meaning) : [];
      const nextNodes = Array.isArray(result.next_nodes) ? result.next_nodes.slice(0, 3) : [];
      if (!result.echo || !result.answer_title || !result.scene || !result.explanation || !result.why_it_matters || !result.transfer || !spark?.title || !spark.insight || nextNodes.length !== 3) throw new Error("Resolution incomplete");
      return NextResponse.json({
        verdict: graded.verdict,
        echo: String(result.echo).slice(0, 24),
        answer_title: String(result.answer_title).slice(0, 40),
        scene: String(result.scene).slice(0, 180),
        explanation: String(result.explanation).slice(0, 130),
        terms,
        why_it_matters: String(result.why_it_matters).slice(0, 90),
        transfer: String(result.transfer).slice(0, 110),
        spark: { title: String(spark.title).slice(0, 24), field: String(spark.field || state.node.field).slice(0, 30), insight: String(spark.insight).slice(0, 48) },
        profile_signal: String(result.profile_signal || "喜欢从微小差异追踪变化").slice(0, 50),
        flight_note: String(result.flight_note || (flight.samples >= 3 ? "你捕获了更多样本，远行航线因此跨得更远。" : "你选择直达，下一跳会先从当前问题继续深挖。")).slice(0, 60),
        source_note: `${state.source_anchor} · ${state.caveat}`.slice(0, 90),
        next_nodes: nextNodes.map((item, index) => {
          const node = item as Record<string, unknown>;
          const routeKinds = ["deeper", "bridge", "wild"] as const;
          return { name: String(node.name || "未命名标本").slice(0, 28), field: String(node.field || "未分类").slice(0, 30), sector: sectors.includes(String(node.sector) as SectorKey) ? String(node.sector) : "systems", promise: String(node.promise || "看见另一种变化").slice(0, 28), kind: routeKinds[index], connection_reason: String(node.connection_reason || "由这次观测相连").slice(0, 50) };
        }),
      });
    }

    if (body.mode === "constellation") {
      const recent = body.recent_nodes?.slice(-4) || [];
      if (recent.length < 3) return NextResponse.json({ error: "还没有足够的观测来闭合解释面" }, { status: 400 });
      const result = await callModel(
        knowledgeModel,
        `你是《星火档案》的知识结构编辑。根据一个人最近走过的3至4个知识标本，把它们闭合成一张“解释面”：三个不同领域共同解释的一类问题。
- 名称必须具体、含蓄、可记忆，像一件可以拿在手里的认知工具，不是人格测试，不使用“型/者/主义”，不必生硬地以“面”结尾。
- 名称不得与已经出现的解释面同名或仅有一字之差；优先从这一次独有的动作、物体或矛盾中取名。
- line用第二人称指出这三个标本如何互相补足：至少点出两个具体对象或动作，不能只堆抽象形容词。
- motif写它们共同帮助玩家追问的一个白话问题，不要只写“变化、秩序、关系”这种空词。
- 描述提问习惯，不评判人格。禁用：AI、算法、机制、系统、深层、揭示、痴迷于、无主秩序、脆弱而坚韧、动态平衡。
输出JSON：{"name":"4至9字","line":"24至48字","motif":"8至18字的共同问题"}`,
        `最近标本：${JSON.stringify(recent)}\n提问痕迹：${JSON.stringify(body.profile_signals?.slice(-6) || [])}\n已经使用过的解释面名称（不得重复）：${JSON.stringify(body.existing_names?.slice(-20) || [])}`,
        0.78,
      );
      if (!result.name || !result.line) throw new Error("Constellation incomplete");
      return NextResponse.json({ name: String(result.name).slice(0, 20), line: String(result.line).slice(0, 80), motif: String(result.motif || "这些现象为什么会相互影响").slice(0, 36) });
    }

    if (body.mode === "volume") {
      const faces = body.faces?.slice(-3) || [];
      if (faces.length < 3) return NextResponse.json({ error: "还没有三张解释面来构成世界模型" }, { status: 400 });
      const result = await callModel(
        knowledgeModel,
        `你是《星火档案》的世界模型编辑。玩家已经拥有三张跨领域解释面。现在找出一条能在三类问题之间迁移的规律，把它命名为一个“世界模型体”。
- 这不是总结或人格标签。它必须是一件可以拿去分析新问题的思考工具。
- name要具体、克制、可记忆，4至9字；可以像“反馈回路体”“尺度错位体”，但不要硬凑“体”字，也不要使用宏大科幻词。
- line先用白话说清三张面如何互相支撑，至少提到两个解释面的具体对象或矛盾。
- law必须能直接用于下一次观察，写成“遇到……，先问……，再看……”或同样清楚的动作句。不能只是格言。
- 不声称无条件通用；如果适用有边界，在law中用“当……时”说清。
- 禁用：赋能、重塑、深层、揭示、系统性、底层逻辑、万物、终极、涌现、范式、动态平衡。
输出JSON：{"name":"4至9字","line":"30至60字","law":"30至58字的可执行迁移法则"}`,
        `三张解释面：${JSON.stringify(faces)}\n已经使用过的世界模型名称（不得重复）：${JSON.stringify(body.existing_names?.slice(-20) || [])}`,
        0.72,
      );
      if (!result.name || !result.line || !result.law) throw new Error("Volume incomplete");
      return NextResponse.json({ name: String(result.name).slice(0, 20), line: String(result.line).slice(0, 100), law: String(result.law).slice(0, 100) });
    }

    if (body.mode === "chart") {
      const thought = body.thought?.trim().slice(0, 160);
      if (!thought) return NextResponse.json({ error: "先写下一件无法解释的事" }, { status: 400 });
      const knownNodes = [...(body.map?.discovered || []), ...(body.map?.frontier || [])].slice(0, 40);
      const result = await callModel(
        knowledgeModel,
        `你是《星火档案》的制图员。把一句日常困惑变成一件可观测的知识标本。
- 不回答原问题，只找到最有解释力且可靠的领域。
- 名称是具体场景、物件或动作，4至12字；避免“为什么”和课程标题。
- hook只承诺下一次会看到的现象。
- sector只能是life、mind、society、matter、creation、systems。
- 禁用：显著、机制、赋能、重塑、深层、揭示、系统性。
输出JSON：{"node":{"name":"名称","field":"真实领域","sector":"六类之一","hook":"8至20字"},"parent_hint":"已有节点名或起点","nav_note":"12至28字"}`,
        `这句话：${JSON.stringify(thought)}\n已有标本：${JSON.stringify(knownNodes)}`,
        0.68,
      );
      const node = result.node as Record<string, unknown> | undefined;
      if (!node?.name || !node.field || !node.hook) throw new Error("Chart incomplete");
      return NextResponse.json({ node: { name: String(node.name).slice(0, 28), field: String(node.field).slice(0, 30), sector: sectors.includes(String(node.sector) as SectorKey) ? String(node.sector) : "systems", hook: String(node.hook).slice(0, 40) }, parent_hint: String(result.parent_hint || "起点").slice(0, 40), nav_note: String(result.nav_note || "这件事被收进了夜空").slice(0, 48) });
    }

    return NextResponse.json({ error: "无法识别这项观测" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: message.includes("Model provider") ? "制图台暂时没有回信" : "这页档案没有生成完整，请重试" }, { status: 502 });
  }
}
