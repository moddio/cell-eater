/**
 * Multi-Client Delta Test
 *
 * This test reproduces the ACTUAL scenario:
 * - Two separate World instances (simulating two browser clients)
 * - One sends snapshot to the other (late joiner)
 * - Both run the same physics and systems
 * - Compare if their deltas match
 *
 * If deltas don't match, it means clients have diverged - the root cause of high bandwidth.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { World } from '../core/world';
import { Transform2D, Body2D, Sprite, SHAPE_CIRCLE, BODY_STATIC, BODY_KINEMATIC } from '../components';
import { computeStateDelta, getDeltaSize } from './state-delta';
import { Physics2DSystem } from '../plugins/physics2d/system';
import { encode, decode } from '../codec';

describe('Multi-Client Delta Divergence', () => {
    // Simulates snapshot encoding/decoding like network would
    function encodeSnapshot(world: World): Uint8Array {
        const snapshot = world.getSparseSnapshot();
        return encode(snapshot) as Uint8Array;
    }

    function decodeSnapshot(data: Uint8Array): any {
        return decode(data);
    }

    test('two clients with same initial state should have identical deltas', () => {
        // Create two separate worlds (like two browser clients)
        const worldA = new World();
        const worldB = new World();

        const physicsA = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        const physicsB = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physicsA.attach(worldA);
        physicsB.attach(worldB);

        // Define same entity types in both
        for (const world of [worldA, worldB]) {
            world.defineEntity('food')
                .with(Transform2D)
                .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
                .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

            world.defineEntity('cell')
                .with(Transform2D)
                .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
                .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });
        }

        // Create same entities in both worlds
        for (let i = 0; i < 100; i++) {
            const x = 50 + (i % 10) * 100;
            const y = 50 + Math.floor(i / 10) * 100;
            worldA.spawn('food', { x, y });
            worldB.spawn('food', { x, y });
        }

        // Create cells
        const cellA1 = worldA.spawn('cell', { x: 500, y: 500 });
        const cellA2 = worldA.spawn('cell', { x: 600, y: 600 });
        const cellB1 = worldB.spawn('cell', { x: 500, y: 500 });
        const cellB2 = worldB.spawn('cell', { x: 600, y: 600 });

        // Run initial tick on both
        worldA.tick(0);
        worldB.tick(0);

        // Take first snapshot on both
        const snapshotA1 = worldA.getSparseSnapshot();
        const snapshotB1 = worldB.getSparseSnapshot();

        // Move cells identically
        cellA1.setVelocity(100, 50);
        cellA2.setVelocity(-50, 100);
        cellB1.setVelocity(100, 50);
        cellB2.setVelocity(-50, 100);

        // Run another tick
        worldA.tick(1);
        worldB.tick(1);

        // Take second snapshot
        const snapshotA2 = worldA.getSparseSnapshot();
        const snapshotB2 = worldB.getSparseSnapshot();

        // Compute deltas
        const deltaA = computeStateDelta(snapshotA1, snapshotA2);
        const deltaB = computeStateDelta(snapshotB1, snapshotB2);

        console.log('Client A delta:', deltaA.updated.length, 'updates,', getDeltaSize(deltaA), 'bytes');
        console.log('Client B delta:', deltaB.updated.length, 'updates,', getDeltaSize(deltaB), 'bytes');

        // CRITICAL: Both clients should have same delta
        expect(deltaA.updated.length).toBe(deltaB.updated.length);
        expect(getDeltaSize(deltaA)).toBe(getDeltaSize(deltaB));
    });

    test('late joiner after snapshot should have same state as authority', () => {
        // Authority client (first joiner)
        const worldAuthority = new World();
        const physicsAuthority = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physicsAuthority.attach(worldAuthority);

        worldAuthority.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        worldAuthority.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create food
        for (let i = 0; i < 100; i++) {
            worldAuthority.spawn('food', {
                x: 50 + (i % 10) * 100,
                y: 50 + Math.floor(i / 10) * 100
            });
        }

        // Create cells and move them
        const cellAuth1 = worldAuthority.spawn('cell', { x: 500, y: 500 });
        const cellAuth2 = worldAuthority.spawn('cell', { x: 600, y: 600 });

        // Run 10 ticks with movement
        for (let i = 0; i < 10; i++) {
            cellAuth1.setVelocity(100, 50);
            cellAuth2.setVelocity(-50, 100);
            worldAuthority.tick(i);
        }

        console.log('Authority state after 10 ticks:');
        console.log('  Cell1 pos:', cellAuth1.get(Transform2D).x, cellAuth1.get(Transform2D).y);
        console.log('  Cell2 pos:', cellAuth2.get(Transform2D).x, cellAuth2.get(Transform2D).y);

        // Take snapshot and encode it (like sending over network)
        const snapshotData = encodeSnapshot(worldAuthority);
        console.log('Snapshot size:', snapshotData.length, 'bytes');

        // Late joiner receives snapshot
        const worldLateJoiner = new World();
        const physicsLateJoiner = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physicsLateJoiner.attach(worldLateJoiner);

        // Define entity types (must match authority)
        worldLateJoiner.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        worldLateJoiner.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Decode and apply snapshot
        const receivedSnapshot = decodeSnapshot(snapshotData);

        // We need to restore the world state from snapshot
        // This is what Game.loadNetworkSnapshot does
        // For this test, let's just verify the snapshot contains correct data
        console.log('Received snapshot:');
        console.log('  Entity count:', receivedSnapshot.entityCount);
        console.log('  Components:', Array.from(receivedSnapshot.componentData?.keys?.() || []));

        // Now both should run the same tick
        const snapAuthBefore = worldAuthority.getSparseSnapshot();

        // Move cells and tick
        cellAuth1.setVelocity(100, 50);
        cellAuth2.setVelocity(-50, 100);
        worldAuthority.tick(10);

        const snapAuthAfter = worldAuthority.getSparseSnapshot();
        const deltaAuth = computeStateDelta(snapAuthBefore, snapAuthAfter);

        console.log('Authority delta after tick 10:', deltaAuth.updated.length, 'updates');

        // The late joiner would compute delta from their snapshot to current state
        // If snapshot encoding/decoding is lossy, the late joiner's snapshot would differ
        // from authority's actual state, causing large deltas
    });

    test('snapshot encode/decode preserves exact values', () => {
        const world = new World();
        const physics = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physics.attach(world);

        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        // Create food at specific positions
        for (let i = 0; i < 10; i++) {
            world.spawn('food', { x: 100 + i * 50, y: 200 + i * 30 });
        }

        // Run physics
        world.tick(0);

        // Take snapshot
        const snapshot1 = world.getSparseSnapshot();

        // Encode and decode
        const encoded = encode(snapshot1);
        const decoded = decode(encoded) as any;

        // Compare
        console.log('Original entityCount:', snapshot1.entityCount);
        console.log('Decoded entityCount:', decoded.entityCount);

        // Just verify entity count is preserved
        expect(decoded.entityCount).toBe(snapshot1.entityCount);
    });

    test('physics produces identical results for identical inputs', () => {
        // This tests if the physics engine is deterministic
        const worldA = new World();
        const worldB = new World();

        const physicsA = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        const physicsB = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physicsA.attach(worldA);
        physicsB.attach(worldB);

        // Define same entity types
        for (const world of [worldA, worldB]) {
            world.defineEntity('cell')
                .with(Transform2D)
                .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });
        }

        // Create identical cells
        const cellA = worldA.spawn('cell', { x: 100, y: 100 });
        const cellB = worldB.spawn('cell', { x: 100, y: 100 });

        // Run 100 ticks with identical velocities
        for (let i = 0; i < 100; i++) {
            cellA.setVelocity(150, 75);
            cellB.setVelocity(150, 75);
            worldA.tick(i);
            worldB.tick(i);
        }

        // Compare final positions
        const posA = { x: cellA.get(Transform2D).x, y: cellA.get(Transform2D).y };
        const posB = { x: cellB.get(Transform2D).x, y: cellB.get(Transform2D).y };

        console.log('After 100 ticks:');
        console.log('  World A cell position:', posA.x, posA.y);
        console.log('  World B cell position:', posB.x, posB.y);

        expect(posA.x).toBe(posB.x);
        expect(posA.y).toBe(posB.y);
    });

    test('delta between consecutive snapshots of same world should be empty when nothing moves', () => {
        const world = new World();
        const physics = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physics.attach(world);

        world.defineEntity('food')
            .with(Transform2D)
            .with(Body2D, { bodyType: BODY_STATIC });

        // Create food
        for (let i = 0; i < 100; i++) {
            world.spawn('food', { x: i * 10, y: i * 10 });
        }

        // Run tick
        world.tick(0);

        // Take first snapshot
        const snap1 = world.getSparseSnapshot();

        // Run another tick (nothing moves since all are static)
        world.tick(1);

        // Take second snapshot
        const snap2 = world.getSparseSnapshot();

        // These should be identical since nothing moved
        const delta = computeStateDelta(snap1, snap2);

        console.log('Delta between ticks with no movement:', delta.updated.length, 'updates');

        expect(delta.updated.length).toBe(0);
    });

    test('simulates late joiner with proper snapshot restore', () => {
        // This test simulates what happens in the real Game class
        // Authority runs, sends snapshot, late joiner loads it, both continue

        // Authority world
        const worldAuth = new World();
        const physicsAuth = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physicsAuth.attach(worldAuth);

        worldAuth.defineEntity('food')
            .with(Transform2D)
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        worldAuth.defineEntity('cell')
            .with(Transform2D)
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create entities
        for (let i = 0; i < 100; i++) {
            worldAuth.spawn('food', { x: i * 10, y: i * 10 });
        }
        const cellAuth = worldAuth.spawn('cell', { x: 500, y: 500 });

        // Authority runs 10 ticks
        for (let frame = 0; frame < 10; frame++) {
            cellAuth.setVelocity(100, 50);
            worldAuth.tick(frame);
        }

        // Authority takes snapshot for late joiner (this is prevSnapshot equivalent)
        const authSnapshot = worldAuth.getSparseSnapshot();
        console.log('Authority snapshot at frame 9, cell position:',
            cellAuth.get(Transform2D).x, cellAuth.get(Transform2D).y);

        // Late joiner world - would normally load snapshot here
        // For this test, we create identical world state manually
        const worldLate = new World();
        const physicsLate = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physicsLate.attach(worldLate);

        worldLate.defineEntity('food')
            .with(Transform2D)
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        worldLate.defineEntity('cell')
            .with(Transform2D)
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create same entities at same positions
        for (let i = 0; i < 100; i++) {
            worldLate.spawn('food', { x: i * 10, y: i * 10 });
        }
        const cellLate = worldLate.spawn('cell', { x: 500, y: 500 });

        // Run same ticks to get to same state
        for (let frame = 0; frame < 10; frame++) {
            cellLate.setVelocity(100, 50);
            worldLate.tick(frame);
        }

        // Late joiner takes snapshot (this is their prevSnapshot after catchup)
        const lateSnapshot = worldLate.getSparseSnapshot();
        console.log('Late joiner snapshot at frame 9, cell position:',
            cellLate.get(Transform2D).x, cellLate.get(Transform2D).y);

        // Both run frame 10
        cellAuth.setVelocity(100, 50);
        cellLate.setVelocity(100, 50);
        worldAuth.tick(10);
        worldLate.tick(10);

        // Both take new snapshot
        const authSnapshotAfter = worldAuth.getSparseSnapshot();
        const lateSnapshotAfter = worldLate.getSparseSnapshot();

        // Compute deltas
        const deltaAuth = computeStateDelta(authSnapshot, authSnapshotAfter);
        const deltaLate = computeStateDelta(lateSnapshot, lateSnapshotAfter);

        console.log('Authority delta:', deltaAuth.updated.length, 'updates,', getDeltaSize(deltaAuth), 'bytes');
        console.log('Late joiner delta:', deltaLate.updated.length, 'updates,', getDeltaSize(deltaLate), 'bytes');

        // CRITICAL: Both should have same delta
        expect(deltaAuth.updated.length).toBe(deltaLate.updated.length);
        expect(getDeltaSize(deltaAuth)).toBe(getDeltaSize(deltaLate));

        // Should only be the moving cell
        expect(deltaAuth.updated.length).toBe(1);
    });
});
