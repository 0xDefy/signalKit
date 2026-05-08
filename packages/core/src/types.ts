export type PrivacyMode = "metadata_only" | "allow_content" | "strict";
export type SchemaMode = "compact" | "readable";

export type SignalEvent = {
  type: string;
  timestamp: number;
  sessionId: string;
  userId?: string;
  anonymousId?: string;
  payload: Record<string, unknown>;
};

export type ReadableBatch = {
  v: 1;
  appId: string;
  publicKey?: string;
  sessionId: string;
  events: SignalEvent[];
};

export type CompactBatch = {
  v: 1;
  a: string;
  k?: string;
  s: string;
  e: CompactEvent[];
  d: CompactDictionary;
};

export type CompactEvent = [typeCode: string, timestamp: number, payload: unknown[]];

export type CompactDictionary = {
  eventTypes: Record<string, string>;
  actions?: Record<string, string>;
  statuses?: Record<string, string>;
  outcomes?: Record<string, string>;
  metadata?: string[];
  payloadKeys?: Record<string, string[]>;
};

export type EncodedBatch = ReadableBatch | CompactBatch;

export type SignalPreview = {
  event: SignalEvent;
  encodedBatch: EncodedBatch;
  privacy: PrivacyMode;
  schemaMode: SchemaMode;
};

export type SignalKitTransport = {
  send(batch: EncodedBatch): Promise<void>;
};

export type SignalKitPluginContext = {
  emit(type: string, payload: Record<string, unknown>): void;
  getConfig(): Readonly<RequiredSignalKitConfig>;
};

export type SignalKitPlugin = {
  name: string;
  setup(ctx: SignalKitPluginContext): Record<string, unknown> | void;
};

export type SignalKitConfig = {
  appId: string;
  publicKey?: string;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  privacy?: PrivacyMode;
  schemaMode?: SchemaMode;
  sampleRate?: number;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  plugins?: SignalKitPlugin[];
  transport: SignalKitTransport;
  debug?: boolean;
};

export type RequiredSignalKitConfig = SignalKitConfig & {
  privacy: PrivacyMode;
  schemaMode: SchemaMode;
  sampleRate: number;
  flushIntervalMs: number;
  maxBatchSize: number;
  maxQueueSize: number;
  plugins: SignalKitPlugin[];
  debug: boolean;
  sessionId: string;
};

export type DecodedEvent = SignalEvent & {
  appId?: string;
  publicKey?: string;
};
