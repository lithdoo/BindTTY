import type { ReadableSignal, Template } from "@bindtty/vnode";

declare const title: ReadableSignal<string>;
declare const loading: ReadableSignal<boolean>;

function Header(props: { title: ReadableSignal<string> }): Template {
  return <text value={props.title} bold />;
}

export const view: Template = (
  <vstack>
    <Header title={title} />
    <show when={loading} fallback={<text value="Ready" />}>
      <text value="Loading..." />
    </show>
  </vstack>
);

export const interactionPropsView = (
  <box
    id="panel"
    onKey={(event) => event.name === "return"}
    onFocusChange={(event) => {
      Boolean(event.focused);
    }}
    border
    padding={1}
  >
    <text value="Focusable" color="green" />
  </box>
);

// @ts-expect-error text content must use value prop, not children.
export const invalidTextChild = <text value="Hello">Hello</text>;

// @ts-expect-error text requires value.
export const invalidMissingValue = <text color="green" />;
