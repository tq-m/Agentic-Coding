import { createPassphraseChanger } from "./passphrase-change";
import { createInMemoryPassphraseAdapter } from "./in-memory-passphrase-adapter";

function setup(initial = "correct horse") {
  const adapter = createInMemoryPassphraseAdapter(initial);
  const saved: string[] = [];
  const memory = { set: (p: string) => saved.push(p) };
  return { adapter, saved, changer: createPassphraseChanger(adapter, memory) };
}

describe("changing the Passphrase", () => {
  it("makes the new Passphrase grant access and the old one stop granting it", async () => {
    const { adapter, changer } = setup();
    const result = await changer.change("correct horse", "battery staple");
    expect(result).toEqual({ ok: true });
    expect(adapter.grantsAccess("battery staple")).toBe(true);
    expect(adapter.grantsAccess("correct horse")).toBe(false);
  });

  it("remembers the new Passphrase on the changing device", async () => {
    const { changer, saved } = setup();
    await changer.change("correct horse", "battery staple");
    expect(saved).toEqual(["battery staple"]);
  });

  it("requires the current Passphrase: a wrong one changes nothing", async () => {
    const { adapter, changer, saved } = setup();
    const result = await changer.change("not it", "battery staple");
    expect(result).toEqual({ ok: false, reason: "wrong-current" });
    expect(adapter.grantsAccess("correct horse")).toBe(true);
    expect(adapter.grantsAccess("battery staple")).toBe(false);
    expect(saved).toEqual([]);
  });

  it("rejects a new Passphrase shorter than 8 characters", async () => {
    const { adapter, changer, saved } = setup();
    const result = await changer.change("correct horse", "short");
    expect(result).toEqual({ ok: false, reason: "too-short" });
    expect(adapter.grantsAccess("correct horse")).toBe(true);
    expect(saved).toEqual([]);
  });

  it("rejects a new Passphrase equal to the current one", async () => {
    const { changer } = setup();
    expect(await changer.change("correct horse", "correct horse")).toEqual({
      ok: false,
      reason: "same-as-current",
    });
  });

  it("reports a failed save and keeps the old Passphrase everywhere", async () => {
    const { adapter, changer, saved } = setup();
    adapter.failWrites(true);
    const result = await changer.change("correct horse", "battery staple");
    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(adapter.grantsAccess("correct horse")).toBe(true);
    expect(saved).toEqual([]);
  });

  it("a device holding the old Passphrase is no longer accepted, so it is asked again", async () => {
    const { adapter, changer } = setup();
    await changer.change("correct horse", "battery staple");
    expect(await adapter.checkPassphrase("correct horse")).toBe(false);
    expect(await adapter.checkPassphrase("battery staple")).toBe(true);
  });
});
