import { Button, computed, createApp, createSignal } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

const count = createSignal(0);
const label = computed(() => `Count: ${count.get()}`);

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true
});

const app = createApp(
  <vstack>
    <text value={label} />
    <Button
      label="+"
      onPress={() => {
        count.set(count.get() + 1);
      }}
    />
  </vstack>,
  { terminal }
);

app.start();
