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
  assert.match(html, /个人知识宇宙/);
  assert.match(html, /可拖拽和缩放的个人知识星图/);
  assert.match(html, /好奇心原点/);
  assert.match(html, /把任何念头画进你的宇宙/);
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
  assert.match(api, /mode === "chart"/);
  assert.match(api, /qwen3\.7-plus/);
  assert.doesNotMatch(game, /DASHSCOPE_API_KEY|sk-[a-zA-Z0-9]/);
  assert.match(envExample, /DASHSCOPE_API_KEY=/);
  assert.doesNotMatch(envExample, /DASHSCOPE_API_KEY=sk-/);
});
