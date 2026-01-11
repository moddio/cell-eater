/**
 * Second Client Join Desync Reproduction Test
 *
 * Reproduces the bug: "desync happens immediately when a second client joins"
 * From user screenshot:
 * - Client 1 (authority): Entities: 1607, Hash: cb6cc8bb, Status: DESYNCED
 * - Client 2 (late-joiner): Entities: 1606, Hash: 72e68b42, Status: 100% sync
 *
 * Key observation: 1 entity difference (1607 vs 1606) - suggests something
 * is spawning/not spawning on one side during the join process.
 */
import { describe, test, expect, vi } from 'vitest';
import { Game } from '../game';
import { Transform2D, Player, Sprite, Body2D, SHAPE_CIRCLE } from '../components';
import { encode, decode } from '../codec';
import { dRandom, saveRandomState, loadRandomState } from '../math/random';

// Mock connection
function createMockConnection(clientId: string) {
    return {
        clientId,
        send: vi.fn(),
        sendSnapshot: vi.fn(),
        sendStateHash: vi.fn(),
        sendPartitionData: vi.fn(),
        onMessage: vi.fn(),
        onInput: vi.fn(),
        close: vi.fn()
    };
}

describe('Second Client Join Desync', () => {
    /**
     * This test reproduces the exact cell-eater scenario:
     * 1. Authority client joins, onRoomCreate spawns food, onConnect spawns player
     * 2. Run several ticks (food spawning system adds more food)
     * 3. Second client joins -> receives snapshot + inputs
     * 4. Second client runs catchup
     * 5. Compare hashes - should match, but bug causes mismatch
     */
    test('REPRODUCE: second client join causes entity count mismatch', () => {
        console.log('\n========== SECOND CLIENT JOIN DESYNC TEST ==========\n');

        // === GAME CONSTANTS (from cell-eater) ===
        const FOOD_COUNT = 60;
        const MAX_FOOD = 100;
        const FOOD_SPAWN_CHANCE = 0.05;
        const WIDTH = 1400;
        const HEIGHT = 900;

        // === AUTHORITY SETUP ===
        const authorityConn = createMockConnection('authority-client-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-client-id';

        // Define entity types like cell-eater
        authority.defineEntity('cell')
            .with(Transform2D)
            .with(Player);

        authority.defineEntity('food')
            .with(Transform2D);

        // Track food spawns
        let authorityFoodSpawned = 0;
        let systemRunCount = 0;

        // Set up callbacks like cell-eater
        (authority as any).callbacks = {
            onRoomCreate: () => {
                console.log('[authority] onRoomCreate: spawning initial food');
                for (let i = 0; i < FOOD_COUNT; i++) {
                    authority.spawn('food', {
                        x: 50 + Math.floor(Math.random() * (WIDTH - 100)),
                        y: 50 + Math.floor(Math.random() * (HEIGHT - 100))
                    });
                    authorityFoodSpawned++;
                }
            },
            onConnect: (clientId: string) => {
                console.log(`[authority] onConnect: ${clientId}`);
                const cell = authority.spawn('cell', {
                    x: 100 + Math.floor(Math.random() * (WIDTH - 200)),
                    y: 100 + Math.floor(Math.random() * (HEIGHT - 200))
                });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            },
            onDisconnect: (clientId: string) => {
                console.log(`[authority] onDisconnect: ${clientId}`);
                const numId = (authority as any).internClientId(clientId);
                for (const entity of authority.query('cell')) {
                    if (entity.get(Player).clientId === numId) {
                        entity.destroy();
                    }
                }
            }
        };

        // Add food spawning system (like cell-eater)
        authority.addSystem(() => {
            const foodCount = authority.getEntitiesByType('food').length;
            if (foodCount < MAX_FOOD && Math.random() < FOOD_SPAWN_CHANCE) {
                authority.spawn('food', {
                    x: 50 + Math.floor(Math.random() * (WIDTH - 100)),
                    y: 50 + Math.floor(Math.random() * (HEIGHT - 100))
                });
                authorityFoodSpawned++;
            }
            systemRunCount++;
        }, { phase: 'update' });

        // === AUTHORITY CLIENT JOINS ===
        console.log('\n--- Authority client joins ---');

        // Simulate onRoomCreate (first client creates room)
        (authority as any).callbacks.onRoomCreate?.();

        // Process join input
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-client-id',
            data: { type: 'join', clientId: 'authority-client-id' }
        });

        console.log(`After join: entities=${(authority as any).world.entityCount}`);

        // Run several ticks (like the game would run)
        console.log('\n--- Running ticks on authority ---');
        for (let frame = 0; frame < 100; frame++) {
            (authority as any).world.tick(frame);
        }

        const authorityEntitiesBeforeSecondJoin = (authority as any).world.entityCount;
        const authorityHashBeforeSecondJoin = (authority as any).world.getStateHash();
        console.log(`After 100 ticks: entities=${authorityEntitiesBeforeSecondJoin}, hash=${authorityHashBeforeSecondJoin.toString(16)}`);
        console.log(`Food spawned by system: ${authorityFoodSpawned - FOOD_COUNT}`);

        // === SECOND CLIENT JOINS ===
        console.log('\n--- Second client joins ---');

        // Process second client join
        (authority as any).processInput({
            seq: 2,
            clientId: 'second-client-id',
            data: { type: 'join', clientId: 'second-client-id' }
        });

        // Run one more tick to process the join
        (authority as any).world.tick(100);

        const authorityEntitiesAfterSecondJoin = (authority as any).world.entityCount;
        console.log(`After second join: entities=${authorityEntitiesAfterSecondJoin}`);

        // Take snapshot for late joiner
        const snapshot = (authority as any).getNetworkSnapshot();
        console.log(`Snapshot frame: ${snapshot.frame}, entities: ${snapshot.entities.length}`);

        // Encode/decode to simulate network transfer
        const encodedSnapshot = encode({ snapshot, hash: (authority as any).world.getStateHash() });
        const decoded = decode(encodedSnapshot) as any;
        const decodedSnapshot = decoded.snapshot;

        // === LATE JOINER SETUP ===
        console.log('\n--- Late joiner receives snapshot ---');

        const lateJoinerConn = createMockConnection('second-client-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-client-id';

        // Define same entity types
        lateJoiner.defineEntity('cell')
            .with(Transform2D)
            .with(Player);

        lateJoiner.defineEntity('food')
            .with(Transform2D);

        // Add same food spawning system - THIS IS CRITICAL
        // If this system runs during catchup, it will spawn extra food!
        lateJoiner.addSystem(() => {
            const foodCount = lateJoiner.getEntitiesByType('food').length;
            if (foodCount < MAX_FOOD && Math.random() < FOOD_SPAWN_CHANCE) {
                lateJoiner.spawn('food', {
                    x: 50 + Math.floor(Math.random() * (WIDTH - 100)),
                    y: 50 + Math.floor(Math.random() * (HEIGHT - 100))
                });
            }
        }, { phase: 'update' });

        // Load snapshot
        (lateJoiner as any).loadNetworkSnapshot(decodedSnapshot);

        const lateJoinerEntitiesAfterSnapshot = (lateJoiner as any).world.entityCount;
        const lateJoinerHashAfterSnapshot = (lateJoiner as any).world.getStateHash();

        console.log(`Late joiner after snapshot: entities=${lateJoinerEntitiesAfterSnapshot}, hash=${lateJoinerHashAfterSnapshot.toString(16)}`);

        // === COMPARE ===
        console.log('\n========== COMPARISON ==========');
        console.log(`Authority entities: ${authorityEntitiesAfterSecondJoin}`);
        console.log(`Late joiner entities: ${lateJoinerEntitiesAfterSnapshot}`);
        console.log(`Authority hash: ${(authority as any).world.getStateHash().toString(16)}`);
        console.log(`Late joiner hash: ${lateJoinerHashAfterSnapshot.toString(16)}`);

        const entitiesDiff = authorityEntitiesAfterSecondJoin - lateJoinerEntitiesAfterSnapshot;
        if (entitiesDiff !== 0) {
            console.log(`\n!!! BUG REPRODUCED: ${Math.abs(entitiesDiff)} entity difference !!!`);
        }

        const hashMatch = (authority as any).world.getStateHash() === lateJoinerHashAfterSnapshot;
        if (!hashMatch) {
            console.log('\n!!! BUG REPRODUCED: Hash mismatch - DESYNCED !!!');
        }

        // Assertions
        expect(lateJoinerEntitiesAfterSnapshot).toBe(authorityEntitiesAfterSecondJoin);
        expect(lateJoinerHashAfterSnapshot).toBe((authority as any).world.getStateHash());
    });

    /**
     * Minimal test: Just join sequence without systems
     */
    test('minimal: second client join with no systems', () => {
        console.log('\n========== MINIMAL JOIN TEST ==========\n');

        const authorityConn = createMockConnection('authority-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-id';

        authority.defineEntity('food').with(Transform2D);
        authority.defineEntity('cell').with(Transform2D).with(Player);

        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                console.log(`[authority] onConnect: ${clientId}`);
                const cell = authority.spawn('cell', { x: 100, y: 100 });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // Spawn some food
        for (let i = 0; i < 50; i++) {
            authority.spawn('food', { x: i * 10, y: i * 10 });
        }

        // Authority joins
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-id',
            data: { type: 'join', clientId: 'authority-id' }
        });
        (authority as any).world.tick(0);

        console.log(`Authority after join: entities=${(authority as any).world.entityCount}`);

        // Run some ticks
        for (let frame = 1; frame <= 10; frame++) {
            (authority as any).world.tick(frame);
        }

        console.log(`Authority after ticks: entities=${(authority as any).world.entityCount}`);

        // Second client joins
        (authority as any).processInput({
            seq: 2,
            clientId: 'second-id',
            data: { type: 'join', clientId: 'second-id' }
        });
        (authority as any).world.tick(11);

        const authorityEntities = (authority as any).world.entityCount;
        const authorityHash = (authority as any).world.getStateHash();

        console.log(`Authority after second join: entities=${authorityEntities}, hash=${authorityHash.toString(16)}`);

        // Take snapshot
        const snapshot = (authority as any).getNetworkSnapshot();
        const encoded = encode({ snapshot, hash: authorityHash });
        const decoded = decode(encoded) as any;

        // Late joiner loads snapshot
        const lateJoinerConn = createMockConnection('second-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-id';

        lateJoiner.defineEntity('food').with(Transform2D);
        lateJoiner.defineEntity('cell').with(Transform2D).with(Player);

        (lateJoiner as any).loadNetworkSnapshot(decoded.snapshot);

        const lateJoinerEntities = (lateJoiner as any).world.entityCount;
        const lateJoinerHash = (lateJoiner as any).world.getStateHash();

        console.log(`Late joiner after snapshot: entities=${lateJoinerEntities}, hash=${lateJoinerHash.toString(16)}`);

        // Compare
        console.log('\n--- Comparison ---');
        console.log(`Authority: ${authorityEntities} entities, hash=${authorityHash.toString(16)}`);
        console.log(`Late joiner: ${lateJoinerEntities} entities, hash=${lateJoinerHash.toString(16)}`);

        expect(lateJoinerEntities).toBe(authorityEntities);
        expect(lateJoinerHash).toBe(authorityHash);
    });

    /**
     * Test with high entity count (closer to 1600+ in the bug report)
     */
    test('high entity count: 1600+ entities like bug report', () => {
        console.log('\n========== HIGH ENTITY COUNT TEST ==========\n');

        const authorityConn = createMockConnection('authority-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-id';

        authority.defineEntity('food').with(Transform2D);
        authority.defineEntity('cell').with(Transform2D).with(Player);

        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                const cell = authority.spawn('cell', { x: 100, y: 100 });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // Spawn 1600 food entities (like the bug report shows ~1607 entities)
        console.log('Spawning 1600 food entities...');
        for (let i = 0; i < 1600; i++) {
            authority.spawn('food', { x: (i % 100) * 10, y: Math.floor(i / 100) * 10 });
        }

        // Authority joins
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-id',
            data: { type: 'join', clientId: 'authority-id' }
        });
        (authority as any).world.tick(0);

        console.log(`Authority after join: entities=${(authority as any).world.entityCount}`);

        // Run some ticks
        for (let frame = 1; frame <= 50; frame++) {
            (authority as any).world.tick(frame);
        }

        // Second client joins
        (authority as any).processInput({
            seq: 2,
            clientId: 'second-id',
            data: { type: 'join', clientId: 'second-id' }
        });
        (authority as any).world.tick(51);

        const authorityEntities = (authority as any).world.entityCount;
        const authorityHash = (authority as any).world.getStateHash();

        console.log(`Authority: entities=${authorityEntities}, hash=${authorityHash.toString(16)}`);

        // Take snapshot
        const snapshot = (authority as any).getNetworkSnapshot();
        const encoded = encode({ snapshot, hash: authorityHash });
        const decoded = decode(encoded) as any;

        // Late joiner loads snapshot
        const lateJoinerConn = createMockConnection('second-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-id';

        lateJoiner.defineEntity('food').with(Transform2D);
        lateJoiner.defineEntity('cell').with(Transform2D).with(Player);

        (lateJoiner as any).loadNetworkSnapshot(decoded.snapshot);

        const lateJoinerEntities = (lateJoiner as any).world.entityCount;
        const lateJoinerHash = (lateJoiner as any).world.getStateHash();

        console.log(`Late joiner: entities=${lateJoinerEntities}, hash=${lateJoinerHash.toString(16)}`);

        // Detailed comparison
        console.log('\n--- Comparison ---');
        const entitiesDiff = authorityEntities - lateJoinerEntities;
        console.log(`Entity difference: ${entitiesDiff}`);

        if (authorityHash !== lateJoinerHash) {
            console.log('!!! HASH MISMATCH - DESYNCED !!!');

            // Try to find which entities differ
            const authorityEids = new Set<number>();
            for (const e of (authority as any).world.getAllEntities()) {
                authorityEids.add(e.eid);
            }

            const lateJoinerEids = new Set<number>();
            for (const e of (lateJoiner as any).world.getAllEntities()) {
                lateJoinerEids.add(e.eid);
            }

            // Find entities only on authority
            const onlyAuthority: number[] = [];
            for (const eid of authorityEids) {
                if (!lateJoinerEids.has(eid)) {
                    onlyAuthority.push(eid);
                }
            }

            // Find entities only on late joiner
            const onlyLateJoiner: number[] = [];
            for (const eid of lateJoinerEids) {
                if (!authorityEids.has(eid)) {
                    onlyLateJoiner.push(eid);
                }
            }

            if (onlyAuthority.length > 0) {
                console.log(`Entities only on authority: ${onlyAuthority.slice(0, 10).join(', ')}${onlyAuthority.length > 10 ? '...' : ''}`);
            }
            if (onlyLateJoiner.length > 0) {
                console.log(`Entities only on late joiner: ${onlyLateJoiner.slice(0, 10).join(', ')}${onlyLateJoiner.length > 10 ? '...' : ''}`);
            }
        }

        expect(lateJoinerEntities).toBe(authorityEntities);
        expect(lateJoinerHash).toBe(authorityHash);
    });

    /**
     * Test with full catchup simulation (like the real network flow)
     * This is the most accurate reproduction of what happens:
     * 1. Authority runs N ticks
     * 2. Second client joins
     * 3. Authority takes snapshot
     * 4. Late joiner loads snapshot + runs catchup with pending inputs
     */
    test('full catchup simulation with pending inputs', () => {
        console.log('\n========== FULL CATCHUP SIMULATION ==========\n');

        // Import dRandom for deterministic random
        // dRandom, saveRandomState, loadRandomState already imported at top

        const WIDTH = 1400;
        const HEIGHT = 900;
        const FOOD_COUNT = 60;
        const MAX_FOOD = 100;
        const FOOD_SPAWN_CHANCE = 0.05;

        // === AUTHORITY SETUP ===
        const authorityConn = createMockConnection('authority-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-id';

        authority.defineEntity('food').with(Transform2D);
        authority.defineEntity('cell').with(Transform2D).with(Player);

        // Food spawning system with dRandom (deterministic)
        authority.addSystem(() => {
            const foodCount = authority.getEntitiesByType('food').length;
            if (foodCount < MAX_FOOD && dRandom() < FOOD_SPAWN_CHANCE) {
                authority.spawn('food', {
                    x: 50 + ((dRandom() * (WIDTH - 100)) | 0),
                    y: 50 + ((dRandom() * (HEIGHT - 100)) | 0)
                });
            }
        }, { phase: 'update' });

        (authority as any).callbacks = {
            onRoomCreate: () => {
                console.log('[authority] onRoomCreate');
                for (let i = 0; i < FOOD_COUNT; i++) {
                    authority.spawn('food', {
                        x: 50 + ((dRandom() * (WIDTH - 100)) | 0),
                        y: 50 + ((dRandom() * (HEIGHT - 100)) | 0)
                    });
                }
            },
            onConnect: (clientId: string) => {
                console.log(`[authority] onConnect: ${clientId}`);
                const cell = authority.spawn('cell', {
                    x: 100 + ((dRandom() * (WIDTH - 200)) | 0),
                    y: 100 + ((dRandom() * (HEIGHT - 200)) | 0)
                });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // === AUTHORITY FLOW ===
        // 1. Room created
        (authority as any).callbacks.onRoomCreate?.();

        // 2. Authority joins
        const inputs: any[] = [];
        inputs.push({
            seq: 1,
            clientId: 'authority-id',
            data: { type: 'join', clientId: 'authority-id' },
            frame: 0
        });
        (authority as any).processInput(inputs[0]);
        (authority as any).world.tick(0);

        console.log(`Frame 0: entities=${(authority as any).world.entityCount}`);

        // 3. Run several ticks
        for (let frame = 1; frame <= 50; frame++) {
            (authority as any).world.tick(frame);
        }

        console.log(`Frame 50: entities=${(authority as any).world.entityCount}, hash=${(authority as any).world.getStateHash().toString(16)}`);

        // 4. Second client joins (the join input will be in the pending inputs)
        inputs.push({
            seq: 2,
            clientId: 'second-id',
            data: { type: 'join', clientId: 'second-id' },
            frame: 51
        });
        (authority as any).processInput(inputs[1]);
        (authority as any).world.tick(51);

        console.log(`Frame 51 (after second join): entities=${(authority as any).world.entityCount}`);

        // 5. Run a few more ticks
        for (let frame = 52; frame <= 60; frame++) {
            (authority as any).world.tick(frame);
        }

        const authorityEntities = (authority as any).world.entityCount;
        const authorityHash = (authority as any).world.getStateHash();
        console.log(`Frame 60: entities=${authorityEntities}, hash=${authorityHash.toString(16)}`);

        // 6. Take snapshot for late joiner (at frame 60)
        const snapshot = (authority as any).getNetworkSnapshot();

        // === LATE JOINER SETUP ===
        console.log('\n--- Late joiner receives snapshot ---');

        const lateJoinerConn = createMockConnection('second-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-id';

        lateJoiner.defineEntity('food').with(Transform2D);
        lateJoiner.defineEntity('cell').with(Transform2D).with(Player);

        // Same food spawning system
        lateJoiner.addSystem(() => {
            const foodCount = lateJoiner.getEntitiesByType('food').length;
            if (foodCount < MAX_FOOD && dRandom() < FOOD_SPAWN_CHANCE) {
                lateJoiner.spawn('food', {
                    x: 50 + ((dRandom() * (WIDTH - 100)) | 0),
                    y: 50 + ((dRandom() * (HEIGHT - 100)) | 0)
                });
            }
        }, { phase: 'update' });

        (lateJoiner as any).callbacks = {
            onConnect: (clientId: string) => {
                console.log(`[lateJoiner] onConnect: ${clientId}`);
                const cell = lateJoiner.spawn('cell', {
                    x: 100 + ((dRandom() * (WIDTH - 200)) | 0),
                    y: 100 + ((dRandom() * (HEIGHT - 200)) | 0)
                });
                cell.get(Player).clientId = (lateJoiner as any).internClientId(clientId);
            }
        };

        // Encode/decode snapshot
        const encoded = encode({ snapshot, hash: authorityHash });
        const decoded = decode(encoded) as any;

        // Load snapshot
        (lateJoiner as any).loadNetworkSnapshot(decoded.snapshot);

        const lateJoinerEntities = (lateJoiner as any).world.entityCount;
        const lateJoinerHash = (lateJoiner as any).world.getStateHash();

        console.log(`Late joiner after snapshot: entities=${lateJoinerEntities}, hash=${lateJoinerHash.toString(16)}`);

        // === COMPARISON ===
        console.log('\n--- Comparison ---');
        console.log(`Authority: ${authorityEntities} entities, hash=${authorityHash.toString(16)}`);
        console.log(`Late joiner: ${lateJoinerEntities} entities, hash=${lateJoinerHash.toString(16)}`);

        const entitiesDiff = authorityEntities - lateJoinerEntities;
        if (entitiesDiff !== 0) {
            console.log(`!!! Entity difference: ${entitiesDiff} !!!`);
        }

        expect(lateJoinerEntities).toBe(authorityEntities);
        expect(lateJoinerHash).toBe(authorityHash);
    });

    /**
     * Test: authority runs more ticks after snapshot is taken
     * This simulates the scenario where:
     * 1. Authority takes snapshot at frame N
     * 2. Authority continues running ticks N+1, N+2, ...
     * 3. Late joiner loads snapshot (frame N) and catches up to frame M
     * 4. They should match at frame M
     */
    test('authority continues running after snapshot - must still sync', () => {
        console.log('\n========== AUTHORITY CONTINUES AFTER SNAPSHOT ==========\n');

        const authorityConn = createMockConnection('authority-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-id';

        authority.defineEntity('food').with(Transform2D);
        authority.defineEntity('cell').with(Transform2D).with(Player);

        // Food spawning system with deterministic random
        authority.addSystem(() => {
            if (authority.getEntitiesByType('food').length < 100 && dRandom() < 0.1) {
                authority.spawn('food', {
                    x: (dRandom() * 1000) | 0,
                    y: (dRandom() * 1000) | 0
                });
            }
        }, { phase: 'update' });

        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                const cell = authority.spawn('cell', { x: (dRandom() * 500) | 0, y: (dRandom() * 500) | 0 });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // Spawn initial food
        for (let i = 0; i < 50; i++) {
            authority.spawn('food', { x: i * 10, y: i * 10 });
        }

        // Authority joins and runs
        (authority as any).currentFrame = 0;  // Set frame like handleTick does
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-id',
            data: { type: 'join', clientId: 'authority-id' },
            frame: 0
        });

        for (let frame = 0; frame <= 50; frame++) {
            (authority as any).currentFrame = frame;  // Set frame like handleTick does
            (authority as any).world.tick(frame);
        }

        console.log(`Authority at frame 50: entities=${(authority as any).world.entityCount}`);

        // Second client joins at frame 51
        (authority as any).currentFrame = 51;  // Set frame like handleTick does
        const joinInput = {
            seq: 2,
            clientId: 'second-id',
            data: { type: 'join', clientId: 'second-id' },
            frame: 51
        };
        (authority as any).processInput(joinInput);
        (authority as any).world.tick(51);

        console.log(`Authority at frame 51 (after join): entities=${(authority as any).world.entityCount}`);

        // === SNAPSHOT TAKEN HERE (after tick 51) ===
        const snapshot = (authority as any).getNetworkSnapshot();
        const snapshotHash = (authority as any).world.getStateHash();
        const snapshotFrame = snapshot.frame;
        const snapshotSeq = snapshot.seq;

        console.log(`Snapshot taken: frame=${snapshotFrame}, seq=${snapshotSeq}, entities=${snapshot.entities.length}`);

        // Authority CONTINUES running ticks
        for (let frame = 52; frame <= 60; frame++) {
            (authority as any).currentFrame = frame;  // Set frame like handleTick does
            (authority as any).world.tick(frame);
        }

        const authorityEntities = (authority as any).world.entityCount;
        const authorityHash = (authority as any).world.getStateHash();
        console.log(`Authority at frame 60: entities=${authorityEntities}, hash=${authorityHash.toString(16)}`);

        // === LATE JOINER RECEIVES SNAPSHOT ===
        const lateJoinerConn = createMockConnection('second-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-id';

        lateJoiner.defineEntity('food').with(Transform2D);
        lateJoiner.defineEntity('cell').with(Transform2D).with(Player);

        // Same system
        lateJoiner.addSystem(() => {
            if (lateJoiner.getEntitiesByType('food').length < 100 && dRandom() < 0.1) {
                lateJoiner.spawn('food', {
                    x: (dRandom() * 1000) | 0,
                    y: (dRandom() * 1000) | 0
                });
            }
        }, { phase: 'update' });

        (lateJoiner as any).callbacks = {
            onConnect: (clientId: string) => {
                const cell = lateJoiner.spawn('cell', { x: (dRandom() * 500) | 0, y: (dRandom() * 500) | 0 });
                cell.get(Player).clientId = (lateJoiner as any).internClientId(clientId);
            }
        };

        // Load snapshot
        const encoded = encode({ snapshot, hash: snapshotHash });
        const decoded = decode(encoded) as any;
        (lateJoiner as any).loadNetworkSnapshot(decoded.snapshot);

        console.log(`Late joiner after snapshot: entities=${(lateJoiner as any).world.entityCount}`);
        console.log(`Late joiner clientsWithEntitiesFromSnapshot: [${[...(lateJoiner as any).clientsWithEntitiesFromSnapshot].join(',')}]`);

        // Pending inputs: only inputs after snapshot
        // The join input was processed in the snapshot (seq 2), so it's not pending
        const pendingInputs: any[] = [];

        // Run catchup: frames 52-60 (snapshot was postTick at 51, so start at 52)
        const startFrame = snapshotFrame + 1;
        const endFrame = 60;

        console.log(`Running catchup from frame ${startFrame} to ${endFrame}...`);

        const inputsByFrame = new Map<number, any[]>();
        for (const input of pendingInputs) {
            const frame = input.frame ?? startFrame;
            if (!inputsByFrame.has(frame)) {
                inputsByFrame.set(frame, []);
            }
            inputsByFrame.get(frame)!.push(input);
        }

        for (let f = startFrame; f <= endFrame; f++) {
            (lateJoiner as any).currentFrame = f;  // Set frame like handleTick/runCatchup does
            const frameInputs = inputsByFrame.get(f) || [];
            for (const input of frameInputs) {
                (lateJoiner as any).processInput(input);
            }
            (lateJoiner as any).world.tick(f);
        }

        // Clear clientsWithEntitiesFromSnapshot after catchup (like runCatchup does)
        (lateJoiner as any).clientsWithEntitiesFromSnapshot.clear();

        const lateJoinerEntities = (lateJoiner as any).world.entityCount;
        const lateJoinerHash = (lateJoiner as any).world.getStateHash();

        console.log(`Late joiner at frame 60: entities=${lateJoinerEntities}, hash=${lateJoinerHash.toString(16)}`);

        // === COMPARISON ===
        console.log('\n--- Comparison at frame 60 ---');
        console.log(`Authority: ${authorityEntities} entities, hash=${authorityHash.toString(16)}`);
        console.log(`Late joiner: ${lateJoinerEntities} entities, hash=${lateJoinerHash.toString(16)}`);

        if (authorityEntities !== lateJoinerEntities) {
            console.log(`!!! ENTITY COUNT MISMATCH: ${authorityEntities - lateJoinerEntities} difference !!!`);
        }

        if (authorityHash !== lateJoinerHash) {
            console.log('!!! HASH MISMATCH !!!');
        }

        expect(lateJoinerEntities).toBe(authorityEntities);
        expect(lateJoinerHash).toBe(authorityHash);
    });

    /**
     * Test simulating actual runCatchup behavior
     */
    test('simulating runCatchup with ticks after snapshot', () => {
        console.log('\n========== CATCHUP WITH TICKS TEST ==========\n');

        // dRandom, saveRandomState, loadRandomState already imported at top

        const authorityConn = createMockConnection('authority-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-id';

        authority.defineEntity('food').with(Transform2D);
        authority.defineEntity('cell').with(Transform2D).with(Player);

        // Simple spawn system
        authority.addSystem(() => {
            if (authority.getEntitiesByType('food').length < 100 && dRandom() < 0.1) {
                authority.spawn('food', {
                    x: (dRandom() * 1000) | 0,
                    y: (dRandom() * 1000) | 0
                });
            }
        }, { phase: 'update' });

        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                const cell = authority.spawn('cell', { x: 100, y: 100 });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // Spawn initial food
        for (let i = 0; i < 50; i++) {
            authority.spawn('food', { x: i * 10, y: i * 10 });
        }

        // Authority joins
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-id',
            data: { type: 'join', clientId: 'authority-id' },
            frame: 0
        });
        (authority as any).world.tick(0);

        // Run 30 ticks
        for (let frame = 1; frame <= 30; frame++) {
            (authority as any).world.tick(frame);
        }

        console.log(`Authority at frame 30: entities=${(authority as any).world.entityCount}`);

        // --- SNAPSHOT TAKEN AT FRAME 30 ---
        // The snapshot is taken AFTER tick 30 (postTick: true)
        const snapshot = (authority as any).getNetworkSnapshot();
        const snapshotHash = (authority as any).world.getStateHash();
        console.log(`Snapshot at frame 30: entities=${snapshot.entities.length}, hash=${snapshotHash.toString(16)}`);

        // Second client joins at frame 31
        (authority as any).processInput({
            seq: 2,
            clientId: 'second-id',
            data: { type: 'join', clientId: 'second-id' },
            frame: 31
        });
        (authority as any).world.tick(31);

        // Run more ticks
        for (let frame = 32; frame <= 40; frame++) {
            (authority as any).world.tick(frame);
        }

        const authorityEntities = (authority as any).world.entityCount;
        const authorityHash = (authority as any).world.getStateHash();
        console.log(`Authority at frame 40: entities=${authorityEntities}, hash=${authorityHash.toString(16)}`);

        // === LATE JOINER ===
        const lateJoinerConn = createMockConnection('second-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-id';

        lateJoiner.defineEntity('food').with(Transform2D);
        lateJoiner.defineEntity('cell').with(Transform2D).with(Player);

        // Same system
        lateJoiner.addSystem(() => {
            if (lateJoiner.getEntitiesByType('food').length < 100 && dRandom() < 0.1) {
                lateJoiner.spawn('food', {
                    x: (dRandom() * 1000) | 0,
                    y: (dRandom() * 1000) | 0
                });
            }
        }, { phase: 'update' });

        (lateJoiner as any).callbacks = {
            onConnect: (clientId: string) => {
                const cell = lateJoiner.spawn('cell', { x: 100, y: 100 });
                cell.get(Player).clientId = (lateJoiner as any).internClientId(clientId);
            }
        };

        // Load snapshot
        const encoded = encode({ snapshot, hash: snapshotHash });
        const decoded = decode(encoded) as any;
        (lateJoiner as any).loadNetworkSnapshot(decoded.snapshot);

        console.log(`Late joiner after snapshot: entities=${(lateJoiner as any).world.entityCount}`);

        // Run catchup: frames 31-40 (10 ticks)
        // This is what happens in runCatchup
        const pendingInputs = [
            { seq: 2, clientId: 'second-id', data: { type: 'join', clientId: 'second-id' }, frame: 31 }
        ];

        // Simulate runCatchup
        const startFrame = 31; // postTick: true means start at snapshotFrame + 1
        const endFrame = 40;

        // Build map of frame -> inputs
        const inputsByFrame = new Map<number, any[]>();
        for (const input of pendingInputs) {
            const frame = input.frame ?? startFrame;
            if (!inputsByFrame.has(frame)) {
                inputsByFrame.set(frame, []);
            }
            inputsByFrame.get(frame)!.push(input);
        }

        // Run each tick
        for (let f = startFrame; f <= endFrame; f++) {
            // Process inputs for this frame
            const frameInputs = inputsByFrame.get(f) || [];
            for (const input of frameInputs) {
                (lateJoiner as any).processInput(input);
            }

            // Run world tick
            (lateJoiner as any).world.tick(f);
        }

        const lateJoinerEntities = (lateJoiner as any).world.entityCount;
        const lateJoinerHash = (lateJoiner as any).world.getStateHash();

        console.log(`Late joiner after catchup: entities=${lateJoinerEntities}, hash=${lateJoinerHash.toString(16)}`);

        // === COMPARISON ===
        console.log('\n--- Comparison ---');
        console.log(`Authority: ${authorityEntities} entities, hash=${authorityHash.toString(16)}`);
        console.log(`Late joiner: ${lateJoinerEntities} entities, hash=${lateJoinerHash.toString(16)}`);

        if (authorityEntities !== lateJoinerEntities) {
            console.log(`!!! ENTITY COUNT MISMATCH: ${authorityEntities - lateJoinerEntities} difference !!!`);
        }

        if (authorityHash !== lateJoinerHash) {
            console.log('!!! HASH MISMATCH !!!');
        }

        expect(lateJoinerEntities).toBe(authorityEntities);
        expect(lateJoinerHash).toBe(authorityHash);
    });

    /**
     * DIAGNOSTIC TEST: Log every step of the join process
     * This test is designed to capture the exact entity count at each step
     * to help diagnose where the 1-entity difference occurs.
     */
    test('DIAGNOSTIC: trace entity count through join process', () => {
        console.log('\n========== DIAGNOSTIC: ENTITY COUNT TRACE ==========\n');

        const authorityConn = createMockConnection('authority-id');
        const authority = new Game({ tickRate: 60 });
        (authority as any).connection = authorityConn;
        (authority as any).localClientIdStr = 'authority-id';

        authority.defineEntity('food').with(Transform2D);
        authority.defineEntity('cell').with(Transform2D).with(Player);

        let foodSpawnCount = 0;

        // Track every spawn
        const originalSpawn = authority.spawn.bind(authority);
        authority.spawn = (type: string, props: any) => {
            const entity = originalSpawn(type, props);
            if (type === 'food') {
                foodSpawnCount++;
            }
            console.log(`  [SPAWN] type=${type} eid=${entity.eid} total=${(authority as any).world.entityCount}`);
            return entity;
        };

        // Food spawning system
        authority.addSystem(() => {
            if (authority.getEntitiesByType('food').length < 100 && dRandom() < 0.1) {
                authority.spawn('food', {
                    x: (dRandom() * 1000) | 0,
                    y: (dRandom() * 1000) | 0
                });
            }
        }, { phase: 'update' });

        (authority as any).callbacks = {
            onConnect: (clientId: string) => {
                console.log(`  [onConnect] ${clientId}`);
                const cell = authority.spawn('cell', { x: 100, y: 100 });
                cell.get(Player).clientId = (authority as any).internClientId(clientId);
            }
        };

        // Spawn initial food (like onRoomCreate)
        console.log('--- INITIAL FOOD SPAWN ---');
        for (let i = 0; i < 50; i++) {
            authority.spawn('food', { x: i * 10, y: i * 10 });
        }

        console.log(`\n--- AUTHORITY JOINS ---`);
        (authority as any).currentFrame = 0;
        (authority as any).processInput({
            seq: 1,
            clientId: 'authority-id',
            data: { type: 'join', clientId: 'authority-id' },
            frame: 0
        });

        console.log(`\n--- RUNNING TICKS 0-50 ---`);
        for (let frame = 0; frame <= 50; frame++) {
            (authority as any).currentFrame = frame;
            const beforeCount = (authority as any).world.entityCount;
            (authority as any).world.tick(frame);
            const afterCount = (authority as any).world.entityCount;
            if (afterCount !== beforeCount) {
                console.log(`  [TICK ${frame}] entities changed: ${beforeCount} -> ${afterCount}`);
            }
        }

        const countAfterTicks = (authority as any).world.entityCount;
        console.log(`\nEntity count after 50 ticks: ${countAfterTicks}`);

        console.log(`\n--- SECOND CLIENT JOINS ---`);
        (authority as any).currentFrame = 51;
        const countBeforeJoin = (authority as any).world.entityCount;
        console.log(`  Before processInput: entities=${countBeforeJoin}`);

        (authority as any).processInput({
            seq: 2,
            clientId: 'second-id',
            data: { type: 'join', clientId: 'second-id' },
            frame: 51
        });

        const countAfterJoinInput = (authority as any).world.entityCount;
        console.log(`  After processInput: entities=${countAfterJoinInput}`);

        const countBeforeTick = (authority as any).world.entityCount;
        console.log(`  Before tick 51: entities=${countBeforeTick}`);

        (authority as any).world.tick(51);

        const countAfterTick = (authority as any).world.entityCount;
        console.log(`  After tick 51: entities=${countAfterTick}`);

        console.log(`\n--- TAKING SNAPSHOT ---`);
        const snapshotEntityCount = (authority as any).world.entityCount;
        console.log(`  Entity count when taking snapshot: ${snapshotEntityCount}`);

        const snapshot = (authority as any).getNetworkSnapshot();
        console.log(`  Snapshot entities array length: ${snapshot.entities.length}`);
        console.log(`  Snapshot frame: ${snapshot.frame}`);
        console.log(`  Snapshot seq: ${snapshot.seq}`);

        // CRITICAL CHECK: Do they match?
        if (snapshotEntityCount !== snapshot.entities.length) {
            console.log(`  !!! MISMATCH: world has ${snapshotEntityCount} but snapshot has ${snapshot.entities.length} !!!`);
        }

        console.log(`\n--- LATE JOINER LOADS SNAPSHOT ---`);
        const lateJoinerConn = createMockConnection('second-id');
        const lateJoiner = new Game({ tickRate: 60 });
        (lateJoiner as any).connection = lateJoinerConn;
        (lateJoiner as any).localClientIdStr = 'second-id';

        lateJoiner.defineEntity('food').with(Transform2D);
        lateJoiner.defineEntity('cell').with(Transform2D).with(Player);

        lateJoiner.addSystem(() => {
            if (lateJoiner.getEntitiesByType('food').length < 100 && dRandom() < 0.1) {
                lateJoiner.spawn('food', {
                    x: (dRandom() * 1000) | 0,
                    y: (dRandom() * 1000) | 0
                });
            }
        }, { phase: 'update' });

        (lateJoiner as any).callbacks = {
            onConnect: (clientId: string) => {
                console.log(`  [lateJoiner onConnect] ${clientId}`);
                const cell = lateJoiner.spawn('cell', { x: 100, y: 100 });
                cell.get(Player).clientId = (lateJoiner as any).internClientId(clientId);
            }
        };

        const encoded = encode({ snapshot, hash: (authority as any).world.getStateHash() });
        const decoded = decode(encoded) as any;

        const beforeLoad = (lateJoiner as any).world.entityCount;
        console.log(`  Before loadNetworkSnapshot: entities=${beforeLoad}`);

        (lateJoiner as any).loadNetworkSnapshot(decoded.snapshot);

        const afterLoad = (lateJoiner as any).world.entityCount;
        console.log(`  After loadNetworkSnapshot: entities=${afterLoad}`);
        console.log(`  clientsWithEntitiesFromSnapshot: [${[...(lateJoiner as any).clientsWithEntitiesFromSnapshot].join(',')}]`);

        console.log(`\n========== FINAL COMPARISON ==========`);
        const authorityFinal = (authority as any).world.entityCount;
        const lateJoinerFinal = (lateJoiner as any).world.entityCount;
        const authorityHash = (authority as any).world.getStateHash();
        const lateJoinerHash = (lateJoiner as any).world.getStateHash();

        console.log(`Authority: ${authorityFinal} entities, hash=${authorityHash.toString(16)}`);
        console.log(`Late joiner: ${lateJoinerFinal} entities, hash=${lateJoinerHash.toString(16)}`);

        if (authorityFinal !== lateJoinerFinal) {
            console.log(`\n!!! ENTITY COUNT MISMATCH: ${authorityFinal - lateJoinerFinal} difference !!!`);
        }

        if (authorityHash !== lateJoinerHash) {
            console.log(`!!! HASH MISMATCH !!!`);
        }

        expect(lateJoinerFinal).toBe(authorityFinal);
        expect(lateJoinerHash).toBe(authorityHash);
    });
});
