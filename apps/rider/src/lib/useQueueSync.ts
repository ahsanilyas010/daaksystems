import { useCallback, useEffect, useState } from "react";
import { flushQueue } from "./api";
import { listQueuedActions } from "./offlineQueue";

export function useQueueSync() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(() => {
    listQueuedActions().then((actions) => setPendingCount(actions.length));
  }, []);

  const flushNow = useCallback(async () => {
    await flushQueue();
    refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    refreshCount();
    function onOnline() {
      setOnline(true);
      flushNow();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (navigator.onLine) flushNow();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { online, pendingCount, flushNow };
}
