# HiddenChannelLocks (Discord+)

Original MIT plugin for classic Revenge 1.12.1 on Discord Android 354.12.

- Shows hidden/obfuscated server channels as lock rows ("🔒 Hidden text channel") under their real parent category, in raw position order.
- Tapping one opens an info sheet (type, category, position, ID, any received name/topic/permission overwrites) instead of opening or joining it.
- Discord withholds names, topics and messages of hidden channels (server-side channel obfuscation, `___hidden___`). This plugin **cannot** recover withheld data; it shows a real name only if the client actually received one.
- Settings toggle to show/hide the locks; diagnostics in settings and logs.
- UI-only projection: no gateway, HTTP, permission-store or channel-store changes. Fails safe (no rows) if required Metro modules or navigation guards are missing; voice/stage rows only appear if voice join guards installed.
- On activation, stops the older marcmy ShowHiddenChannels plugin if it is enabled (not deleted).

Build: `python3 scripts/build-hidden-locks.py`; tests: `node plugins/hidden-channel-locks/test/run.js` (synthetic fixtures, no Discord code).
