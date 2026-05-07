import type { EncodedBatch, SignalKitTransport } from "@signalkit/core";

export type FetchTransportOptions = {
  endpoint: string;
  headers?: Record<string, string>;
  retries?: number;
};

export function fetchTransport(options: FetchTransportOptions): SignalKitTransport {
  const retries = options.retries ?? 2;

  return {
    async send(batch: EncodedBatch): Promise<void> {
      const body = JSON.stringify(batch);

      if (canUseBeacon() && isPageUnloading()) {
        const blob = new Blob([body], { type: "application/json" });
        const sent = navigator.sendBeacon(options.endpoint, blob);
        if (sent) return;
      }

      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const response = await fetch(options.endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...options.headers
            },
            body
          });

          if (!response.ok) throw new Error(`SignalKit ingest failed with ${response.status}`);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < retries) await sleep(100 * 2 ** attempt);
        }
      }

      throw lastError;
    }
  };
}

function canUseBeacon(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function";
}

function isPageUnloading(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
