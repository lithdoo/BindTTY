import { createApp, createSignal } from "bindtty";
import { Checkbox, Select, TextInput } from "@bindtty/widgets";
import { createNodeTerminal } from "@bindtty/terminal";

const value = createSignal("");
const agree = createSignal(false);
const language = createSignal("ts");
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
    <box
      focusable={false}
      onKey={(event) => {
        if (event.name === "return") {
          status.set(`Sent: ${value.get()}`);
          return true;
        }
        return false;
      }}
    >
      <TextInput
        value={value}
        placeholder="Name"
        onChange={(nextValue) => {
          value.set(nextValue);
        }}
      />
    </box>
    <Checkbox
      label="Subscribe to updates"
      checked={agree}
      onChange={(nextChecked) => {
        agree.set(nextChecked);
      }}
    />
    <Select
      label="Language"
      height={3}
      options={[
        { value: "ts", label: "TypeScript" },
        { value: "js", label: "JavaScript" },
        { value: "rs", label: "Rust" }
      ]}
      value={language}
      onChange={(nextLanguage) => {
        language.set(nextLanguage);
      }}
    />
    <text value={status} />
  </vstack>,
  { terminal }
);

app.start();
