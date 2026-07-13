import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the personal knowledge atlas", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /星火档案/);
  assert.match(html, /个人知识天球图/);
  assert.match(html, /未完成问题的天球图/);
  assert.match(html, /AI 能回答几乎一切/);
  assert.match(html, /不能替你拥有问题/);
  assert.match(html, /你被一个专业录取/);
  assert.match(html, /为什么刷短视频/);
  assert.match(html, /百门计划/);
  assert.match(html, /把一个真实困惑变成知识入口/);
});

test("keeps DashScope behind the server-side atlas API", async () => {
  const [api, game, envExample] = await Promise.all([
    readFile(new URL("../app/api/atlas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
  ]);

  assert.match(api, /process\.env\.DASHSCOPE_API_KEY/);
  assert.match(api, /mode === "encounter"/);
  assert.match(api, /mode === "resolve"/);
  assert.match(api, /mode === "constellation"/);
  assert.match(api, /mode === "volume"/);
  assert.match(api, /mode === "chart"/);
  assert.match(api, /choice_visuals/);
  assert.match(api, /visual_context/);
  assert.match(api, /qwen3\.7-plus/);
  assert.match(game, /ObservationInstrument/);
  assert.match(game, /ChoiceHypothesisGraphic/);
  assert.match(game, /KnowledgeVolume/);
  assert.match(game, /knowledge-face/);
  assert.doesNotMatch(game, /DASHSCOPE_API_KEY|sk-[a-zA-Z0-9]/);
  assert.match(envExample, /DASHSCOPE_API_KEY=/);
  assert.doesNotMatch(envExample, /DASHSCOPE_API_KEY=sk-/);
});
