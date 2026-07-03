import { TextInput, createApp } from "bindtty";
import { createSignal } from "@bindtty/signal";
import { createNodeTerminal } from "@bindtty/terminal";

const value = createSignal("");
const status = createSignal("Type a name and press Enter");

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true
});

const app = createApp(
  <vstack>
    <text value="Form" bold />
    <TextInput
      value={value}
      placeholder="Name"
      onChange={(nextValue) => {
        value.set(nextValue);
      }}
      onSubmit={(nextValue) => {
        status.set(`Sent: ${nextValue}`);
      }}
    />
    <text value={status} />
  </vstack>,
  { terminal }
);

app.start();
