import { createApp } from "bindtty";
import { createNodeTerminal } from "@bindtty/terminal";

const terminal = createNodeTerminal({
  stdout: process.stdout,
  stdin: process.stdin,
  useAltScreen: true,
  hideCursor: true,
  rawMode: true
});

const app = createApp(
  <screen gap={1}>
    <box padding={1} border>
      <vstack gap={1}>
        <text value="Wide Text" bold color="brightCyan" />
        <text value="CJK: A中B renders with 中 occupying two terminal columns." />
        <text value="Emoji: status 🙂 ready 🚀" />
        <text value={"Combining: cafe\u0301 keeps the accent with e."} />
      </vstack>
    </box>

    <box width={12} padding={1} border>
      <vstack gap={1}>
        <text value="Hard wrap" color="yellow" />
        <text value="中中中🙂🙂ABC" wrap="hard" />
      </vstack>
    </box>

    <box padding={1} border>
      <text
        value="Resize the terminal: layout uses display columns, renderer stores wide placeholders, and ANSI output skips placeholders."
        wrap="wrap"
        color="gray"
      />
    </box>
  </screen>,
  {
    terminal
  }
);

app.start();

process.on("SIGINT", () => {
  app.dispose();
});
