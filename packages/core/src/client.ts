import { encodeCompactBatch, encodeReadableBatch } from "./encoding.js";
import { sanitizePayload, sanitizeUserId } from "./privacy.js";
import type {
  EncodedBatch,
  RequiredSignalKitConfig,
  SignalEvent,
  SignalKitConfig,
  SignalKitPluginContext
} from "./types.js";

type ClientApi = Record<string, unknown>;

export class SignalKitClient {
  private readonly config: RequiredSignalKitConfig;
  private readonly queue: SignalEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private flushing: Promise<void> | undefined;

  constructor(config: SignalKitConfig) {
    this.config = normalizeConfig(config);
    this.installPlugins();

    if (this.config.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.config.flushIntervalMs);
    }
  }

  emit(type: string, payload: Record<string, unknown>): void {
    if (!shouldSample(this.config.sampleRate)) return;

    const event: SignalEvent = {
      type,
      timestamp: Date.now(),
      sessionId: this.config.sessionId,
      userId: sanitizeUserId(this.config.userId, this.config.privacy),
      anonymousId: this.config.anonymousId,
      payload: sanitizePayload(payload, this.config.privacy) as Record<string, unknown>
    };

    if (event.userId === undefined) delete event.userId;
    if (!event.anonymousId) delete event.anonymousId;

    if (this.queue.length >= this.config.maxQueueSize) {
      this.queue.shift();
      this.log("SignalKit queue limit reached; dropped oldest event.");
    }

    this.queue.push(event);

    if (this.queue.length >= this.config.maxBatchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.queue.length === 0) return;

    const events = this.queue.splice(0, this.config.maxBatchSize);
    const batch = this.encode(events);

    this.flushing = this.config.transport
      .send(batch)
      .catch((error: unknown) => {
        this.queue.unshift(...events);
        this.trimQueue();
        this.log("SignalKit flush failed", error);
        throw error;
      })
      .finally(() => {
        this.flushing = undefined;
      });

    return this.flushing;
  }

  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.flush();
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  encode(events: SignalEvent[]): EncodedBatch {
    const args = {
      appId: this.config.appId,
      publicKey: this.config.publicKey,
      sessionId: this.config.sessionId,
      events
    };
    return this.config.schemaMode === "readable" ? encodeReadableBatch(args) : encodeCompactBatch(args);
  }

  private installPlugins(): void {
    const ctx: SignalKitPluginContext = {
      emit: (type, payload) => this.emit(type, payload),
      getConfig: () => this.config
    };

    for (const plugin of this.config.plugins) {
      const api = plugin.setup(ctx);
      if (api && typeof api === "object") {
        Object.assign(this as ClientApi, api);
      }
    }
  }

  private trimQueue(): void {
    while (this.queue.length > this.config.maxQueueSize) this.queue.shift();
  }

  private log(message: string, detail?: unknown): void {
    if (!this.config.debug) return;
    if (detail) console.warn(message, detail);
    else console.warn(message);
  }
}

export const SignalKit = {
  init(config: SignalKitConfig): SignalKitClient {
    return new SignalKitClient(config);
  }
};

function normalizeConfig(config: SignalKitConfig): RequiredSignalKitConfig {
  return {
    ...config,
    privacy: config.privacy ?? "metadata_only",
    schemaMode: config.schemaMode ?? "compact",
    sampleRate: config.sampleRate ?? 1,
    flushIntervalMs: config.flushIntervalMs ?? 5000,
    maxBatchSize: config.maxBatchSize ?? 50,
    maxQueueSize: config.maxQueueSize ?? 1000,
    plugins: config.plugins ?? [],
    debug: config.debug ?? false,
    sessionId: config.sessionId ?? createSessionId()
  };
}

function shouldSample(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() <= sampleRate;
}

function createSessionId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `s_${Date.now().toString(36)}_${random}`;
}
