import crypto from 'node:crypto';

/**
 * ============================================================================
 * SECURITY & PRIVACY AUDIT: ALLOWLISTED SAFE HEADERS
 * ============================================================================
 * Under ZERO circumstances does Voight Trace capture sensitive client headers.
 *
 * EXPLICITLY FORBIDDEN / NEVER COLLECTED:
 * - authorization / proxy-authorization (Bearer tokens, JWTs, Basic Auth)
 * - cookie / set-cookie (Session identifiers, tracking cookies)
 * - x-api-key / api-key / x-auth-token / x-access-token
 * - any custom credentials, secrets, or password headers
 *
 * ONLY the following deterministic, non-sensitive headers strictly necessary
 * for AI bot classification, client hints, content negotiation, and routing
 * are extracted. All others are completely filtered out at the collector level.
 */
export const SAFE_AUDIT_HEADERS = Object.freeze([
  'accept',
  'accept-encoding',
  'accept-language',
  'content-type',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-ch-ua-platform-version',
  'sec-ch-ua-model',
  'sec-ch-ua-arch',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user'
]);

/**
 * Extracts ONLY safe, allowlisted headers from an incoming headers structure.
 * Guaranteed to never capture authorization tokens, cookies, or credentials.
 *
 * @param {Object|Headers|Map} headers - Incoming HTTP request headers
 * @returns {Record<string, string>} Sanitized allowlisted headers
 */
export function filterSafeHeaders(headers) {
  if (!headers) return {};
  const filtered = {};

  // Fetch API / Web Standard Headers instance (e.g. Next.js, Fetch, Hono)
  if (typeof headers.get === 'function') {
    for (const name of SAFE_AUDIT_HEADERS) {
      const val = headers.get(name);
      if (val) filtered[name] = val;
    }
    return filtered;
  }

  // Node.js / Express / Fastify / Koa headers object
  for (const name of SAFE_AUDIT_HEADERS) {
    const val = headers[name];
    if (val !== undefined && val !== null && val !== '') {
      filtered[name] = Array.isArray(val) ? val.join(', ') : String(val);
    }
  }
  return filtered;
}

/**
 * Voight Trace — Official Voight Trace SDK Collector
 * Package: @voight-trace/voighttrace-sdk
 * Reference: docs/technical/03_service_spec_trace_and_ingestion.md
 *
 * Lightweight, non-blocking telemetry collector for Node.js backends, Express, Fastify, and Next.js.
 * Operates with asynchronous batching and never degrades host application latency or stability.
 */
export class VoightTraceCollector {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Voight Trace API Key (starts with vt_live_ or vt_test_)
   * @param {string} config.siteId - UUID or site identifier registered in the Voight dashboard
   * @param {string} [config.tenantId] - Optional tenant UUID (defaults to siteId if omitted)
   * @param {string} [config.collectorId] - Custom collector instance ID (generated automatically if omitted)
   * @param {string} [config.ingestUrl] - Custom Ingestion API endpoint
   * @param {number} [config.batchSize=20] - Maximum number of observations dispatched per HTTP batch
   * @param {number} [config.flushIntervalMs=3000] - Interval between automatic queue flushes in milliseconds
   * @param {number} [config.sampleRate=1.0] - Sampling rate between 0.0 (0%) and 1.0 (100%)
   * @param {boolean} [config.debug=false] - Enables diagnostic logging to stdout
   * @param {boolean} [config.disabled=false] - Disables collection completely (useful for local unit tests)
   */
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.VOIGHT_TRACE_API_KEY || '';
    this.siteId = config.siteId || process.env.VOIGHT_TRACE_SITE_ID || '';
    this.tenantId = config.tenantId || process.env.VOIGHT_TRACE_TENANT_ID || this.siteId || 'default_tenant';
    this.collectorId = config.collectorId || process.env.VOIGHT_TRACE_COLLECTOR_ID || `collector_${crypto.randomUUID().slice(0, 8)}`;
    this.ingestUrl = config.ingestUrl || process.env.VOIGHT_TRACE_INGEST_URL || 'https://api.voighttrace.com/api/v1/ingestion/events';
    this.batchSize = Number(config.batchSize || 20);
    this.flushIntervalMs = Number(config.flushIntervalMs || 3000);
    this.sampleRate = typeof config.sampleRate === 'number' ? config.sampleRate : 1.0;
    this.debug = Boolean(config.debug || process.env.VOIGHT_TRACE_DEBUG === 'true');
    this.disabled = Boolean(config.disabled || process.env.VOIGHT_TRACE_DISABLED === 'true');

    this.queue = [];
    this.timer = null;
    this.isFlushing = false;

    // Validate required credentials
    if (!this.disabled && !this.apiKey) {
      console.warn('[Voight Trace SDK] Warning: VOIGHT_TRACE_API_KEY is not configured. Telemetry is paused.');
    }
    if (!this.disabled && !this.siteId) {
      console.warn('[Voight Trace SDK] Warning: VOIGHT_TRACE_SITE_ID is not configured. Telemetry is paused.');
    }

    // Start background flush timer if active
    if (!this.disabled && this.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.flush().catch((err) => {
          if (this.debug) console.error('[Voight Trace SDK Timer Error]', err.message);
        });
      }, this.flushIntervalMs);

      // unref allows Node to exit naturally without waiting for the timer
      if (this.timer && typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }

    // Register process termination handlers to flush in-flight observations
    if (typeof process !== 'undefined' && typeof process.once === 'function') {
      process.once('beforeExit', () => {
        if (this.queue.length > 0) {
          this.flush().catch(() => {});
        }
      });
    }
  }

  /**
   * Express / Connect / Morgan compatible HTTP middleware
   * Usage: app.use(tracker.middleware());
   */
  middleware() {
    return (req, res, next) => {
      if (this.disabled || !this.apiKey || !this.siteId) {
        return next();
      }

      // Check sampling rate
      if (this.sampleRate < 1.0 && Math.random() > this.sampleRate) {
        return next();
      }

      const startTime = Date.now();

      // Manage and propagate correlation ID
      let correlationId = req.headers['x-voight-trace-correlation-id'];
      if (!correlationId) {
        correlationId = `vgt_${crypto.randomUUID()}`;
        req.headers['x-voight-trace-correlation-id'] = correlationId;
      }
      res.setHeader('x-voight-trace-correlation-id', correlationId);

      // Hook into response finish event for zero-latency impact on response time
      res.on('finish', () => {
        try {
          const durationMs = Date.now() - startTime;
          const host = (req.headers['host'] || req.hostname || 'localhost').split(':')[0];
          const referer = req.headers['referer'] || '';
          const userAgent = req.headers['user-agent'] || '';

          // Determine client IP safely
          const clientIp =
            req.headers['cf-connecting-ip'] ||
            req.headers['x-real-ip'] ||
            (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
            req.socket?.remoteAddress ||
            '127.0.0.1';

          // Allowlisted headers only (security & privacy — audit safe)
          const selectedHeaders = filterSafeHeaders(req.headers);

          // Parse normalized path and clean query parameters
          const rawUrl = req.originalUrl || req.url || '/';
          const [pathname, queryString] = rawUrl.split('?');
          const queryParams = req.query || this._parseQueryString(queryString);

          const observationId = crypto.randomUUID();
          const eventId = crypto.randomUUID();

          const payload = {
            event_id: eventId,
            event_type: 'http.request',
            schema_version: 1,
            tenant_id: this.tenantId,
            site_id: this.siteId,
            collector_id: this.collectorId,
            collector_type: 'nodejs_sdk',
            observation_id: observationId,
            request_id: req.headers['x-request-id'] || null,
            correlation_id: correlationId,
            occurred_at: new Date().toISOString(),
            request: {
              method: req.method ? req.method.toUpperCase() : 'GET',
              scheme: req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http',
              host,
              path: pathname || '/',
              query_params: queryParams,
              referer,
              user_agent: userAgent,
              selected_headers: selectedHeaders
            },
            network: {
              ip_hash: clientIp,
              country: (req.headers['cf-ipcountry'] || 'XX').toUpperCase(),
              asn: Number(req.headers['x-asn'] || 0)
            },
            response: {
              status_code: res.statusCode || 200,
              duration_ms: durationMs,
              bytes_sent: Number(res.getHeader('content-length') || 0)
            }
          };

          this.enqueue(payload);
        } catch (err) {
          // Never impact or compromise host application runtime (RNF-012)
          if (this.debug) {
            console.error('[Voight Trace SDK Capture Error]', err);
          }
        }
      });

      next();
    };
  }

  /**
   * Fastify Plugin integration
   * Usage: fastify.register(tracker.fastifyPlugin());
   */
  fastifyPlugin() {
    return (fastify, _opts, done) => {
      fastify.addHook('onRequest', (request, reply, next) => {
        let correlationId = request.headers['x-voight-trace-correlation-id'];
        if (!correlationId) {
          correlationId = `vgt_${crypto.randomUUID()}`;
          request.headers['x-voight-trace-correlation-id'] = correlationId;
        }
        reply.header('x-voight-trace-correlation-id', correlationId);
        request.voightStartTime = Date.now();
        next();
      });

      fastify.addHook('onResponse', (request, reply, doneHook) => {
        try {
          if (!this.disabled && this.apiKey && this.siteId) {
            const durationMs = Date.now() - (request.voightStartTime || Date.now());
            const clientIp = request.headers['cf-connecting-ip'] || request.headers['x-real-ip'] || request.ip || '127.0.0.1';
            
            const payload = {
              event_id: crypto.randomUUID(),
              event_type: 'http.request',
              schema_version: 1,
              tenant_id: this.tenantId,
              site_id: this.siteId,
              collector_id: this.collectorId,
              collector_type: 'nodejs_sdk',
              observation_id: crypto.randomUUID(),
              request_id: request.headers['x-request-id'] || null,
              correlation_id: request.headers['x-voight-trace-correlation-id'] || `vgt_${crypto.randomUUID()}`,
              occurred_at: new Date().toISOString(),
              request: {
                method: request.method,
                scheme: request.protocol,
                host: request.hostname || 'localhost',
                path: request.routerPath || request.url.split('?')[0],
                query_params: request.query || {},
                referer: request.headers['referer'] || '',
                user_agent: request.headers['user-agent'] || '',
                selected_headers: filterSafeHeaders(request.headers)
              },
              network: {
                ip_hash: clientIp,
                country: (request.headers['cf-ipcountry'] || 'XX').toUpperCase(),
                asn: 0
              },
              response: {
                status_code: reply.statusCode,
                duration_ms: durationMs,
                bytes_sent: Number(reply.getHeader('content-length') || 0)
              }
            };

            this.enqueue(payload);
          }
        } catch (err) {
          if (this.debug) console.error('[Voight Trace Fastify Error]', err);
        }
        doneHook();
      });

      done();
    };
  }

  /**
   * Next.js Middleware integration (App Router & Pages Router)
   * Usage in middleware.ts:
   * export const middleware = tracker.nextMiddleware();
   */
  nextMiddleware(customHandler) {
    return async (request, event) => {
      const startTime = Date.now();
      let correlationId = request.headers.get('x-voight-trace-correlation-id');
      if (!correlationId) {
        correlationId = `vgt_${crypto.randomUUID()}`;
      }

      // Execute custom handler if provided
      let response;
      if (typeof customHandler === 'function') {
        response = await customHandler(request, event);
      }

      // Default response fallback
      if (!response) {
        response = new Response(null, { status: 200, headers: new Headers() });
      }

      // Asynchronously queue telemetry without blocking the response
      if (!this.disabled && this.apiKey && this.siteId) {
        try {
          const durationMs = Date.now() - startTime;
          const url = new URL(request.url);
          const clientIp =
            request.headers.get('cf-connecting-ip') ||
            request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
            request.ip ||
            '127.0.0.1';

          const payload = {
            event_id: crypto.randomUUID(),
            event_type: 'http.request',
            schema_version: 1,
            tenant_id: this.tenantId,
            site_id: this.siteId,
            collector_id: this.collectorId,
            collector_type: 'nodejs_sdk',
            observation_id: crypto.randomUUID(),
            correlation_id: correlationId,
            occurred_at: new Date().toISOString(),
            request: {
              method: request.method,
              scheme: url.protocol.replace(':', ''),
              host: url.hostname,
              path: url.pathname,
              query_params: Object.fromEntries(url.searchParams.entries()),
              referer: request.headers.get('referer') || '',
              user_agent: request.headers.get('user-agent') || '',
              selected_headers: filterSafeHeaders(request.headers)
            },
            network: {
              ip_hash: clientIp,
              country: (request.headers.get('cf-ipcountry') || 'XX').toUpperCase(),
              asn: 0
            },
            response: {
              status_code: response.status || 200,
              duration_ms: durationMs,
              bytes_sent: 0
            }
          };

          this.enqueue(payload);
        } catch (err) {
          if (this.debug) console.error('[Voight Trace Next.js Error]', err);
        }
      }

      // Set correlation ID header in response
      try {
        response.headers.set('x-voight-trace-correlation-id', correlationId);
      } catch {
        // In case response headers are immutable
      }

      return response;
    };
  }

  /**
   * Koa framework middleware
   * Usage: app.use(tracker.koaMiddleware());
   */
  koaMiddleware() {
    return async (ctx, next) => {
      if (this.disabled || !this.apiKey || !this.siteId) {
        return next();
      }

      const startTime = Date.now();
      let correlationId = ctx.get('x-voight-trace-correlation-id');
      if (!correlationId) {
        correlationId = `vgt_${crypto.randomUUID()}`;
        ctx.set('x-voight-trace-correlation-id', correlationId);
      }

      await next();

      try {
        const durationMs = Date.now() - startTime;
        const clientIp = ctx.get('cf-connecting-ip') || ctx.get('x-forwarded-for')?.split(',')[0].trim() || ctx.ip || '127.0.0.1';

        const payload = {
          event_id: crypto.randomUUID(),
          event_type: 'http.request',
          schema_version: 1,
          tenant_id: this.tenantId,
          site_id: this.siteId,
          collector_id: this.collectorId,
          collector_type: 'nodejs_sdk',
          observation_id: crypto.randomUUID(),
          correlation_id: correlationId,
          occurred_at: new Date().toISOString(),
          request: {
            method: ctx.method,
            scheme: ctx.protocol,
            host: ctx.host.split(':')[0],
            path: ctx.path,
            query_params: ctx.query || {},
            referer: ctx.get('referer') || '',
            user_agent: ctx.get('user-agent') || '',
            selected_headers: filterSafeHeaders(ctx.headers || ctx.header)
          },
          network: {
            ip_hash: clientIp,
            country: (ctx.get('cf-ipcountry') || 'XX').toUpperCase(),
            asn: 0
          },
          response: {
            status_code: ctx.status || 200,
            duration_ms: durationMs,
            bytes_sent: Number(ctx.length || 0)
          }
        };

        this.enqueue(payload);
      } catch (err) {
        if (this.debug) console.error('[Voight Trace Koa Error]', err);
      }
    };
  }

  /**
   * Hono / Web Fetch API middleware
   * Usage: app.use('*', tracker.honoMiddleware());
   */
  honoMiddleware() {
    return async (c, next) => {
      const startTime = Date.now();
      let correlationId = c.req.header('x-voight-trace-correlation-id');
      if (!correlationId) {
        correlationId = `vgt_${crypto.randomUUID()}`;
      }

      await next();

      if (!this.disabled && this.apiKey && this.siteId) {
        try {
          const durationMs = Date.now() - startTime;
          const url = new URL(c.req.url);
          const clientIp = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

          const payload = {
            event_id: crypto.randomUUID(),
            event_type: 'http.request',
            schema_version: 1,
            tenant_id: this.tenantId,
            site_id: this.siteId,
            collector_id: this.collectorId,
            collector_type: 'nodejs_sdk',
            observation_id: crypto.randomUUID(),
            correlation_id: correlationId,
            occurred_at: new Date().toISOString(),
            request: {
              method: c.req.method,
              scheme: url.protocol.replace(':', ''),
              host: url.hostname,
              path: url.pathname,
              query_params: Object.fromEntries(url.searchParams.entries()),
              referer: c.req.header('referer') || '',
              user_agent: c.req.header('user-agent') || '',
              selected_headers: filterSafeHeaders(c.req.raw?.headers || c.req.header())
            },
            network: {
              ip_hash: clientIp,
              country: (c.req.header('cf-ipcountry') || 'XX').toUpperCase(),
              asn: 0
            },
            response: {
              status_code: c.res.status || 200,
              duration_ms: durationMs,
              bytes_sent: 0
            }
          };

          this.enqueue(payload);
        } catch (err) {
          if (this.debug) console.error('[Voight Trace Hono Error]', err);
        }
      }

      c.res.headers.set('x-voight-trace-correlation-id', correlationId);
    };
  }

  /**
   * Enqueues an observation into the in-memory buffer
   * @param {Object} event
   */
  enqueue(event) {
    this.queue.push(event);

    if (this.debug) {
      console.log(`[Voight Trace SDK] Enqueued observation: ${event.request.method} ${event.request.path} (Queue: ${this.queue.length})`);
    }

    if (this.queue.length >= this.batchSize) {
      this.flush().catch((err) => {
        if (this.debug) console.error('[Voight Trace SDK Batch Flush Error]', err);
      });
    }
  }

  /**
   * Dispatches pending observations to the Ingestion API
   */
  async flush() {
    if (this.queue.length === 0 || !this.apiKey || this.isFlushing) {
      return;
    }

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.batchSize);

    try {
      if (this.debug) {
        console.log(`[Voight Trace SDK] Dispatching batch of ${batch.length} events to ${this.ingestUrl}`);
      }

      const response = await fetch(this.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'x-voight-collector-type': 'nodejs_sdk',
          'x-voight-collector-version': '2.4.0'
        },
        body: JSON.stringify({ events: batch })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Voight Trace SDK] Ingestion rejected HTTP ${response.status}: ${errorText}`);
      } else if (this.debug) {
        const result = await response.json();
        console.log(`[Voight Trace SDK] Batch accepted successfully:`, result);
      }
    } catch (err) {
      // Re-queue in case of transient network failure (up to 200 items max to prevent memory leaks)
      if (this.queue.length < 200) {
        this.queue.unshift(...batch);
      }
      if (this.debug) {
        console.error('[Voight Trace SDK Network Error]', err.message);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Stops the background timer and flushes any pending queue items
   */
  async shutdown() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  _parseQueryString(queryString) {
    if (!queryString) return {};
    const params = {};
    const pairs = queryString.split('&');
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
    return params;
  }
}

export default VoightTraceCollector;
