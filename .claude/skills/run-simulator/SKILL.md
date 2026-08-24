---
name: run-simulator
description: >
  Launches the iOS simulator for the Club Ping mobile app without opening a Terminal window.
  Use this skill whenever the user asks to launch, start, run, open, or relaunch the simulator or
  the mobile app. Also triggers on phrases like "open the app", "boot the simulator", "start expo",
  or "can you run the app on the simulator".
---

# Run iOS Simulator

Kill any existing expo process, then start Metro + the iOS simulator in the background — no Terminal window needed.

## Steps

1. Kill any existing expo / Metro processes and the Expo Go app on the simulator:
   ```bash
   pkill -f "expo start" 2>/dev/null; pkill -f "Metro" 2>/dev/null
   xcrun simctl terminate booted host.exp.Exponent 2>/dev/null; sleep 1
   ```

2. Start expo from the `mobile/` directory. Source `nvm` first (the project needs Node 20+; `.nvmrc` pins it). Bind Metro on the LAN interface but force the **packager hostname to `127.0.0.1`** so the bundle URL is always reachable from the simulator (the simulator shares the host network):
   ```bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" \
     && cd "$(git rev-parse --show-toplevel)/mobile" \
     && nvm use \
     && CI=1 REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --ios --lan > /tmp/expo.log 2>&1 &
   ```

3. Wait until the bundle is built (don't fixed-sleep — poll the log), then confirm the dev URL:
   ```bash
   until grep -q "iOS Bundled" /tmp/expo.log 2>/dev/null; do sleep 3; done
   grep -o 'exp://[^ ]*' /tmp/expo.log | tail -1   # expect exp://127.0.0.1:8081
   ```

4. If the simulator shows **"Could not connect to the server"** or **"request timed out"** (it can launch before Metro is ready), reopen the dev URL — Metro is up by now:
   ```bash
   xcrun simctl openurl booted "exp://127.0.0.1:8081"
   ```

5. Report back to the user: whether the simulator opened, which device (e.g. "iPhone 16 Pro"), and any errors if something went wrong.

## Reloading after code changes

The file watcher (watchman) on this machine is unreliable — **HMR / Fast Refresh and manual reload (Cmd+R) often do NOT pick up edits**, so the running app keeps showing stale code. If a change isn't showing:

- **Re-run this skill** (a full Metro restart re-reads files from disk and is the reliable way to apply edits).
- Add `--clear` to the `expo start` command to also wipe the Metro transform cache if you suspect staleness:
  `CI=1 REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1 npx expo start --ios --lan --clear`
- A fresh `iOS Bundled` line in `/tmp/expo.log` (count it with `grep -c "iOS Bundled" /tmp/expo.log`) confirms a rebuild actually happened.

## Notes

- **Why `127.0.0.1` + `--lan` + `CI=1`:** plain `--offline` makes Metro advertise a LAN IP (or bind IPv6-only on localhost) that the simulator can't reach when the Wi-Fi network changes or the firewall blocks `node`. Forcing the packager hostname to `127.0.0.1` with `--lan` (binds all interfaces / IPv4) makes the bundle reachable. `CI=1` runs non-interactively (skips the Expo Go version prompt) — it replaces the prompt-skipping that `--offline` used to provide. Don't combine `--offline` with `--lan`/`--host`/`--localhost` — expo errors ("at most one of …").
- Logs stream to `/tmp/expo.log` — useful for debugging if the simulator doesn't open.
- To stop the simulator later: `pkill -f "expo start"`.
