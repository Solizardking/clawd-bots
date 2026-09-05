// Production-adapted harness server for this repo's npm/Node toolchain.
// Boots without Electron, CUA, or the full driver registry. Solana status,
// local wallets, and routed tools are the real shipped modules.
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

import { PRODUCT_ID, PRODUCT_NAME } from "../shared/product.ts";
import { createLocalSolanaWalletStore } from "./solana/local-wallets.ts";
import {
  executeSolanaRoutedTool,
  isSolanaRoutedTool,
  SOLANA_ROUTED_TOOLS,
} from "./solana/solana-routed-tools.ts";
import { createSolanaService } from "./solana/solana-service.ts";

const PORT = Number(process.env.CLAWD_PORT || process.env.OMB_PORT || process.env.OGB_PORT || 8799);
const DATA_DIR = process.env.CLAWD_DATA_DIR || process.env.OMB_DATA_DIR || join(homedir(), ".clawdbot");

const registry = { schemaVersion: 1, wallets: [] as unknown[] };

const solana = createSolanaService({
  revealSecret: async () => null,
  readRegistry: async () => registry,
  writeRegistry: async (value) => {
    const next = value as { wallets?: unknown[] };
    registry.wallets = Array.isArray(next.wallets) ? next.wallets : [];
  },
  loadServerSdk: async () => ({
    ServerSDK: class {
      async createWallet() {
        throw new Error("Phantom is not configured in the production harness.");
      }
    },
  }),
});

const localWallets = createLocalSolanaWalletStore({
  storePath: join(DATA_DIR, "solana-wallets.json"),
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plainText) => Buffer.from(plainText, "utf8"),
    decryptString: (encrypted) => encrypted.toString("utf8"),
  },
  randomSeed: () => randomBytes(32),
});

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(data);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return {};
  }
}

const solanaPort = {
  listWallets: () => solana.listWallets(),
  getWalletAssets: (raw: unknown) => solana.getWalletAssets(raw),
  getAsset: (raw: unknown) => solana.getAsset(raw),
  searchAssets: (raw: unknown) => solana.searchAssets(raw),
  listLocalWallets: () => localWallets.listLocalWallets(),
  revealLocalWalletSecret: (raw: unknown) => localWallets.revealLocalWalletSecret(raw),
  generateLocalWallet: (raw: unknown) => localWallets.generateLocalWallet(raw),
};

export function createHarnessServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const method = req.method ?? "GET";
    try {
      if (method === "GET" && url.pathname === "/api/health") {
        const status = await solana.getStatus();
        return json(res, 200, {
          app: PRODUCT_ID,
          name: PRODUCT_NAME,
          pid: process.pid,
          solana: status,
        });
      }
      if (method === "GET" && url.pathname === "/api/solana/status") {
        return json(res, 200, await solana.getStatus());
      }
      if (method === "GET" && url.pathname === "/api/solana/tools") {
        return json(res, 200, { tools: [...SOLANA_ROUTED_TOOLS] });
      }
      if (method === "POST" && url.pathname === "/api/solana/wallets/local") {
        const body = await readBody(req);
        const created = await localWallets.generateLocalWallet(body);
        return json(res, 200, created);
      }
      if (method === "GET" && url.pathname === "/api/solana/wallets/local") {
        return json(res, 200, await localWallets.listLocalWallets());
      }
      const toolMatch = url.pathname.match(/^\/api\/solana\/tools\/([A-Za-z0-9_]+)$/);
      if (method === "POST" && toolMatch && isSolanaRoutedTool(toolMatch[1])) {
        const body = await readBody(req);
        const result = await executeSolanaRoutedTool(solanaPort, toolMatch[1], body);
        return json(res, 200, result);
      }
      return json(res, 404, { error: `no route: ${method} ${url.pathname}` });
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

const launchedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(resolvePath(process.argv[1])).href === import.meta.url;
if (launchedDirectly) {
  const server = createHarnessServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`${PRODUCT_NAME} harness on http://127.0.0.1:${PORT}`);
  });
}
