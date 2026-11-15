import { createTaskStore, OfflineError } from "./task-store";
import { createInMemoryAdapter } from "./in-memory-adapter";

function newStoreOn(today: string) {
  const adapter = createInMemoryAdapter();
  return { adapter, store: createTaskStore(adapter, { today: () => today }) };
}

describe("task store: due date and note", () => {
  it("keeps the due date and note given when adding a Task", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "Pay rent", { dueDate: "2026-03-15", note: "bank transfer" });
    const [task] = await store.openTasks(inbox.id);
    expect(task.dueDate).toBe("2026-03-15");
    expect(task.note).toBe("bank transfer");
  });

  it("rejects a due date that is not a real date", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    await expect(store.addTask(inbox.id, "x", { dueDate: "2026-02-30" })).rejects.toThrow();
    await expect(store.addTask(inbox.id, "x", { dueDate: "soon" })).rejects.toThrow();
    expect(await store.openTasks(inbox.id)).toEqual([]);
  });
});

describe("task store: editing", () => {
  it("changes title, due date and note, and can clear them", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const t = await store.addTask(inbox.id, "Old", { dueDate: "2026-03-15", note: "n" });
    await store.editTask(t.id, { title: "  New ", dueDate: null, note: "" });
    const [task] = await store.openTasks(inbox.id);
    expect(task.title).toBe("New");
    expect(task.dueDate).toBeNull();
    expect(task.note).toBeNull();
  });

  it("rejects a blank title and leaves the Task unchanged", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const t = await store.addTask(inbox.id, "Keep");
    await expect(store.editTask(t.id, { title: " " })).rejects.toThrow();
    expect((await store.openTasks(inbox.id)).map((x) => x.title)).toEqual(["Keep"]);
  });

  it("leaves the Task unchanged when the save fails", async () => {
    const { adapter, store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const t = await store.addTask(inbox.id, "Keep", { note: "a" });
    adapter.failWrites(true);
    await expect(store.editTask(t.id, { title: "Lost", note: "b" })).rejects.toThrow();
    const [task] = await store.openTasks(inbox.id);
    expect([task.title, task.note]).toEqual(["Keep", "a"]);
  });
});

describe("task store: ticking and Done", () => {
  it("moves a ticked Task out of the open Tasks and into Done", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const a = await store.addTask(inbox.id, "a");
    await store.addTask(inbox.id, "b");
    await store.tick(a.id);
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["b"]);
    expect((await store.doneTasks(inbox.id)).map((t) => t.title)).toEqual(["a"]);
  });

  it("reopens an unticked Task", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const a = await store.addTask(inbox.id, "a");
    await store.tick(a.id);
    await store.untick(a.id);
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["a"]);
    expect(await store.doneTasks(inbox.id)).toEqual([]);
  });

  it("keeps a Task open when ticking fails to save", async () => {
    const { adapter, store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const a = await store.addTask(inbox.id, "a");
    adapter.failWrites(true);
    await expect(store.tick(a.id)).rejects.toThrow();
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["a"]);
  });
});

describe("task store: deleting", () => {
  it("permanently deletes an open Task", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const a = await store.addTask(inbox.id, "a");
    await store.deleteTask(a.id);
    expect(await store.openTasks(inbox.id)).toEqual([]);
    expect(await store.doneTasks(inbox.id)).toEqual([]);
  });

  it("keeps ticked Tasks until they are deleted, then deletes one for good", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const a = await store.addTask(inbox.id, "a");
    const b = await store.addTask(inbox.id, "b");
    await store.tick(a.id);
    await store.tick(b.id);
    expect((await store.doneTasks(inbox.id)).length).toBe(2);
    await store.deleteTask(a.id);
    expect((await store.doneTasks(inbox.id)).map((t) => t.title)).toEqual(["b"]);
  });

  it("keeps the Task when the delete fails to save", async () => {
    const { adapter, store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    const a = await store.addTask(inbox.id, "a");
    adapter.failWrites(true);
    await expect(store.deleteTask(a.id)).rejects.toThrow();
    expect((await store.openTasks(inbox.id)).length).toBe(1);
  });
});

describe("task store: order and Overdue", () => {
  it("sorts open Tasks by due date, undated last, then by creation time", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "undated 1");
    await store.addTask(inbox.id, "late", { dueDate: "2026-04-01" });
    await store.addTask(inbox.id, "undated 2");
    await store.addTask(inbox.id, "soon A", { dueDate: "2026-03-12" });
    await store.addTask(inbox.id, "soon B", { dueDate: "2026-03-12" });
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual([
      "soon A",
      "soon B",
      "late",
      "undated 1",
      "undated 2",
    ]);
  });

  it("flags only open Tasks due before today as Overdue", async () => {
    const { store } = newStoreOn("2026-03-10");
    const inbox = await store.inbox();
    await store.addTask(inbox.id, "yesterday", { dueDate: "2026-03-09" });
    await store.addTask(inbox.id, "today", { dueDate: "2026-03-10" });
    await store.addTask(inbox.id, "tomorrow", { dueDate: "2026-03-11" });
    await store.addTask(inbox.id, "undated");
    const done = await store.addTask(inbox.id, "old but done", { dueDate: "2026-01-01" });
    await store.tick(done.id);
    const overdue = (await store.openTasks(inbox.id)).filter((t) => t.overdue).map((t) => t.title);
    expect(overdue).toEqual(["yesterday"]);
    expect((await store.doneTasks(inbox.id))[0].overdue).toBe(false);
  });

  it("uses the injected today, so the same Task becomes Overdue later", async () => {
    const adapter = createInMemoryAdapter();
    const early = createTaskStore(adapter, { today: () => "2026-03-10" });
    const inbox = await early.inbox();
    await early.addTask(inbox.id, "t", { dueDate: "2026-03-10" });
    expect((await early.openTasks(inbox.id))[0].overdue).toBe(false);
    const later = createTaskStore(adapter, { today: () => "2026-03-11" });
    expect((await later.openTasks(inbox.id))[0].overdue).toBe(true);
  });
});

describe("task store: offline blocks lifecycle edits", () => {
  async function offlineWithTask() {
    const { adapter, store } = newStoreOn("2026-03-10");
    store.subscribe(() => {});
    const inbox = await store.inbox();
    const t = await store.addTask(inbox.id, "Keep", { dueDate: "2026-03-15", note: "n" });
    const done = await store.addTask(inbox.id, "Finished");
    await store.tick(done.id);
    adapter.setConnected(false);
    return { adapter, store, inbox, t, done };
  }

  it("rejects edit, tick, untick and delete with OfflineError, changing nothing", async () => {
    const { adapter, store, inbox, t, done } = await offlineWithTask();
    await expect(store.editTask(t.id, { title: "Changed" })).rejects.toBeInstanceOf(OfflineError);
    await expect(store.tick(t.id)).rejects.toBeInstanceOf(OfflineError);
    await expect(store.untick(done.id)).rejects.toBeInstanceOf(OfflineError);
    await expect(store.deleteTask(t.id)).rejects.toBeInstanceOf(OfflineError);

    adapter.setConnected(true);
    const open = await store.openTasks(inbox.id);
    expect(open.map((x) => x.title)).toEqual(["Keep"]);
    expect(open[0].note).toBe("n");
    expect((await store.doneTasks(inbox.id)).map((x) => x.title)).toEqual(["Finished"]);
  });

  it("allows them again once back online", async () => {
    const { adapter, store, inbox, t } = await offlineWithTask();
    adapter.setConnected(true);
    await store.tick(t.id);
    expect((await store.doneTasks(inbox.id)).map((x) => x.title)).toContain("Keep");
  });
});
