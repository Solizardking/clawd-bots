# Clawd Bot

Solana-native, local-first chat for a team of AI agents. This tree is the
OpenMausBot-derived surface adapted into the reconstructed Grok Bot 0.18
repository: Clawd Bot branding, the Solana purple/green skin as first paint,
and a harness server whose Solana status, wallets, and routed tools are the
real shipped modules.

Build it with **this repo's npm toolchain**, not a separate pnpm workspace:

```bash
npm run clawd:typecheck
npm run clawd:build
npm run clawd:server
```

The reconstructed 0.18 ASAR pipeline (`npm run build`, `npm run verify`) is
unchanged. Clawd Bot is the integrated product surface.

## Identity

- Product name: **Clawd Bot**
- Desktop id: `com.clawdbot.app.desktop`
- Default skin: **Solana** (`#9945FF` / `#14F195`)
- Data dir: `~/.clawdbot`

## Layout

Adapted sources live under `clawd/` so they do not collide with the
reconstructed `src/`, `scripts/`, and `docs/` pipelines.
