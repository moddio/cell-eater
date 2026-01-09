# Engine Architecture

Technical overview of the Modu Engine internals.

## Core Concepts

### Local-First Multiplayer

The engine runs a full deterministic simulation locally. Multiplayer is achieved by syncing inputs, not state:

```
Client A: [Local Simulation] ──input──> Server ──broadcast──> All Clients
Client B: [Local Simulation] <──────────────────────────────────────────
Client C: [Local Simulation] <──────────────────────────────────────────
```

All clients run identical simulations. Given the same inputs in the same order, they compute identical results.

### Determinism Requirements

- **Fixed-point math**: All physics uses 16.16 fixed-point integers (no floats)
- **Sorted iteration**: Queries return entities in deterministic order
- **Seeded random**: `dRandom()` produces identical sequences across clients
- **Frame-based timing**: Use `game.frame`, never `Date.now()`

## Directory Structure

```
src/
├── ecs/                 # Entity Component System
│   ├── game.ts          # High-level Game API
│   ├── world.ts         # Entity management, queries
│   ├── entity.ts        # Entity wrapper
│   ├── component.ts     # Component storage (SoA)
│   ├── components.ts    # Built-in components
│   ├── query.ts         # Query engine
│   ├── system.ts        # System scheduler
│   ├── snapshot.ts      # State snapshots
│   ├── physics2d-system.ts  # Physics plugin
│   ├── auto-renderer.ts     # Rendering plugin
│   └── input-plugin.ts      # Input plugin
│
├── components/          # Physics implementations
│   ├── physics2d/       # 2D physics engine
│   └── physics3d/       # 3D physics engine
│
├── math/                # Deterministic math
│   ├── fixed.ts         # 16.16 fixed-point
│   ├── vec.ts           # Vector operations
│   └── random.ts        # Seeded PRNG
│
├── hash/                # State hashing
│   └── xxhash.ts        # xxHash32 for state verification
│
├── sync/                # State synchronization
│   ├── state-delta.ts   # Delta computation & serialization
│   └── partition.ts     # Partition assignment for distributed sync
│
└── codec/               # Binary encoding
    └── binary.ts        # Snapshot serialization
```

## ECS Architecture

### Components

Structure of Arrays (SoA) storage for cache efficiency:

```typescript
// Each component field stored as typed array
Transform2D:
  x: Int32Array[MAX_ENTITIES]      // Fixed-point
  y: Int32Array[MAX_ENTITIES]      // Fixed-point
  angle: Int32Array[MAX_ENTITIES]  // Fixed-point
```

Components are defined with `defineComponent()`:

```typescript
const Health = defineComponent('Health', {
    current: 100,
    max: 100
});
```

### Entities

Entities are just IDs (32-bit: 20-bit index + 12-bit generation). The `Entity` class is a wrapper providing component access:

```typescript
entity.get(Transform2D).x = 100;
entity.has(Health);
entity.destroy();
```

### Systems

Functions that run each frame in defined phases:

```
Frame execution order:
1. input       - Apply network inputs to InputState
2. update      - Game logic
3. prePhysics  - Pre-physics preparation
4. physics     - Physics simulation
5. postPhysics - React to physics results
6. render      - Drawing (client only)
```

### Queries

O(1) entity lookup by type or component:

```typescript
game.query('player')        // By type name
game.query(Transform2D)     // By component
game.getEntityByClientId()  // O(1) player lookup
```

## Networking

### Input Flow

```
1. Player input captured locally
2. Sent to server
3. Server assigns sequence number, broadcasts to all
4. All clients apply inputs at same frame
5. All clients compute identical state (deterministic simulation)
```

### Consensus-Based State Sync

Instead of rollback, the engine uses **hash-based consensus verification**:

```
Every tick:
  Client → Server: stateHash (4 bytes)
  Server: Computes majority hash from all clients
  Server → Client: majorityHash (via TICK message)

  If client hash != majority:
    Client requests full state resync
    Server sends snapshot from authority
    Client applies snapshot (hard recovery)
```

**Key properties:**
- No rollback simulation - clients trust determinism
- No continuous snapshot broadcasting - only 9 bytes/tick upload per client
- Desynced clients are detected immediately via hash mismatch
- Hard recovery with detailed diagnostics when desync occurs

### Snapshots

Used for **late joiners** and **desync recovery** only:

```typescript
// Sparse snapshot format
{
    frame: number,
    entityMask: Uint8Array,      // Which entities exist
    componentData: ArrayBuffer,   // Packed component values
    strings: Map<string, Map<string, number>>  // Interned strings
}
```

### Desync Detection & Recovery

When a client's hash doesn't match the majority:

1. **Detection**: Server broadcasts `majorityHash` with each TICK
2. **Diagnosis**: Client logs detailed diff (which entities/fields diverged)
3. **Recovery**: Client requests and applies full snapshot from authority
4. **Verification**: Hash compared after recovery to confirm sync

## Plugins

Plugins extend Game via `game.addPlugin()`:

### Physics2DSystem

- Deterministic 2D physics with fixed-point math
- Collision detection (circle-circle, rect-rect, circle-rect)
- Body types: DYNAMIC, STATIC, KINEMATIC
- Sensor/trigger support

### AutoRenderer

- Automatic canvas rendering from Sprite components
- Interpolation between simulation frames
- Layer-based z-ordering

### InputPlugin

- Declarative input binding (`action('move', { bindings: ['keys:wasd'] })`)
- Vector and button action types
- Automatic network sync

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State storage | Components only | No external bags, everything typed and serializable |
| Entity destruction | Immediate | Destroyed entities removed from indices same frame |
| Render state | Separate `entity.render` | Client-only, never serialized |
| Sync model | Hash consensus | Majority-based verification, no authority trust |
| Desync handling | Hard recovery | Request full snapshot on hash mismatch |
| Physics | Fixed-point | Cross-platform bit-exact determinism |

## Performance Considerations

- **SoA storage**: Cache-friendly iteration
- **Sparse snapshots**: Only serialize non-default values
- **Query caching**: Incremental index updates
- **Entity pooling**: Reuse entity objects
- **Fixed-point**: Integer math faster than float on some platforms
