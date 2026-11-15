# Passphrase instead of login

The app is single-user and has no accounts. Access is guarded by one shared Passphrase, entered once per device and sent with every request. The database rejects requests that don't carry it.

## Why

Sign-in adds friction for a one-person tool. But the Supabase key in a browser app is public, so with no guard anyone with the URL could read or edit the Tasks. A Passphrase is the lightest guard that keeps strangers out.

## Alternatives considered

- Full sign-in (e.g. Google): safest, but more setup and a login step on every device.
- Fully open database behind an unguessable URL: simplest, but anyone who learns the URL has full access.

## Consequences

- Adding more users later means replacing this with real accounts.
- Anyone who learns the Passphrase has full access; it should be changeable.
