import { createTaskStore } from "./task-store";
import { createInMemoryAdapter } from "./in-memory-adapter";

function newStore() {
  const adapter = createInMemoryAdapter();
  return { adapter, store: createTaskStore(adapter) };
}

describe("task store: live updates", () => {
  it("notifies when another device adds a Task, and the Task is in the Inbox", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    const listener = vi.fn();
    store.subscribe(listener);

    adapter.otherDevice.addTask(inbox.id, "From my phone");

    expect(listener).toHaveBeenCalled();
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["From my phone"]);
  });

  it("stops notifying once unsubscribed", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    adapter.otherDevice.addTask(inbox.id, "ignored");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("task store: offline", () => {
  it("is online at first", () => {
    expect(newStore().store.isOnline()).toBe(true);
  });

  it("reports offline and rejects edits, saving nothing", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    const listener = vi.fn();
    store.subscribe(listener);

    adapter.setConnected(false);

    expect(store.isOnline()).toBe(false);
    expect(listener).toHaveBeenCalled();
    await expect(store.addTask(inbox.id, "nope")).rejects.toThrow("Offline, can't save");

    adapter.setConnected(true);
    expect(await store.openTasks(inbox.id)).toEqual([]);
  });

  it("recovers on reconnect: notifies, shows what was missed, and allows edits again", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    store.subscribe(() => {});
    adapter.setConnected(false);
    adapter.otherDevice.addTask(inbox.id, "missed while offline");

    const listener = vi.fn();
    store.subscribe(listener);
    adapter.setConnected(true);

    expect(store.isOnline()).toBe(true);
    expect(listener).toHaveBeenCalled();
    await store.addTask(inbox.id, "mine");
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual([
      "missed while offline",
      "mine",
    ]);
  });
});

describe("task store: offline blocks List edits", () => {
  it("rejects creating a List while offline", async () => {
    const { adapter, store } = newStore();
    store.subscribe(() => {});
    adapter.setConnected(false);
    await expect(store.createList("Work")).rejects.toThrow("Offline, can't save");
    adapter.setConnected(true);
    expect((await store.lists()).map((l) => l.name)).toEqual(["Inbox"]);
  });
});
