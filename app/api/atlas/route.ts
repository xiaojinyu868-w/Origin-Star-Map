import { NextResponse } from "next/server";

type AtlasNode = {
  id?: string;
  name: string;
  field: string;
  hook: string;
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
  scene: string;
  question: string;
  concept: string;
  concept_explanation: string;
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
        `你是《星火档案》的AI知识策展人。玩家正在通过个人星图广泛接触陌生领域，而不是系统学习一门课程。

请围绕指定知识星生成一次2分钟的微远征：
- 从一个具体、反常识、能让人产生直觉判断的现象开始。
- 不要先解释概念，不要使用课堂口吻，不要写成长故事。
- 问题必须允许普通人凭直觉回答，没有标准术语也能参与。
- 暗中选定一个真实可靠的知识概念，供下一步解释。
- quick_starts只是帮助不知道说什么的人起步，不能替代自由回答。

必须输出合法JSON：
{
  "scene":"60至100字，具体而有画面感的现象",
  "question":"20至45字，让玩家预测、比较或解释",
  "quick_starts":["三个不同方向的第一人称直觉，每项10至22字"],
  "concept":"真实知识概念，4至16字",
  "concept_explanation":"80至130字，准确说明概念及其边界"
}`,
        `知识星：${JSON.stringify(body.node)}\n玩家已接触领域：${JSON.stringify(mapFields)}`,
        0.8,
      );

      if (!result.scene || !result.question || !result.concept || !result.concept_explanation) {
        throw new Error("Encounter incomplete");
      }
      const quickStarts = Array.isArray(result.quick_starts)
        ? result.quick_starts.slice(0, 3).map((item) => String(item).slice(0, 50))
        : [];
      const state: EncounterState = {
        node: body.node,
        scene: String(result.scene),
        question: String(result.question),
        concept: String(result.concept),
        concept_explanation: String(result.concept_explanation),
        map_fields: mapFields,
      };
      return NextResponse.json({
        scene: state.scene,
        question: state.question,
        quick_starts: quickStarts,
        token: await seal(state, apiKey),
      });
    }

    if (body.mode === "resolve") {
      const answer = body.answer?.trim().slice(0, 280);
      if (!answer || !body.token) return NextResponse.json({ error: "请先留下你的直觉" }, { status: 400 });
      const state = await unseal(body.token, apiKey);
      if (!state) return NextResponse.json({ error: "这次远征已经失去信号" }, { status: 400 });

      const result = await callQwen(
        apiKey,
        `你是个人知识星图的AI导航员。
当前知识星：${state.node.name}（${state.node.field}）
现象：${state.scene}
问题：${state.question}
背后概念：${state.concept}
准确解释：${state.concept_explanation}
玩家已接触领域：${JSON.stringify(state.map_fields)}

根据玩家的自由回答完成微远征，并让星图真正生长：
- 先回应玩家的具体直觉，指出它解释了什么，以及一个容易忽略的变量。
- 给出一枚可记住的“知识火种”，不要塞入太多术语。
- 生成3颗下一步知识星：deeper沿当前概念深入；bridge连接到令人意外的其他学科；wild必须来自玩家尚未接触、且与当前领域距离很远的领域。
- 新星名称应该像值得点击的谜题，不要直接使用课程名。
- connection_reason解释为什么两颗星会相连。

必须输出合法JSON：
{
  "reply":"90至150字",
  "spark":{"title":"4至14字","field":"真实领域","insight":"30至65字可复述的认识"},
  "profile_signal":"12至30字，描述玩家此次展现的好奇方式，不贴人格标签",
  "bridge_statement":"25至55字，指出一次跨学科惊喜",
  "next_nodes":[
    {"name":"4至10字","field":"领域","hook":"18至40字","kind":"deeper","connection_reason":"15至35字"},
    {"name":"4至10字","field":"领域","hook":"18至40字","kind":"bridge","connection_reason":"15至35字"},
    {"name":"4至10字","field":"领域","hook":"18至40字","kind":"wild","connection_reason":"15至35字"}
  ]
}`,
        `玩家的直觉回答：${JSON.stringify(answer)}`,
        0.82,
      );

      const spark = result.spark as Record<string, unknown> | undefined;
      const nextNodes = Array.isArray(result.next_nodes) ? result.next_nodes.slice(0, 3) : [];
      if (!result.reply || !spark?.title || !spark.insight || nextNodes.length < 3) {
        throw new Error("Resolution incomplete");
      }
      return NextResponse.json({
        reply: String(result.reply).slice(0, 620),
        spark: {
          title: String(spark.title).slice(0, 40),
          field: String(spark.field || state.node.field).slice(0, 30),
          insight: String(spark.insight).slice(0, 220),
        },
        profile_signal: String(result.profile_signal || "从具体反例寻找规律").slice(0, 80),
        bridge_statement: String(result.bridge_statement || "这颗星正在与陌生领域建立连接。 ").slice(0, 180),
        next_nodes: nextNodes.map((item) => {
          const node = item as Record<string, unknown>;
          return {
            name: String(node.name || "未知信号").slice(0, 30),
            field: String(node.field || "未分类").slice(0, 30),
            hook: String(node.hook || "一个尚未展开的问题").slice(0, 100),
            kind: ["deeper", "bridge", "wild"].includes(String(node.kind)) ? String(node.kind) : "bridge",
            connection_reason: String(node.connection_reason || "由这次探索产生").slice(0, 100),
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
{"node":{"name":"4至10字","field":"真实领域","hook":"20至45字"},"parent_hint":"从已有节点名称中选择最相关的一个；若没有则写起点","nav_note":"30至60字说明为什么把它画在这里"}`,
        `玩家念头：${JSON.stringify(thought)}\n已有节点：${JSON.stringify(knownNodes)}\n已有领域：${JSON.stringify(fields)}`,
        0.72,
      );
      const node = result.node as Record<string, unknown> | undefined;
      if (!node?.name || !node.field || !node.hook) throw new Error("Chart incomplete");
      return NextResponse.json({
        node: { name: String(node.name).slice(0, 30), field: String(node.field).slice(0, 30), hook: String(node.hook).slice(0, 110) },
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
