import { createTaskStore } from "./task-store";
import { createInMemoryAdapter } from "./in-memory-adapter";

function newStore() {
  const adapter = createInMemoryAdapter();
  return { adapter, store: createTaskStore(adapter) };
}

async function listNames(store: ReturnType<typeof newStore>["store"]) {
  return (await store.lists()).map((l) => l.name);
}

describe("task store: Lists", () => {
  it("creates a List that shows up after the Inbox", async () => {
    const { store } = newStore();
    const work = await store.createList("  Work ");
    expect(work.name).toBe("Work");
    expect(await listNames(store)).toEqual(["Inbox", "Work"]);
  });

  it("rejects a blank or duplicate List name and creates nothing", async () => {
    const { store } = newStore();
    await store.createList("Work");
    await expect(store.createList("   ")).rejects.toThrow();
    await expect(store.createList("work")).rejects.toThrow();
    await expect(store.createList("Inbox")).rejects.toThrow();
    expect(await listNames(store)).toEqual(["Inbox", "Work"]);
  });

  it("renames a List and keeps its Tasks", async () => {
    const { store } = newStore();
    const work = await store.createList("Work");
    await store.addTask(work.id, "report");
    await store.renameList(work.id, "Job");
    expect(await listNames(store)).toEqual(["Inbox", "Job"]);
    expect((await store.openTasks(work.id)).map((t) => t.title)).toEqual(["report"]);
  });

  it("rejects renaming to a blank or taken name", async () => {
    const { store } = newStore();
    const work = await store.createList("Work");
    await store.createList("Home");
    await expect(store.renameList(work.id, " ")).rejects.toThrow();
    await expect(store.renameList(work.id, "Home")).rejects.toThrow();
    expect(await listNames(store)).toEqual(["Inbox", "Work", "Home"]);
  });

  it("allows renaming a List to its own name", async () => {
    const { store } = newStore();
    const work = await store.createList("Work");
    await store.renameList(work.id, "Work");
    expect(await listNames(store)).toEqual(["Inbox", "Work"]);
  });

  it("cannot rename or delete the Inbox", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    await expect(store.renameList(inbox.id, "Later")).rejects.toThrow();
    await expect(store.deleteList(inbox.id)).rejects.toThrow();
    expect(await listNames(store)).toEqual(["Inbox"]);
  });

  it("deletes an empty List", async () => {
    const { store } = newStore();
    const work = await store.createList("Work");
    expect(await store.listHasTasks(work.id)).toBe(false);
    await store.deleteList(work.id);
    expect(await listNames(store)).toEqual(["Inbox"]);
  });

  it("reports a List with Tasks as having Tasks", async () => {
    const { store } = newStore();
    const work = await store.createList("Work");
    await store.addTask(work.id, "report");
    expect(await store.listHasTasks(work.id)).toBe(true);
  });

  it("deleting a List deletes its Tasks and leaves other Lists alone", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    const work = await store.createList("Work");
    await store.addTask(work.id, "report");
    await store.addTask(inbox.id, "milk");
    await store.deleteList(work.id);
    expect(await adapter.listTasks(work.id)).toEqual([]);
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["milk"]);
  });

  it("leaves Lists unchanged when a save fails", async () => {
    const { adapter, store } = newStore();
    const work = await store.createList("Work");
    adapter.failWrites(true);
    await expect(store.createList("Home")).rejects.toThrow();
    await expect(store.renameList(work.id, "Job")).rejects.toThrow();
    await expect(store.deleteList(work.id)).rejects.toThrow();
    expect(await listNames(store)).toEqual(["Inbox", "Work"]);
  });
});

describe("task store: moving Tasks", () => {
  it("moves a Task to another List", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    const work = await store.createList("Work");
    const task = await store.addTask(inbox.id, "report");
    await store.moveTask(task.id, work.id);
    expect(await store.openTasks(inbox.id)).toEqual([]);
    expect((await store.openTasks(work.id)).map((t) => t.title)).toEqual(["report"]);
  });

  it("rejects a move to a List that does not exist", async () => {
    const { store } = newStore();
    const inbox = await store.inbox();
    const task = await store.addTask(inbox.id, "report");
    await expect(store.moveTask(task.id, "nope")).rejects.toThrow();
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["report"]);
  });

  it("leaves the Task where it was when the save fails", async () => {
    const { adapter, store } = newStore();
    const inbox = await store.inbox();
    const work = await store.createList("Work");
    const task = await store.addTask(inbox.id, "report");
    adapter.failWrites(true);
    await expect(store.moveTask(task.id, work.id)).rejects.toThrow();
    expect((await store.openTasks(inbox.id)).map((t) => t.title)).toEqual(["report"]);
  });
});
