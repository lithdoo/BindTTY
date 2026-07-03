import { List, createApp } from "bindtty";
import { computed, createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";

interface LogLine {
  id: number;
  message: string;
}

const logs = createSignal<readonly LogLine[]>([
  { id: 1, message: "[info] Server started" },
  { id: 2, message: "[info] Listening on :8080" },
  { id: 3, message: "[warn] Cache miss for /api/users" },
  { id: 4, message: "[info] GET /api/users 200 12ms" },
  { id: 5, message: "[info] GET /api/health 200 1ms" },
  { id: 6, message: "[error] Connection reset by peer" },
  { id: 7, message: "[info] Retrying upstream request" },
  { id: 8, message: "[info] GET /api/users 200 45ms" },
  { id: 9, message: "[debug] Flushed 3 write batches" },
  { id: 10, message: "[info] Shutdown signal received" },
  { id: 11, message: "[info] Draining active connections" },
  { id: 12, message: "[warn] Slow query on /api/orders 820ms" },
  { id: 13, message: "[info] GET /api/orders 200 34ms" },
  { id: 14, message: "[error] Upstream timeout after 30s" },
  { id: 15, message: "[info] Circuit breaker opened for billing" },
  { id: 16, message: "[info] Circuit breaker half-open" },
  { id: 17, message: "[info] POST /api/payments 201 88ms" },
  { id: 18, message: "[debug] Rebuilt search index segment 4" },
  { id: 19, message: "[info] Worker pool scaled to 6" },
  { id: 20, message: "[info] Graceful shutdown complete" }
]);
const offset = createSignal(0);
const header = computed(
  () => `Log Viewer  offset=${offset.get()}  (arrow keys to scroll)`
);

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true
});

const app = createApp(
  <vstack>
    <text value={header} bold />
    <List
      height={6}
      items={logs}
      offset={offset}
      getKey={(line) => (line as LogLine).id}
      render={(line) => <text value={(line as LogLine).message} />}
      onOffsetChange={(nextOffset) => {
        offset.set(nextOffset);
      }}
    />
  </vstack>,
  { terminal }
);

app.start();
