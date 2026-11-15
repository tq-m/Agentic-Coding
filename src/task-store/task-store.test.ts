import { createTaskStore } from "./task-store";
import { createInMemoryAdapter } from "./in-memory-adapter";

function newStore() {
  const adapter = createInMemoryAdapter();
  return { adapter, store: createTaskStore(adapter) };
}

describe("task store: Inbox", () => {
  it("has an Inbox List from the start", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    expect(inbox.name).toBe("Inbox");
    expect((await store.lists()).map((l) => l.name)).toEqual(["Inbox"]);
  });

  it("shows an added Task in the Inbox", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "Buy milk");
    const open = await store.openTasks(inbox.id);
    expect(open.map((t) => t.title)).toEqual(["Buy milk"]);
    expect(open[0].done).toBe(false);
  });

  it("trims the title of an added Task", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "  Call mum  ");
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["Call mum"]);
  });

  it("rejects a blank title and adds nothing", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    await expect(store.addTask(inbox.id, "   ")).rejects.toThrow();
    expect(await store.openTasks(inbox.id)).toEqual([]);
  });

  it("lists Tasks in the order they were added", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "first");
    await store.addTask(inbox.id, "second");
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["first", "second"]);
  });

  it("leaves the Inbox unchanged when a save fails", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "kept");
    adapter.failWrites(true);
    await expect(store.addTask(inbox.id, "lost")).rejects.toThrow();
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["kept"]);
  });
});
