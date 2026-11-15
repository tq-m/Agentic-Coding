# Acceptance checklist (ticket #8)

Needs a real Supabase project (see `supabase-setup.md`), a Vercel deploy and a real phone. Not run by the agents.

## Narrow phone and wide desktop
- [ ] Layout is usable at ~375px wide (no horizontal scroll, controls reachable)
- [ ] Layout is usable on a wide desktop window
- [ ] Empty List shows "No Tasks yet."; Inbox exists on first run

## Install
- [ ] "Install" is offered and works on a phone
- [ ] "Install" is offered and works on desktop

## Passphrase (live project)
- [ ] Request without or with a wrong Passphrase is rejected (curl steps in `supabase-setup.md`)
- [ ] Wrong Passphrase at the gate shows an error; correct one is remembered
- [ ] Change Passphrase: other device is asked again; old Passphrase no longer works

## Realtime and offline (two real devices)
- [ ] Task added on one device appears on the other without refresh
- [ ] Airplane mode: "Offline, can't save" banner shows, edits blocked
- [ ] Reconnect: banner clears and missed changes appear, no reload

Fix anything that fails, then close #8.
