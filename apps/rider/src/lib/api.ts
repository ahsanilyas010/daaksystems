import { enqueueAction, isNetworkError, listQueuedActions, removeQueuedAction } from "./offlineQueue";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("daak_rider_token");
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? "request failed", res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};

/** Submit a pick/deliver action; if the network itself is unreachable,
 *  queue it for later instead of surfacing an error to the rider. */
export async function submitOrQueue(
  kind: "pick" | "deliver",
  shipmentId: number,
  payload: unknown
): Promise<{ queued: boolean }> {
  const path = kind === "pick" ? `/rider-app/shipments/${shipmentId}/pick` : `/rider-app/shipments/${shipmentId}/deliver`;
  try {
    await api.post(path, payload);
    return { queued: false };
  } catch (err) {
    if (isNetworkError(err) || !navigator.onLine) {
      await enqueueAction({ kind, shipmentId, payload });
      return { queued: true };
    }
    throw err;
  }
}

// Multiple triggers can ask for a flush close together (mount effect, the
// 'online' event, a manual retry button) — without this guard two
// concurrent calls would both read the same pending action before either
// removes it, and submit it twice. Only one flush actually runs at a time;
// later callers just await the one already in flight.
let flushInFlight: Promise<number> | null = null;

export function flushQueue(onProgress?: (remaining: number) => void): Promise<number> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush(onProgress).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function doFlush(onProgress?: (remaining: number) => void): Promise<number> {
  const actions = await listQueuedActions();
  let flushed = 0;
  for (const action of actions) {
    const path = action.kind === "pick"
      ? `/rider-app/shipments/${action.shipmentId}/pick`
      : `/rider-app/shipments/${action.shipmentId}/deliver`;
    try {
      await api.post(path, action.payload);
      await removeQueuedAction(action.id);
      flushed += 1;
      onProgress?.(actions.length - flushed);
    } catch (err) {
      if (isNetworkError(err)) break; // still offline — stop, try again next time
      await removeQueuedAction(action.id); // server rejected it — don't retry forever
    }
  }
  return flushed;
}
