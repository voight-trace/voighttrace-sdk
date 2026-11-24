/**
 * List of allowlisted, non-sensitive headers extracted by Voight Trace.
 * Sensitive headers (Authorization, Cookie, X-Api-Key) are strictly excluded.
 */
export declare const SAFE_AUDIT_HEADERS: readonly string[];

/**
 * Extracts only safe, allowlisted headers from an incoming headers object or Headers instance.
 */
export declare function filterSafeHeaders(headers: any): Record<string, string>;

export interface VoightTraceConfig {
  /**
   * Voight Trace Ingestion API Key (starts with vt_live_ or vt_test_)
   */
  apiKey: string;

  /**
   * Site UUID registered in the Voight dashboard
   */
  siteId: string;

  /**
   * Tenant UUID (defaults to siteId if omitted)
   */
  tenantId?: string;

  /**
   * Custom collector instance identifier
   */
  collectorId?: string;

  /**
   * Ingestion endpoint URL (defaults to https://voighttrace.vercel.app/api/v1/ingestion/events)
   */
  ingestUrl?: string;

  /**
   * Maximum events per HTTP dispatch (default: 20)
   */
  batchSize?: number;

  /**
   * Queue flush interval in milliseconds (default: 3000)
   */
  flushIntervalMs?: number;

  /**
   * Sampling rate between 0.0 (0%) and 1.0 (100%) (default: 1.0)
   */
  sampleRate?: number;

  /**
   * Enable verbose diagnostic logging
   */
  debug?: boolean;

  /**
   * Disable telemetry collection entirely
   */
  disabled?: boolean;
}

export interface TelemetryEvent {
  event_id: string;
  event_type: string;
  schema_version: number;
  tenant_id: string;
  site_id: string;
  collector_id: string;
  collector_type: 'nodejs_sdk';
  observation_id: string;
  correlation_id: string;
  occurred_at: string;
  request: {
    method: string;
    scheme: string;
    host: string;
    path: string;
    query_params: Record<string, any>;
    referer: string;
    user_agent: string;
    selected_headers: Record<string, string>;
  };
  network: {
    ip_hash: string;
    country: string;
    asn: number;
  };
  response: {
    status_code: number;
    duration_ms: number;
    bytes_sent: number;
  };
}

export declare class VoightTraceCollector {
  constructor(config?: VoightTraceConfig);

  /**
   * Standard Express / Connect / Morgan middleware
   */
  middleware(): (req: any, res: any, next: (err?: any) => void) => void;

  /**
   * Fastify plugin hook
   */
  fastifyPlugin(): (fastify: any, opts: any, done: (err?: any) => void) => void;

  /**
   * Next.js Middleware wrapper (App Router & Pages Router)
   */
  nextMiddleware(customHandler?: (request: any, event?: any) => Promise<any> | any): (request: any, event?: any) => Promise<any>;

  /**
   * Koa framework middleware
   */
  koaMiddleware(): (ctx: any, next: () => Promise<any>) => Promise<void>;

  /**
   * Hono / Web Standard Fetch middleware
   */
  honoMiddleware(): (c: any, next: () => Promise<void>) => Promise<void>;

  /**
   * Directly enqueues an event observation
   */
  enqueue(event: TelemetryEvent): void;

  /**
   * Flushes in-flight observations to the Ingestion API
   */
  flush(): Promise<void>;

  /**
   * Cleans up timers and flushes all pending events
   */
  shutdown(): Promise<void>;
}

export default VoightTraceCollector;
