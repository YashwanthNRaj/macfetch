import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the MacFetch interface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MacFetch — Seedha tere Mac pe<\/title>/i);
  assert.match(html, /Welcome, boss/);
  assert.match(html, /Download ka scene,/);
  assert.match(html, /Mac pe chalo/);
  assert.match(html, /iPhone mode/);
  assert.match(html, /Video aur audio, apne style mein\./);
  assert.match(html, /Seedha tere Mac pe\./);
  assert.match(html, /Apna format choose kar/);
  assert.match(html, /Pixels kitne chahiye\?/);
  assert.match(html, /Mac full ready|Mac check ho raha/);
  assert.match(html, /href="\/ios"/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/);
});

test("server-renders the iPhone companion page", async () => {
  const response = await render("/ios");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>MacFetch for iPhone — Download phone pe<\/title>/i);
  assert.match(html, /iPhone downloader/);
  assert.match(html, /Link chipka\./);
  assert.match(html, /Download phone pe\./);
  assert.match(html, /Apna format choose kar/);
  assert.match(html, /iPhone mein kahan\?/);
  assert.match(html, /iPhone-ready MP4/);
  assert.match(html, /H\.264 \+ AAC/);
  assert.match(html, /HEVC/);
  assert.match(html, /href="\/"/);
});
