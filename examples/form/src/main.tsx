import { Checkbox, TextInput, createApp, createSignal } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

const value = createSignal("");
const agree = createSignal(false);
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
    <Checkbox
      label="Subscribe to updates"
      checked={agree}
      onChange={(nextChecked) => {
        agree.set(nextChecked);
      }}
    />
    <text value={status} />
  </vstack>,
  { terminal }
);

app.start();
