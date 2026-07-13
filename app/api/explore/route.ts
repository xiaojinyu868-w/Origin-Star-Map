import { NextResponse } from "next/server";

type ExploreRequest = {
  question?: string;
  context?: string;
};

export async function POST(request: Request) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI guide is offline" }, { status: 503 });
  }

  let body: ExploreRequest;
  try {
    body = (await request.json()) as ExploreRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const question = body.question?.trim().slice(0, 220);
  if (!question) {
    return NextResponse.json({ error: "Question is required" }, { status: 400 });
  }

  const systemPrompt = `你是中文知识探索游戏《星火档案》中的飞船AI“阿卡”。
玩家正在调查一个没有货币、依靠公共仓库和贡献记录运转的虚构城市。
你的任务不是给百科全书式答案，而是：
1. 用120至180个汉字回应问题；
2. 解释一个真实可靠的经济学、人类学或复杂系统概念；
3. 指出一种限制或反例；
4. 用一个具体的反问鼓励玩家继续探索；
5. 避免声称虚构城市是真实案例；
6. 必须输出JSON，格式为：
{"reply":"回答","counter_question":"反问","discovered_concepts":["概念1","概念2"]}`;

  try {
    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_MODEL || "qwen-plus",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `场景：${body.context?.slice(0, 300) || "无价之城"}\n玩家问题：${question}` },
        ],
        response_format: { type: "json_object" },
        enable_thinking: false,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Model request failed" }, { status: 502 });
    }

    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Missing model output");

    const result = JSON.parse(content) as {
      reply?: string;
      counter_question?: string;
      discovered_concepts?: string[];
    };

    if (!result.reply || !result.counter_question || !Array.isArray(result.discovered_concepts)) {
      throw new Error("Invalid model output");
    }

    return NextResponse.json({
      reply: result.reply.slice(0, 600),
      counter_question: result.counter_question.slice(0, 220),
      discovered_concepts: result.discovered_concepts.slice(0, 3).map((item) => String(item).slice(0, 24)),
    });
  } catch {
    return NextResponse.json({ error: "AI guide unavailable" }, { status: 502 });
  }
}
