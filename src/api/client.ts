// src/api/client.ts
import { z } from "zod";

// ----- Problem Details (RFC 9457) shape -----
export const Problem = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  // allow extra members
}).passthrough();
export type Problem = z.infer<typeof Problem>;

// ----- Helpers -----
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const backoff = (attempt: number) => {
  // exponential backoff with jitter: ~100ms, 200ms, 400ms
  const base = 100 * 2 ** attempt;
  const jitter = Math.random() * 50;
  return base + jitter;
};

export type ClientOptions = {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  requestId?: () => string;         // correlation id generator
  idempotencyKey?: () => string;    // for POST/PATCH
  totalTimeoutMs?: number;
  maxAttempts?: number;             // includes the initial try
};

export class ApiClient {
  constructor(private opts: ClientOptions) {}

  async request<T>(
    path: string,
    init: RequestInit & { schema?: z.ZodType<T> } = {}
  ): Promise<T> {
    const {
      schema, method = "GET", headers = {}, body, ...rest
    } = init;

    const max = this.opts.maxAttempts ?? 3;
    const totalTimeout = this.opts.totalTimeoutMs ?? 15000;

    // Abort if total time exceeds budget (AbortSignal.timeout is widely supported)
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort("total-timeout"), totalTimeout);

    // Common headers
    const h: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Request-ID": this.opts.requestId?.() ?? crypto.randomUUID(),
      ...(this.opts.defaultHeaders || {}),
      ...(headers as Record<string, string>),
    };

    // Idempotency for mutating calls
    const isMutation = ["POST", "PATCH"].includes(String(method).toUpperCase());
    if (isMutation) h["Idempotency-Key"] = this.opts.idempotencyKey?.() ?? crypto.randomUUID();

    let attempt = 0;
    let lastError: unknown;

    while (attempt < max) {
      try {
        const res = await fetch(this.opts.baseUrl + path, {
          method, headers: h, body, signal: controller.signal, ...rest
        });

        // Honor Retry-After for 429/503
        if (res.status === 429 || res.status === 503) {
          const retryAfter = res.headers.get("Retry-After");
          if (attempt + 1 < max) {
            const serverWait = retryAfter ? parseFloat(retryAfter) * 1000 : backoff(attempt);
            await sleep(serverWait);
            attempt++;
            continue;
          }
        }

        // Success
        if (res.ok) {
          if (res.status === 204) return undefined as T;
          const json = await res.json();
          if (schema) return schema.parse(json);
          return json as T;
        }

        // Try to parse Problem Details
        const maybeProblem = await res
          .clone()
          .json()
          .catch(() => null);

        if (maybeProblem) {
          const problem = Problem.safeParse(maybeProblem).success
            ? (maybeProblem as Problem)
            : ({ title: res.statusText, status: res.status } as Problem);

          // Do not retry on 4xx except 429
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw Object.assign(new Error(problem.title ?? "Request failed"), { problem, status: res.status });
          }
        }

        // For 5xx: retry if attempts remain
        if (res.status >= 500 && attempt + 1 < max) {
          await sleep(backoff(attempt));
          attempt++;
          continue;
        }

        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      } catch (e) {
        lastError = e;
        // Retry network/timeout errors if attempts remain
        if (attempt + 1 < max && (e as any).name !== "AbortError") {
          await sleep(backoff(attempt));
          attempt++;
          continue;
        }
        clearTimeout(to);
        throw e;
      }
    }

    clearTimeout(to);
    throw lastError;
  }
}