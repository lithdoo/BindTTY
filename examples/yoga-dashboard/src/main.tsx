import os from "node:os";

import { Button, List, createApp } from "bindtty";
import { computed, createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";

interface RuntimeStats {
  timestamp: Date;
  uptimeSeconds: number;
  processCpuPercent: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  systemUsedBytes: number;
  systemTotalBytes: number;
  cpuCount: number;
  nodeVersion: string;
  platform: string;
  arch: string;
}

interface EventLine {
  id: number;
  message: string;
}

function createRuntimeSampler(): () => RuntimeStats {
  let previousCpuUsage = process.cpuUsage();
  let previousTime = Date.now();

  return () => {
    const currentTime = Date.now();
    const cpuUsage = process.cpuUsage(previousCpuUsage);
    const elapsedMicros = Math.max(1, (currentTime - previousTime) * 1000);
    const processCpuPercent =
      ((cpuUsage.user + cpuUsage.system) / elapsedMicros) * 100;
    const memory = process.memoryUsage();
    const systemTotalBytes = os.totalmem();
    const systemFreeBytes = os.freemem();

    previousCpuUsage = process.cpuUsage();
    previousTime = currentTime;

    return {
      timestamp: new Date(currentTime),
      uptimeSeconds: process.uptime(),
      processCpuPercent,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      systemUsedBytes: systemTotalBytes - systemFreeBytes,
      systemTotalBytes,
      cpuCount: os.cpus().length,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  };
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return [
    hours,
    minutes.toString().padStart(2, "0"),
    remainingSeconds.toString().padStart(2, "0")
  ].join(":");
}

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

function createEventMessage(stats: RuntimeStats): string {
  return [
    `[${formatTime(stats.timestamp)}]`,
    `cpu=${formatPercent(stats.processCpuPercent)}`,
    `heap=${formatBytes(stats.heapUsedBytes)}`,
    `rss=${formatBytes(stats.rssBytes)}`,
    `system=${formatBytes(stats.systemUsedBytes)}`
  ].join(" ");
}

const readRuntimeStats = createRuntimeSampler();
const stats = createSignal(readRuntimeStats());
const logs = createSignal<readonly EventLine[]>([
  {
    id: 1,
    message: createEventMessage(stats.get())
  }
]);
const offset = createSignal(0);
const showSidebar = createSignal(true);
let nextLogId = 2;

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true
});

const title = computed(
  () =>
    `BindTTY Yoga Runtime Monitor  ${terminal.viewport.width}x${terminal.viewport.height}`
);
const subtitle = computed(() => {
  const current = stats.get();

  return [
    current.nodeVersion,
    current.platform,
    current.arch,
    `uptime ${formatDuration(current.uptimeSeconds)}`
  ].join("  ");
});
const sidebarLabel = computed(() =>
  showSidebar.get() ? "Hide sidebar" : "Show sidebar"
);
const memorySummary = computed(() => {
  const current = stats.get();

  return `${formatBytes(current.systemUsedBytes)} / ${formatBytes(current.systemTotalBytes)}`;
});
const heapSummary = computed(() => {
  const current = stats.get();

  return `${formatBytes(current.heapUsedBytes)} / ${formatBytes(current.heapTotalBytes)}`;
});
const processCpuSummary = computed(() =>
  formatPercent(stats.get().processCpuPercent)
);
const rssSummary = computed(() => formatBytes(stats.get().rssBytes));
const environmentSummary = computed(() => {
  const current = stats.get();

  return [
    `CPU cores: ${current.cpuCount}`,
    `PID: ${process.pid}`,
    `cwd: ${process.cwd()}`,
    "Resize the terminal to watch Yoga recompute card wrapping and panel sizes."
  ].join("  ");
});
const logHeader = computed(
  () => `Live events  offset=${offset.get()}  (arrow keys to scroll)`
);

function MetricCard(props: {
  label: string;
  value: string | ReturnType<typeof computed<string>>;
  detail: string;
  color?: string;
}) {
  return (
    <box width={20} flexGrow={1} flexShrink={1} padding={1} border>
      <vstack gap={1}>
        <text value={props.label} color={props.color ?? "cyan"} bold />
        <text value={props.value} />
        <text value={props.detail} wrap="truncate-end" color="gray" />
      </vstack>
    </box>
  );
}

const app = createApp(
  <screen gap={1} alignItems="stretch">
    <box padding={1} border>
      <hstack justifyContent="space-between" alignItems="center">
        <text value={title} bold color="brightCyan" />
        <text value={subtitle} color="gray" />
      </hstack>
    </box>

    <hstack gap={1} flexGrow={1} alignItems="stretch">
      <show when={showSidebar}>
        <box width={20} flexShrink={0} padding={1} border>
          <vstack gap={1}>
            <text value="Runtime" bold color="yellow" />
            <text value="Process CPU" />
            <text value="Memory" />
            <text value="Events" />
            <Button
              label={sidebarLabel}
              onPress={() => {
                showSidebar.set(!showSidebar.get());
              }}
            />
          </vstack>
        </box>
      </show>

      <box flexGrow={1} padding={1} border>
        <vstack gap={1}>
          <hstack gap={1} flexWrap="wrap" alignItems="stretch">
            <MetricCard
              label="Process CPU"
              value={processCpuSummary}
              detail="Calculated from process.cpuUsage deltas"
              color="green"
            />
            <MetricCard
              label="Heap"
              value={heapSummary}
              detail="process.memoryUsage heap"
              color="yellow"
            />
            <MetricCard
              label="RSS"
              value={rssSummary}
              detail="Resident set size"
              color="magenta"
            />
            <MetricCard
              label="System Memory"
              value={memorySummary}
              detail="os.totalmem minus os.freemem"
              color="blue"
            />
          </hstack>

          <box padding={1} border>
            <text value={environmentSummary} wrap="wrap" />
          </box>

          <text value={logHeader} bold />
          <List
            height={8}
            items={logs}
            offset={offset}
            getKey={(line) => (line as EventLine).id}
            render={(line) => (
              <text value={(line as EventLine).message} wrap="truncate-end" />
            )}
            onOffsetChange={(nextOffset) => {
              offset.set(nextOffset);
            }}
          />
        </vstack>
      </box>
    </hstack>
  </screen>,
  { terminal }
);

app.start();

const refreshTimer = setInterval(() => {
  const nextStats = readRuntimeStats();
  const nextLog: EventLine = {
    id: nextLogId,
    message: createEventMessage(nextStats)
  };

  nextLogId += 1;
  stats.set(nextStats);
  logs.set([...logs.get(), nextLog].slice(-100));
}, 1000);

let disposed = false;

function dispose(): void {
  if (disposed) {
    return;
  }

  disposed = true;
  clearInterval(refreshTimer);
  app.dispose();
}

process.once("SIGINT", () => {
  dispose();
  process.exit(0);
});
process.once("SIGTERM", () => {
  dispose();
  process.exit(0);
});
process.once("exit", dispose);
