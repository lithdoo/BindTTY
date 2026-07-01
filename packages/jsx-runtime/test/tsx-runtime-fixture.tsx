import type { ReadableSignal, Template } from "@bindtty/vnode";

function signal<T>(value: T): ReadableSignal<T> {
  return {
    get() {
      return value;
    },
    subscribe() {
      return () => {};
    }
  };
}

export const title = signal("Hello from TSX");
export const loading = signal(true);

export function Header(props: { title: ReadableSignal<string> }): Template {
  return <text value={props.title} bold />;
}

export function CustomButton(props: {
  id?: string;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}): Template {
  return (
    <box
      id={props.id}
      onKey={
        props.disabled
          ? false
          : (event) => {
              if (event.name === "return" || event.input === " ") {
                props.onPress?.();
                return true;
              }
            }
      }
      border
      padding={1}
    >
      <text value={props.label} />
    </box>
  );
}

export const textView = <text value={title} color="green" />;

export const interactionView = (
  <box
    id="panel"
    onKey={true}
    onFocusChange={(event) => {
      Boolean(event.focused);
    }}
    border
    padding={1}
    background="blue"
  >
    <text value="Focusable" />
  </box>
);

export const customButtonView = (
  <CustomButton
    id="submit"
    label="Submit"
    disabled={false}
    onPress={() => {}}
  />
);

export const appView = (
  <vstack>
    <Header title={title} />
    <show when={loading} fallback={<text value="Ready" />}>
      <text value="Loading..." />
    </show>
  </vstack>
);
