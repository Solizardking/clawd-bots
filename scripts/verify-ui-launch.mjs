import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(repoRoot, "clawd/dist-ui");
const shot = process.argv[2];
const logPath = process.argv[3];
const logs = [];
const say = (line) => {
  logs.push(line);
  console.log(line);
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const rel = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(dist, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}/`;
say(`serving ${dist} at ${origin}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  // UI-only launch has no harness; the SSE client 404s on /api/events.
  if (text.includes("Failed to load resource") && text.includes("404")) return;
  pageErrors.push(`console.error ${text}`);
});

await page.goto(origin, { waitUntil: "networkidle" });
await page.waitForSelector("#root");
const title = await page.title();
const skin = await page.locator("html").getAttribute("data-skin");
const tokens = await page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  return {
    accent: style.getPropertyValue("--color-accent").trim(),
    border: style.getPropertyValue("--color-accent-border").trim(),
    focus: style.getPropertyValue("--color-focus").trim(),
    hasWindow: typeof window !== "undefined",
    hasRequire: typeof window.require,
    hasModule: typeof window.module,
    rootText: document.getElementById("root")?.innerText?.slice(0, 500) ?? "",
    rootChildCount: document.getElementById("root")?.children.length ?? 0,
    filled: (document.getElementById("root")?.innerText?.length ?? 0) > 40,
  };
});
say(`title=${title}`);
say(`skin=${skin}`);
say(`tokens=${JSON.stringify(tokens)}`);
say(`pageErrors=${JSON.stringify(pageErrors)}`);

const nameInput = page.getByPlaceholder("Your name");
await nameInput.fill("Cluster Operator");
const typed = await nameInput.inputValue();
say(`typed=${typed}`);

if (title !== "Clawd Bot") throw new Error(`title was ${title}`);
if (skin !== "solana") throw new Error(`skin was ${skin}`);
if (!/#14F195/i.test(tokens.accent) && !/rgb\(20,\s*241,\s*149\)/i.test(tokens.accent)) {
  throw new Error(`accent token not Solana green: ${tokens.accent}`);
}
if (!/#9945FF/i.test(tokens.border) && !/rgb\(153,\s*69,\s*255\)/i.test(tokens.border)) {
  throw new Error(`border token not Solana purple: ${tokens.border}`);
}
if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join(" | ")}`);
if (!tokens.hasWindow) throw new Error("window missing");
if (tokens.hasRequire !== "undefined") throw new Error("Node require leaked");
if (!tokens.filled) throw new Error("root was empty");
if (typed !== "Cluster Operator") throw new Error("input did not take a value");

await page.screenshot({ path: shot, fullPage: true });
say(`screenshot=${shot}`);
say("OK");

await browser.close();
server.close();
fs.writeFileSync(logPath, logs.join("\n") + "\n");
