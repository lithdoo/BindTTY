import { computed, createApp, createSignal } from "bindtty";
import { Button, Textarea } from "@bindtty/widgets";
import { createNodeTerminal } from "@bindtty/terminal";

/**
 * Manual Textarea playground.
 *
 * Two scenes share the same `value` so soft wrap / caret stay comparable.
 * They only differ in how remaining width is obtained:
 * - Scene A: Textarea itself uses flexGrow in an hstack next to a prompt
 * - Scene B: an outer flexGrow box wraps Textarea (equivalent width intake)
 *
 * Borders/padding below are chrome only — Textarea itself has no border.
 *
 * Run from repo root (real TTY required):
 *   npm start --workspace @bindtty/example-textarea
 *
 * Keys:
 *   Tab / Shift+Tab  focus next / previous
 *   type / Enter     edit / soft+hard wrap
 *   Ctrl+Enter       submit current value
 *   Ctrl+C           quit
 */

const prompt = createSignal("> ");
const value = createSignal(
  "Paste or type a long line here to verify soft wrap fills the remaining width after the prompt. CJK 中文 emoji 🙂 should stay intact."
);
const status = createSignal("Edit Textarea, then Ctrl+Enter to submit. Ctrl+C to quit.");
const viewportRows = createSignal(0);

const statusLine = computed(() => {
  const rows = viewportRows.get();
  return rows > 0 ? `${status.get()}  [viewportRows=${rows}]` : status.get();
});

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true
});

const app = createApp(
  <box padding={1}>
    <vstack gap={1}>
      <text value="Textarea playground" bold />
      <text
        value="Scene A: Textarea flexGrow fills width after prompt (same value as B)"
        color="gray"
      />

      {/* No padding on the bordered box — padding was looking like “extra blank lines”. */}
      <box border>
        <hstack gap={0}>
          <text value={prompt} bold color="cyan" />
          <Textarea
            value={value}
            placeholder="Start typing…"
            minRows={2}
            maxRows={8}
            wrap="soft"
            onChange={(next) => {
              value.set(next);
            }}
            onSubmit={(submitted) => {
              status.set(`Submitted ${submitted.length} chars`);
            }}
            onViewportRowsChange={(rows) => {
              viewportRows.set(rows);
            }}
          />
        </hstack>
      </box>

      <text
        value="Scene B: outer flexGrow box wraps Textarea (width path only; no fixed outer height)"
        color="gray"
      />
      {/*
        Previously height={6} + border + padding left ~2 content rows while
        Textarea could grow to maxRows=4 → last line painted into the border.
      */}
      <box border>
        <hstack gap={0}>
          <text value="note: " color="yellow" />
          <box flexGrow={1} flexShrink={1} minWidth={0}>
            <Textarea
              value={value}
              minRows={2}
              maxRows={4}
              wrap="soft"
              onChange={(next) => {
                value.set(next);
              }}
            />
          </box>
        </hstack>
      </box>

      <hstack gap={2}>
        <Button
          label="Clear"
          onPress={() => {
            value.set("");
            status.set("Cleared");
          }}
        />
        <Button
          label="Fill long line"
          onPress={() => {
            value.set(
              "ABCDEFGHIJKLMNOPQRSTUVWXYZ ".repeat(6) +
                "中中中中中中中中中中 " +
                "🙂".repeat(8)
            );
            status.set("Filled long line — check soft wrap + caret");
          }}
        />
        <Button
          label="Quit"
          onPress={() => {
            app.dispose();
            process.exit(0);
          }}
        />
      </hstack>

      <text value={statusLine} />
    </vstack>
  </box>,
  { terminal }
);

process.on("SIGINT", () => {
  app.dispose();
  process.exit(0);
});

app.start();
