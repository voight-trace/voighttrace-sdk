# Voight Trace — Official SDK Collector (`voighttrace-sdk`)

[![npm version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://voighttrace.com)
[![license](https://img.shields.io/badge/license-Apache--2.0-green.svg)](https://voighttrace.com)

Official SDK Collector for **Voight Trace** (`@voight-trace/voighttrace-sdk`). It provides non-blocking, asynchronous telemetry capture to detect, classify, and audit AI Agents, LLM crawlers (OpenAI GPTBot, ClaudeBot, PerplexityBot, ByteDance Bytespider), and human visitors recommended by generative AI platforms.

---

## 🚀 Quickstart & Framework Integrations

### 1. Installation
```bash
npm install @voight-trace/voighttrace-sdk
# or
yarn add @voight-trace/voighttrace-sdk
# or
pnpm add @voight-trace/voighttrace-sdk
```

---

### 2. Next.js Integration (App Router & Pages Router)

In Next.js, create or edit `middleware.ts` (or `middleware.js`) in your project root or `src/` directory:

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { VoightTraceCollector } from '@voight-trace/voighttrace-sdk';

const tracker = new VoightTraceCollector({
  apiKey: process.env.VOIGHT_TRACE_API_KEY, // e.g. "vt_live_9a8f4c2e..."
  siteId: process.env.VOIGHT_TRACE_SITE_ID   // e.g. "018f2d5e-7a91..."
});

// Non-blocking Next.js middleware wrapper (zero latency impact)
export const middleware = tracker.nextMiddleware(async (request: NextRequest) => {
  // Your custom routing or auth logic here
  return NextResponse.next();
});

// Match all requests except static files, images and favicon
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
```

---

### 3. Express.js Integration

```javascript
import express from 'express';
import { VoightTraceCollector } from '@voight-trace/voighttrace-sdk';

const app = express();

const tracker = new VoightTraceCollector({
  apiKey: process.env.VOIGHT_TRACE_API_KEY,
  siteId: process.env.VOIGHT_TRACE_SITE_ID
});

// Register non-blocking middleware BEFORE your route handlers
app.use(tracker.middleware());

app.get('/pricing', (req, res) => {
  res.json({ plan: 'enterprise', price: 499 });
});

app.listen(3000, () => {
  console.log('App running on port 3000 with Voight Trace active.');
});
```

---

### 4. Fastify Integration

```javascript
import Fastify from 'fastify';
import { VoightTraceCollector } from '@voight-trace/voighttrace-sdk';

const fastify = Fastify({ logger: true });

const tracker = new VoightTraceCollector({
  apiKey: process.env.VOIGHT_TRACE_API_KEY,
  siteId: process.env.VOIGHT_TRACE_SITE_ID
});

// Register Fastify plugin hook
fastify.register(tracker.fastifyPlugin());

fastify.get('/products', async (request, reply) => {
  return { status: 'active', items: ['SaaS', 'API'] };
});

fastify.listen({ port: 3000 });
```

---

### 5. NestJS Integration

In NestJS, apply the middleware in your root `AppModule` using `NestModule`:

```typescript
// app.module.ts
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { VoightTraceCollector } from '@voight-trace/voighttrace-sdk';

const tracker = new VoightTraceCollector({
  apiKey: process.env.VOIGHT_TRACE_API_KEY,
  siteId: process.env.VOIGHT_TRACE_SITE_ID
});

@Module({
  imports: [],
  controllers: [],
  providers: []
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(tracker.middleware())
      .forRoutes('*');
  }
}
```

---

### 6. Hono Integration (Node.js, Deno & Edge)

```typescript
import { Hono } from 'hono';
import { VoightTraceCollector } from '@voight-trace/voighttrace-sdk';

const app = new Hono();

const tracker = new VoightTraceCollector({
  apiKey: process.env.VOIGHT_TRACE_API_KEY,
  siteId: process.env.VOIGHT_TRACE_SITE_ID
});

// Register non-blocking Hono middleware
app.use('*', tracker.honoMiddleware());

app.get('/api/health', (c) => c.json({ status: 'healthy' }));

export default app;
```

---

### 7. Koa Integration

```javascript
import Koa from 'koa';
import { VoightTraceCollector } from '@voight-trace/voighttrace-sdk';

const app = new Koa();

const tracker = new VoightTraceCollector({
  apiKey: process.env.VOIGHT_TRACE_API_KEY,
  siteId: process.env.VOIGHT_TRACE_SITE_ID
});

// Register Koa middleware
app.use(tracker.koaMiddleware());

app.use(async (ctx) => {
  ctx.body = { message: 'Hello from Koa with Voight Trace active' };
});

app.listen(3000);
```

---

### 8. Configuration Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `apiKey` | `string` | `process.env.VOIGHT_TRACE_API_KEY` | **Required.** Secret Ingestion Key (`vt_live_...` or `vt_test_...`). |
| `siteId` | `string` | `process.env.VOIGHT_TRACE_SITE_ID` | **Required.** Site ID registered in the Voight dashboard. |
| `tenantId` | `string` | `siteId` | Optional tenant UUID. |
| `ingestUrl` | `string` | `https://api.voighttrace.com/api/v1/ingestion/events` | Custom Ingestion API URL. |
| `batchSize` | `number` | `20` | Max events before triggering an immediate flush. |
| `flushIntervalMs` | `number` | `3000` | Timer interval to flush queued events. |
| `sampleRate` | `number` | `1.0` | Sampling rate between `0.0` (0%) and `1.0` (100%). |
| `debug` | `boolean` | `false` | Enables diagnostic logs to stdout. |
| `disabled` | `boolean` | `false` | Disables telemetry collection (useful in testing). |

---

## 🔒 Privacy & Security by Design (Header & Credential Sanitization)

To ensure maximum security and strict compliance with global privacy regulations (GDPR, LGPD) and enterprise SOC2 audits, **`voighttrace-sdk` enforces a strict Header Allowlist policy (`SAFE_AUDIT_HEADERS`)**. 

The collector **never** collects, stores, or transmits client credentials, session tokens, or sensitive authentication headers.

### 🚫 Prohibited Headers — NEVER Collected
Any request header capable of carrying private credentials or personally identifiable authentication tokens is **strictly filtered out at the collector layer**:
* ❌ `Authorization` / `Proxy-Authorization` (Bearer tokens, JWTs, Basic Auth)
* ❌ `Cookie` / `Set-Cookie` (User sessions, auth cookies, tracking identifiers)
* ❌ `X-Api-Key` / `Api-Key` / `X-Auth-Token` / `X-Access-Token` (Customer private API keys)
* ❌ Passwords, custom secret headers, or private payload bodies

### ✅ Permitted Headers (`SAFE_AUDIT_HEADERS`)
Only standardized, technical context headers strictly required for AI crawler classification, browser architecture detection, and content negotiation are extracted:
* **Core AI & Traffic Identification:** `user-agent` (identifies AI crawlers & LLM agents), `referer` (detects human referrals from ChatGPT, Claude, Perplexity), `host`, `origin`
* **Content Negotiation:** `accept`, `accept-encoding`, `accept-language`, `content-type`
* **Client Hints (Browser Architecture & Device Detection):** `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `sec-ch-ua-platform-version`, `sec-ch-ua-model`, `sec-ch-ua-arch`
* **Browser Request Metadata:** `sec-fetch-dest`, `sec-fetch-mode`, `sec-fetch-site`, `sec-fetch-user`

### 🔍 How to Audit in Code
The allowlist and sanitization logic are deliberately centralized and exported for transparent security inspection:
* **Allowlist Constant:** `export const SAFE_AUDIT_HEADERS` in [`index.js`](./index.js) (Line 20)
* **Sanitizer Function:** `export function filterSafeHeaders(headers)` in [`index.js`](./index.js) (Line 45)
* Every framework adapter (`Express`, `Fastify`, `Next.js`, `Koa`, `Hono`) routes request headers through this function before enqueueing telemetry.

---

## ⚡ Non-Blocking Guarantee & Performance
- **Zero Latency Impact:** Observations are queued in-memory and dispatched in background batches via `res.on('finish')`.
- **Fault-Tolerant:** If the Voight ingestion server or network is temporarily unreachable, events are retried with an in-memory ceiling to prevent memory leaks.
- **Fail-Safe:** Telemetry collection errors never interrupt or delay the client's HTTP response.
