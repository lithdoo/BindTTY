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

export const textView = <text value={title} color="green" />;

export const appView = (
  <vstack>
    <Header title={title} />
    <show when={loading} fallback={<text value="Ready" />}>
      <text value="Loading..." />
    </show>
  </vstack>
);
