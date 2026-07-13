import { NextResponse } from "next/server";

type AtlasNode = {
  id?: string;
  name: string;
  field: string;
  hook: string;
  sector?: "life" | "mind" | "society" | "matter" | "creation" | "systems";
};

type AtlasRequest = {
  mode?: "encounter" | "resolve" | "chart";
  node?: AtlasNode;
  map?: { discovered?: string[]; frontier?: string[]; fields?: string[] };
  answer?: string;
  thought?: string;
  token?: string;
};

type EncounterState = {
  node: AtlasNode;
  signal: string;
  question: string;
  choices: string[];
  choice_verdicts: Array<"hit" | "near" | "twist">;
  visual: "pulse" | "orbit" | "split" | "network" | "scale";
  concept: string;
  concept_explanation: string;
  source_anchor: string;
  caveat: string;
  map_fields: string[];
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function seal(value: EncounterState, secret: string) {
  const payload = toBase64Url(encoder.encode(JSON.stringify(value)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function unseal(token: string, secret: string): Promise<EncounterState | null> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    fromBase64Url(signature),
    encoder.encode(payload),
  );
  if (!valid) return null;
  try {
    return JSON.parse(decoder.decode(fromBase64Url(payload))) as EncounterState;
  } catch {
    return null;
  }
}

async function callQwen(apiKey: string, system: string, user: string, temperature = 0.75) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_MODEL || "qwen3.7-plus",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_object" },
        enable_thinking: false,
        temperature,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DashScope ${response.status}`);
    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Missing output");
    return JSON.parse(content) as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  return NextResponse.json({ connected: Boolean(process.env.DASHSCOPE_API_KEY) });
}

export async function POST(request: Request) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI导航员尚未连接" }, { status: 503 });

  let body: AtlasRequest;
  try {
    body = (await request.json()) as AtlasRequest;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }

  try {
    if (body.mode === "encounter") {
      if (!body.node?.name || !body.node.field || !body.node.hook) {
        return NextResponse.json({ error: "这颗星的坐标不完整" }, { status: 400 });
      }

      const mapFields = body.map?.fields?.slice(0, 24) || [];
      const result = await callQwen(
        apiKey,
        `你是知识探索游戏《星火档案》的关卡生成器。你不是老师，任务是制造一个让人忍不住下注的短回合。

围绕指定知识星生成一次20秒挑战：
- signal必须是一条反常识事实，像游戏中的异常警报，不铺垫背景。
- signal必须来自可重复的经典实验、稳定统计规律或明确机制；先在内部找到实验锚点，再写题。
- question必须要求预测“条件改变后会发生什么”，不能问开放式“为什么”，也不要只复述signal。
- 三个choices都要听起来合理、互相排斥、字数相近，玩家无需专业知识。
- 其中至少一个选项应利用常见直觉误区，但不能故意文字欺骗。
- 暗中保留真实概念和准确解释，下一步用于判定。
- 禁止网络流行神话和绝对化因果。例如：不能说没有颜色词就看不见颜色，只能陈述可靠的辨别速度或分类差异；不能把相关性写成因果；不能写“某假说已被证实”。
- 如果指定星球的流行说法有争议，必须改用同领域更可靠、更具体的实验。
- 禁止课堂口吻、长故事、定义罗列和“你知道吗”。

必须输出合法JSON：
{
  "signal":"25至45字的异常事实",
  "question":"12至28字的预测题",
  "choices":["三个选项，每项6至18字"],
  "choice_verdicts":["与三个选项逐项对应，hit、near、twist各出现一次"],
  "visual":"pulse、orbit、split、network、scale五选一",
  "concept":"真实知识概念，4至16字",
  "concept_explanation":"40至75字，准确解释结果",
  "source_anchor":"实验、效应或稳定规律的名称，8至30字",
  "caveat":"15至35字，指出不能由此推出什么"
}`,
        `知识星：${JSON.stringify(body.node)}\n玩家已接触领域：${JSON.stringify(mapFields)}`,
        0.8,
      );

      const choices = Array.isArray(result.choices) ? result.choices.slice(0, 3).map((item) => String(item).slice(0, 20)) : [];
      const choiceVerdicts = Array.isArray(result.choice_verdicts) ? result.choice_verdicts.slice(0, 3).map(String) : [];
      const visual = ["pulse", "orbit", "split", "network", "scale"].includes(String(result.visual)) ? String(result.visual) as EncounterState["visual"] : "pulse";
      if (!result.signal || !result.question || !result.concept || !result.concept_explanation || !result.source_anchor || !result.caveat || choices.length !== 3 || !["hit", "near", "twist"].every((grade) => choiceVerdicts.includes(grade))) {
        throw new Error("Encounter incomplete");
      }
      const state: EncounterState = {
        node: body.node,
        signal: String(result.signal).slice(0, 55),
        question: String(result.question).slice(0, 32),
        choices,
        choice_verdicts: choiceVerdicts as EncounterState["choice_verdicts"],
        visual,
        concept: String(result.concept),
        concept_explanation: String(result.concept_explanation),
        source_anchor: String(result.source_anchor),
        caveat: String(result.caveat),
        map_fields: mapFields,
      };
      return NextResponse.json({
        signal: state.signal,
        question: state.question,
        choices: state.choices,
        visual: state.visual,
        token: await seal(state, apiKey),
      });
    }

    if (body.mode === "resolve") {
      const answer = body.answer?.trim().slice(0, 280);
      if (!answer || !body.token) return NextResponse.json({ error: "请先留下你的直觉" }, { status: 400 });
      const state = await unseal(body.token, apiKey);
      if (!state) return NextResponse.json({ error: "这次远征已经失去信号" }, { status: 400 });
      const answerIndex = state.choices.findIndex((choice) => choice === answer);
      const expectedVerdict = answerIndex >= 0 && Array.isArray(state.choice_verdicts) ? state.choice_verdicts[answerIndex] || "near" : "near";

      const result = await callQwen(
        apiKey,
        `你是个人知识星图的AI导航员。
当前知识星：${state.node.name}（${state.node.field}）
异常信号：${state.signal}
问题：${state.question}
三个选项：${JSON.stringify(state.choices)}
本次选择的固定判定：${expectedVerdict}
背后概念：${state.concept}
准确解释：${state.concept_explanation}
事实锚点：${state.source_anchor}
边界：${state.caveat}
玩家已接触领域：${JSON.stringify(state.map_fields)}

判定玩家选择并完成游戏回合：
- verdict必须严格输出${expectedVerdict}。hit代表抓住核心机制；near代表方向部分正确；twist代表结果与直觉相反。不要羞辱错误选择。
- verdict_line像游戏揭晓，必须有冲击力，不超过18字。
- reveal只讲最关键的因果反转，不超过55字。
- reveal必须遵守事实锚点与边界，禁止把影响写成决定、把假说写成定论。
- spark是一句话能复述的知识战利品。
- 生成3条下一航线供玩家三选一：deeper继续追击；bridge跨学科；wild跳到遥远的未接触领域。
- 每条promise只说明“下一局会看到什么”，不要解释知识。
- sector只能是life、mind、society、matter、creation、systems之一。

必须输出合法JSON：
{
  "verdict":"hit或near或twist",
  "verdict_line":"6至18字",
  "reveal":"25至55字",
  "spark":{"title":"4至12字","field":"真实领域","insight":"20至40字"},
  "profile_signal":"10至24字，不贴人格标签",
  "next_nodes":[
    {"name":"5至12字","field":"领域","sector":"六类之一","promise":"8至18字","kind":"deeper","connection_reason":"10至24字"},
    {"name":"5至12字","field":"领域","sector":"六类之一","promise":"8至18字","kind":"bridge","connection_reason":"10至24字"},
    {"name":"5至12字","field":"领域","sector":"六类之一","promise":"8至18字","kind":"wild","connection_reason":"10至24字"}
  ]
}`,
        `玩家下注：${JSON.stringify(answer)}`,
        0.82,
      );

      const spark = result.spark as Record<string, unknown> | undefined;
      const nextNodes = Array.isArray(result.next_nodes) ? result.next_nodes.slice(0, 3) : [];
      if (!result.verdict_line || !result.reveal || !spark?.title || !spark.insight || nextNodes.length < 3) {
        throw new Error("Resolution incomplete");
      }
      const verdict = expectedVerdict;
      const sectors = ["life", "mind", "society", "matter", "creation", "systems"];
      return NextResponse.json({
        verdict,
        verdict_line: String(result.verdict_line).slice(0, 36),
        reveal: String(result.reveal).slice(0, 64),
        spark: {
          title: String(spark.title).slice(0, 40),
          field: String(spark.field || state.node.field).slice(0, 30),
          insight: String(spark.insight).slice(0, 48),
        },
        profile_signal: String(result.profile_signal || "从具体反例寻找规律").slice(0, 80),
        next_nodes: nextNodes.map((item) => {
          const node = item as Record<string, unknown>;
          return {
            name: String(node.name || "未知信号").slice(0, 30),
            field: String(node.field || "未分类").slice(0, 30),
            sector: sectors.includes(String(node.sector)) ? String(node.sector) : "systems",
            promise: String(node.promise || "下一局会出现新的反转").slice(0, 24),
            kind: ["deeper", "bridge", "wild"].includes(String(node.kind)) ? String(node.kind) : "bridge",
            connection_reason: String(node.connection_reason || "由这次选择产生").slice(0, 60),
          };
        }),
      });
    }

    if (body.mode === "chart") {
      const thought = body.thought?.trim().slice(0, 240);
      if (!thought) return NextResponse.json({ error: "写下一个念头，AI才能把它变成坐标" }, { status: 400 });
      const knownNodes = [...(body.map?.discovered || []), ...(body.map?.frontier || [])].slice(0, 36);
      const fields = body.map?.fields?.slice(0, 24) || [];
      const result = await callQwen(
        apiKey,
        `你是个人知识星图的AI制图员。把玩家模糊、日常或抽象的念头，转化成一颗值得2分钟探索的知识星。
- 找到它背后最有解释力的真实知识领域。
- 名称必须像一个谜题或异常信号，而不是课程标题。
- 优先连接到已有星图中真正相关、但玩家可能想不到的节点。
- 不要直接回答玩家的问题。
必须输出JSON：
{"node":{"name":"5至12字","field":"真实领域","sector":"life、mind、society、matter、creation、systems六选一","hook":"8至18字的下一局诱饵"},"parent_hint":"从已有节点名称中选择最相关的一个；若没有则写起点","nav_note":"15至32字说明为什么画在这里"}`,
        `玩家念头：${JSON.stringify(thought)}\n已有节点：${JSON.stringify(knownNodes)}\n已有领域：${JSON.stringify(fields)}`,
        0.72,
      );
      const node = result.node as Record<string, unknown> | undefined;
      if (!node?.name || !node.field || !node.hook) throw new Error("Chart incomplete");
      return NextResponse.json({
        node: { name: String(node.name).slice(0, 30), field: String(node.field).slice(0, 30), sector: String(node.sector || "systems").slice(0, 12), hook: String(node.hook).slice(0, 60) },
        parent_hint: String(result.parent_hint || "起点").slice(0, 40),
        nav_note: String(result.nav_note || "AI已经把这个念头画进你的宇宙。 ").slice(0, 180),
      });
    }

    return NextResponse.json({ error: "未知的导航指令" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return NextResponse.json(
      { error: message.includes("DashScope") ? "AI导航员暂时没有回应" : "这片星域生成失败，请重试" },
      { status: 502 },
    );
  }
}
