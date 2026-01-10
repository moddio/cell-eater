/**
 * Second Client Join Test
 *
 * Reproduces the EXACT issue: when second client joins, first client's delta spikes to >10kBps.
 *
 * Scenario:
 * 1. First client running alone (activeClients.length === 1)
 * 2. Second client joins (activeClients.length === 2)
 * 3. First client's delta computation starts
 * 4. BUG: Delta is huge (all 1600 entities) instead of small (just the new player)
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { World } from '../core/world';
import { Transform2D, Body2D, Sprite, Player, SHAPE_CIRCLE, BODY_STATIC, BODY_KINEMATIC } from '../components';
import { computeStateDelta, getDeltaSize } from './state-delta';
import { Physics2DSystem } from '../plugins/physics2d/system';
import { SparseSnapshot } from '../core/snapshot';

describe('Second Client Join Delta Spike', () => {
    let world: World;
    let physics: Physics2DSystem;
    let frameCounter: number;
    let prevSnapshot: SparseSnapshot | null;

    beforeEach(() => {
        world = new World();
        physics = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physics.attach(world);
        frameCounter = 0;
        prevSnapshot = null;

        // Define entity types like cell-eater
        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        world.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Player)
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });
    });

    function tick() {
        world.tick(frameCounter++);
        // Simulate what Game.sendStateUpdate does: always update prevSnapshot
        prevSnapshot = world.getSparseSnapshot();
    }

    // This EXACTLY mimics Game.sendStateSync logic
    function sendStateSync(frame: number, activeClientsCount: number): { delta: any, size: number } | null {
        // Line 1161: Always get current snapshot
        const currentSnapshot = world.getSparseSnapshot();

        let result: { delta: any, size: number } | null = null;

        // Line 1165: Only compute delta if activeClients > 1 AND prevSnapshot exists
        if (activeClientsCount > 1 && prevSnapshot) {
            const delta = computeStateDelta(prevSnapshot, currentSnapshot);
            const size = getDeltaSize(delta);
            result = { delta, size };
        }

        // Line 1213: ALWAYS update prevSnapshot (even when alone or when prevSnapshot was null)
        prevSnapshot = currentSnapshot;

        return result;
    }

    test('REPRODUCES BUG: delta spikes when second client joins', () => {
        // Create 1600 static food (like cell-eater)
        for (let i = 0; i < 1600; i++) {
            world.spawn('food', { x: (i % 40) * 150, y: Math.floor(i / 40) * 150 });
        }

        // Create first player's cell
        const player1Cell = world.spawn('cell', { x: 500, y: 500 });
        player1Cell.get(Player).clientId = 1;

        console.log('=== SIMULATING FIRST CLIENT RUNNING ALONE ===');

        // Run 10 ticks as single client (activeClients = 1)
        // Each tick: run systems, then sendStateSync
        for (let i = 0; i < 10; i++) {
            player1Cell.setVelocity(100, 50);
            world.tick(i);

            // sendStateSync is called AFTER tick
            const result = sendStateSync(i, 1);
            if (i === 9) {
                console.log(`Frame ${i}: activeClients=1, prevSnapshot.entityCount=${prevSnapshot?.entityCount}`);
            }
        }

        console.log('\n=== SECOND CLIENT JOINS (during frame 10 processing) ===');

        // Frame 10: JOIN input is processed, THEN systems run, THEN sendStateSync
        // 1. Process join input -> spawn new player's cell
        const player2Cell = world.spawn('cell', { x: 3000, y: 3000 });
        player2Cell.get(Player).clientId = 2;
        console.log(`After join: entityCount=${world.entityCount}`);

        // 2. Run systems (both cells move)
        player1Cell.setVelocity(100, 50);
        player2Cell.setVelocity(-50, 100);
        world.tick(10);

        // 3. sendStateSync with activeClients = 2
        // THIS IS WHERE THE BUG SHOULD MANIFEST
        console.log(`Before sendStateSync: prevSnapshot.entityCount=${prevSnapshot?.entityCount}, world.entityCount=${world.entityCount}`);
        const result = sendStateSync(10, 2);

        console.log('\n=== DELTA AFTER SECOND CLIENT JOINS ===');
        console.log('Total entities:', world.entityCount);

        if (result) {
            console.log('Delta updates:', result.delta.updated.length);
            console.log('Delta created:', result.delta.created.length);
            console.log('Delta deleted:', result.delta.deleted.length);
            console.log('Delta size:', result.size, 'bytes');

            // Group by type
            const byType: Record<string, number> = {};
            for (const upd of result.delta.updated) {
                const entity = world.getEntity(upd.eid);
                const type = entity?.type || 'unknown';
                byType[type] = (byType[type] || 0) + 1;
            }
            console.log('Updates by type:', JSON.stringify(byType));

            // THIS IS THE BUG CHECK:
            // If food entities are in the delta, that's the bug!
            const foodUpdates = byType['food'] || 0;
            const cellUpdates = byType['cell'] || 0;

            console.log('\n=== BUG CHECK ===');
            console.log(`Food updates: ${foodUpdates} (should be 0)`);
            console.log(`Cell updates: ${cellUpdates} (should be 1-2)`);
            console.log(`Created: ${result.delta.created.length} (should be 1 for new player)`);

            // The test will FAIL if food entities are in the delta
            // This reproduces the bug
            if (foodUpdates > 0) {
                console.log('\n!!! BUG REPRODUCED !!!');
                console.log('Food entities are in the delta when they should not be!');

                // Show sample of what changed in food
                const foodSample = result.delta.updated.filter((u: any) => {
                    const entity = world.getEntity(u.eid);
                    return entity?.type === 'food';
                }).slice(0, 3);

                for (const upd of foodSample) {
                    console.log(`  Food entity ${upd.eid} changes:`, JSON.stringify(upd.changes));
                }
            }

            // EXPECTED: Only the moving cells should be updated, plus 1 created entity
            expect(foodUpdates).toBe(0);
            expect(result.delta.created.length).toBe(1); // New player's cell
            expect(result.size).toBeLessThan(1000); // Should be small
        } else {
            console.log('No delta computed (unexpected)');
            expect(result).not.toBeNull();
        }

        // NOW TEST SUBSEQUENT FRAMES - maybe the bug is sustained, not immediate
        console.log('\n=== SUBSEQUENT FRAMES AFTER JOIN ===');
        for (let i = 11; i <= 15; i++) {
            player1Cell.setVelocity(100, 50);
            player2Cell.setVelocity(-50, 100);
            world.tick(i);

            const frameResult = sendStateSync(i, 2);
            if (frameResult) {
                const byType: Record<string, number> = {};
                for (const upd of frameResult.delta.updated) {
                    const entity = world.getEntity(upd.eid);
                    const type = entity?.type || 'unknown';
                    byType[type] = (byType[type] || 0) + 1;
                }
                console.log(`Frame ${i}: updated=${frameResult.delta.updated.length} created=${frameResult.delta.created.length} size=${frameResult.size} byType=${JSON.stringify(byType)}`);

                // Each subsequent frame should have small delta
                if (frameResult.delta.updated.length > 10 || frameResult.size > 1000) {
                    console.log('!!! BUG: Delta too large on subsequent frame !!!');
                    expect(frameResult.delta.updated.length).toBeLessThan(10);
                }
            }
        }
    });

    test('delta should only contain changes, not all entities', () => {
        // Create 1600 food
        for (let i = 0; i < 1600; i++) {
            world.spawn('food', { x: (i % 40) * 150, y: Math.floor(i / 40) * 150 });
        }

        // Create 2 cells
        const cell1 = world.spawn('cell', { x: 500, y: 500 });
        const cell2 = world.spawn('cell', { x: 600, y: 600 });
        cell1.get(Player).clientId = 1;
        cell2.get(Player).clientId = 2;

        // Run a few ticks to stabilize
        for (let i = 0; i < 5; i++) {
            cell1.setVelocity(100, 50);
            cell2.setVelocity(-50, 100);
            tick();
        }

        // Take snapshot (this is prevSnapshot)
        const prevSnap = world.getSparseSnapshot();

        // Run one more tick with movement
        cell1.setVelocity(100, 50);
        cell2.setVelocity(-50, 100);
        tick();

        // Take current snapshot
        const currSnap = world.getSparseSnapshot();

        // Compute delta
        const delta = computeStateDelta(prevSnap, currSnap);
        const size = getDeltaSize(delta);

        console.log('Steady-state delta:');
        console.log('  Updated:', delta.updated.length);
        console.log('  Size:', size, 'bytes');

        // Group by type
        const byType: Record<string, number> = {};
        for (const upd of delta.updated) {
            const entity = world.getEntity(upd.eid);
            const type = entity?.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }
        console.log('  By type:', JSON.stringify(byType));

        // ONLY the moving cells should be updated
        expect(byType['food'] || 0).toBe(0);
        expect(byType['cell']).toBe(2);
        expect(delta.updated.length).toBe(2);
    });
});
