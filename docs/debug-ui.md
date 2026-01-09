# Debug UI

Modu Engine includes a built-in debug overlay for development.

## Enabling Debug UI

```javascript
import { createGame, enableDebugUI } from 'modu';

const game = createGame();
// ... setup plugins, entities, systems

enableDebugUI(game);
```

Enabling debug UI also activates the **determinism guard** which warns about non-deterministic function calls during simulation.

## Determinism Guard

When debug UI is enabled, the engine intercepts dangerous functions and warns you:

```
⚠️ Math.sqrt() is non-deterministic!
   Use dSqrt() instead for deterministic square root.
   Example: const dist = dSqrt(dx * dx + dy * dy);

⚠️ Math.random() is non-deterministic!
   Use dRandom() instead for deterministic random numbers.
   Example: const r = dRandom();

⚠️ Date.now() is non-deterministic!
   Use game.time instead for deterministic timing.
   Example: const respawnAt = game.time + 3000;
```

This catches common mistakes before they cause desync issues.

## What It Shows

The debug UI displays connection status, frame info, and sync verification:

```
ROOM
  ID: my-game-room
  Players: 3
  Frame: 1234

CLIENT
  ID: abc123de

ENGINE
  Commit: e02003d
  FPS: 60 render, 20 tick
  Net: 1.2 kB/s up, 3.5 kB/s down

STATE SYNC
  Hash: a1b2c3d4
  Delta: 180 B/s
  Sync: 100% (120 checks)
  Entities: 15
```

### Section Reference

| Section | Field | Description |
|---------|-------|-------------|
| **ROOM** | ID | Current room ID |
| | Players | Number of connected clients |
| | Frame | Current simulation frame number |
| **CLIENT** | ID | Your client ID (first 8 chars) |
| **ENGINE** | Commit | Engine version/commit hash |
| | FPS | Render FPS and tick rate |
| | Net | Upload/download bandwidth |
| **STATE SYNC** | Hash | Current local state hash (xxHash32) |
| | Delta | State hash upload bandwidth |
| | Sync | Rolling % of hash checks that passed |
| | Entities | Number of entities in world |

## Understanding Sync Status

The **STATE SYNC** section shows consensus-based sync status:

```
STATE SYNC
  Hash: a1b2c3d4              ← Your local state hash
  Delta: 180 B/s              ← Bandwidth for hash uploads
  Sync: 100% (120 checks)     ← Rolling hash match rate
  Entities: 15
```

### Sync Status Indicators

| Status | Color | Meaning |
|--------|-------|---------|
| `active` | Green | Sending state hashes, awaiting first comparison |
| `100% (N checks)` | Green | All recent hash checks matched majority |
| `99.5% (N checks)` | Yellow | Some hash mismatches detected |
| `DESYNCED` | Red | Hash doesn't match majority, recovery needed |
| `resyncing...` | Orange | Waiting for recovery snapshot from server |
| `-` | Gray | Not connected or sync not started |

### When Everything is Working

- **Sync** shows `100%` in green
- All clients have the same **Hash** at the same frame
- **Delta** shows consistent bandwidth (~180 B/s per client)

### When Desync Occurs

- **Sync** drops below 100% or shows `DESYNCED`
- Console logs detailed diagnosis (which entities/fields diverged)
- Client automatically requests and applies recovery snapshot

## Debugging Desync

When desync is detected, the engine automatically logs detailed diagnostics to the console:

### Automatic Console Diagnosis

```
[state-sync] DESYNC DETECTED at frame 1234
  Local hash:    a1b2c3d4
  Majority hash: e5f6a7b8
  Requesting resync from authority...

[state-sync] === DESYNC DIAGNOSIS ===
  Desync detected at frame: 1234
  Resync snapshot frame: 1240

DIVERGENT FIELDS: 3 differences found
  Sync: 98.8% (245/248 fields match)

  Player#1a [owner: abc12345]:
    Body2D.x: local=150.5 server=152.3 (Δ -1.8000)
    Body2D.y: local=200.1 server=198.7 (Δ 1.4000)

  Bullet#2f:
    Transform2D.angle: local=45 server=44 (Δ 1.0000)

RECENT INPUTS (last 10):
  f1230 [abc12345]: {"type":"move","x":1,"y":0}
  f1231 [abc12345]: {"type":"move","x":1,"y":0}
  ...

[state-sync] Hard recovery successful - hashes now match
```

### Finding the Root Cause

Look at the divergent fields to identify the pattern:

| Drifting Fields | Likely Cause |
|----------------|--------------|
| `*.Transform2D.x/y` | `Math.sqrt()` or manual position math |
| `*.Body2D.vx/vy` | `Math.random()` for velocity |
| Random entities missing | `Math.random()` in spawn logic |
| Everything drifting | `Date.now()` or async operation in system |

### Verify the Fix

After fixing, watch the debug UI:
- **Sync** should return to `100%`
- No more desync messages in console
- All clients show matching hashes

## Example: Debugging a Position Desync

```javascript
// You see this in getDriftStats():
// lastDriftedFields: ['player.Transform2D.x', 'player.Transform2D.y']

// BAD - This was causing desync
game.addSystem(() => {
    const dx = target.x - player.get(Transform2D).x;
    const dy = target.y - player.get(Transform2D).y;
    const dist = Math.sqrt(dx * dx + dy * dy);  // Non-deterministic!
    player.get(Transform2D).x += (dx / dist) * speed;
});

// GOOD - Use deterministic helpers
game.addSystem(() => {
    player.moveTowards(target, speed);  // Best: uses fixed-point internally
});

// ALSO GOOD - If you need the distance value
game.addSystem(() => {
    const dist = player.distanceTo(target);  // Deterministic
    // or: const dist = dSqrt(dx * dx + dy * dy);
});
```

## Programmatic Access

### `game.getStateHash()`

Get the current state hash:

```javascript
const hash = game.getStateHash();
console.log('State hash:', hash.toString(16));  // e.g., "a1b2c3d4"
```

### `game.getSyncStats()`

Get hash-based sync statistics:

```javascript
const stats = game.getSyncStats();
console.log(stats);
// {
//   syncPercent: 100,       // Rolling % of hash checks that passed
//   passed: 120,            // Number of passed hash checks
//   failed: 0,              // Number of failed hash checks
//   isDesynced: false,      // Currently in desynced state?
//   resyncPending: false    // Waiting for recovery snapshot?
// }
```

### `game.isAuthority()`

Check if this client is the authority (provides snapshots for late joiners/recovery):

```javascript
if (game.isAuthority()) {
    console.log('This client is the authority');
}
```

### `game.getDriftStats()`

Get detailed drift statistics (from last snapshot comparison):

```javascript
const stats = game.getDriftStats();
console.log(stats);
// {
//   totalChecks: 50,
//   matchingFieldCount: 245,
//   totalFieldCount: 250,
//   determinismPercent: 98
// }
```

## Styling

The debug UI uses inline styles. To customize:

```javascript
const debugDiv = document.getElementById('modu-debug');
if (debugDiv) {
    debugDiv.style.fontSize = '14px';
    debugDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
}
```

## Disabling

To remove the debug UI:

```javascript
const debugDiv = document.getElementById('modu-debug');
if (debugDiv) {
    debugDiv.remove();
}
```

## Conditional Enabling

Enable only in development:

```javascript
if (process.env.NODE_ENV === 'development') {
    enableDebugUI(game);
}
```

Or with a URL parameter:

```javascript
if (new URLSearchParams(location.search).has('debug')) {
    enableDebugUI(game);
}
```

## Console Debugging

For more detailed debugging, check console logs:

```javascript
// Enable debug mode in connect options
game.connect('my-room', callbacks, { debug: true });
```

Key log messages:
- `[modu] Connecting to room...` - Connection attempt
- `[modu] Connected as X, frame Y` - Successful connection
- `[modu] Catchup: snapshotFrame=X, serverFrame=Y` - Late joiner sync
- `[modu] Network error:` - Connection problems

## Next Steps

- [Determinism Guide](./determinism.md) - Avoiding desync
- [Systems](./systems.md) - Writing game logic
- [Canvas Renderer](./canvas-renderer.md) - Rendering
