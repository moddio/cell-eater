/**
 * Physics Delta Test
 *
 * Tests delta computation with actual physics system running.
 * Reproduces the cell-eater scenario where delta is 9+ kB/s despite only 2 entities moving.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { World } from '../core/world';
import { Transform2D, Body2D, Sprite, SHAPE_CIRCLE, BODY_STATIC, BODY_KINEMATIC } from '../components';
import { computeStateDelta, getDeltaSize } from './state-delta';
import { Physics2DSystem } from '../plugins/physics2d/system';

describe('Physics Delta', () => {
    let world: World;
    let physics: Physics2DSystem;
    let frameCounter: number;

    beforeEach(() => {
        world = new World();
        physics = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physics.attach(world);
        frameCounter = 0;
    });

    function tick() {
        world.tick(frameCounter++);
    }

    test('static food entities should NOT appear in delta after physics tick', () => {
        // Define entity types like cell-eater
        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        world.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create 100 static food entities
        for (let i = 0; i < 100; i++) {
            world.spawn('food', { x: 50 + (i % 10) * 100, y: 50 + Math.floor(i / 10) * 100 });
        }

        // Create 2 kinematic cell entities (like player cells)
        const cell1 = world.spawn('cell', { x: 500, y: 500 });
        const cell2 = world.spawn('cell', { x: 600, y: 600 });

        // Run physics to initialize bodies
        tick();

        // Take first snapshot AFTER physics initialization
        const snapshot1 = world.getSparseSnapshot();

        // Run another physics tick (no input, cells shouldn't move much)
        tick();

        // Take second snapshot
        const snapshot2 = world.getSparseSnapshot();

        // Compute delta
        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Physics delta test:');
        console.log('  Total entities:', world.entityCount);
        console.log('  Updated:', delta.updated.length);
        console.log('  Delta size:', getDeltaSize(delta), 'bytes');

        // Group by type
        const byType: Record<string, number> = {};
        for (const upd of delta.updated) {
            const entity = world.getEntity(upd.eid);
            const type = entity?.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }
        console.log('  By type:', JSON.stringify(byType));

        // Show what components changed
        if (delta.updated.length > 0) {
            const sample = delta.updated.slice(0, 3);
            for (const upd of sample) {
                const entity = world.getEntity(upd.eid);
                console.log(`  Entity ${upd.eid} (${entity?.type}):`, JSON.stringify(upd.changes));
            }
        }

        // CRITICAL: Static food should NOT be in the delta!
        const foodUpdates = byType['food'] || 0;
        expect(foodUpdates).toBe(0);

        // Only cells might be updated (due to physics settling)
        expect(delta.updated.length).toBeLessThan(10);
    });

    test('moving cells with setVelocity should appear in delta', () => {
        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        world.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create 100 static food
        for (let i = 0; i < 100; i++) {
            world.spawn('food', { x: 50 + (i % 10) * 100, y: 50 + Math.floor(i / 10) * 100 });
        }

        // Create 2 cells
        const cell1 = world.spawn('cell', { x: 500, y: 500 });
        const cell2 = world.spawn('cell', { x: 600, y: 600 });

        // Initialize physics
        tick();

        // Take first snapshot
        const snapshot1 = world.getSparseSnapshot();

        // Move cells using setVelocity (like cell-eater does)
        cell1.setVelocity(100, 50);
        cell2.setVelocity(-50, 100);

        // Run physics tick
        tick();

        // Take second snapshot
        const snapshot2 = world.getSparseSnapshot();

        // Compute delta
        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Moving cells delta test:');
        console.log('  Updated:', delta.updated.length);

        // Group by type
        const byType: Record<string, number> = {};
        for (const upd of delta.updated) {
            const entity = world.getEntity(upd.eid);
            const type = entity?.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }
        console.log('  By type:', JSON.stringify(byType));

        // Should have 2 cell updates (the ones we moved)
        expect(byType['cell']).toBe(2);
        // Food should NOT be updated
        expect(byType['food'] || 0).toBe(0);
    });

    test('cell-eater game loop simulation', () => {
        // This simulates the EXACT cell-eater scenario:
        // - 1600 static food
        // - 4 kinematic cells
        // - Movement system that calls setVelocity() for ALL cells EVERY frame

        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        world.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create 1600 static food (like cell-eater)
        for (let i = 0; i < 1600; i++) {
            world.spawn('food', { x: (i % 40) * 150, y: Math.floor(i / 40) * 150 });
        }

        // Create 4 cells (2 players with 2 cells each)
        const cells = [
            world.spawn('cell', { x: 500, y: 500 }),
            world.spawn('cell', { x: 550, y: 550 }),
            world.spawn('cell', { x: 3000, y: 3000 }),
            world.spawn('cell', { x: 3050, y: 3050 }),
        ];

        // Simulate the cell-eater movement system that runs EVERY frame
        function cellEaterMovementSystem() {
            for (const cell of cells) {
                // This is what cell-eater does: calls setVelocity for ALL cells every frame
                // Even if velocity is 0, it's still calling setVelocity
                cell.setVelocity(0, 0);
            }
        }

        // Add the movement system to run in update phase (after physics)
        world.addSystem(cellEaterMovementSystem, { phase: 'update' });

        // Initialize - run a few ticks to stabilize
        for (let i = 0; i < 5; i++) {
            tick();
        }

        // Take first snapshot
        const snapshot1 = world.getSparseSnapshot();

        // Run another tick (movement system will call setVelocity(0,0) for all cells)
        tick();

        // Take second snapshot
        const snapshot2 = world.getSparseSnapshot();

        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Cell-eater simulation:');
        console.log('  Total entities:', world.entityCount);
        console.log('  Updated:', delta.updated.length);
        console.log('  Delta size:', getDeltaSize(delta), 'bytes');

        const byType: Record<string, number> = {};
        for (const upd of delta.updated) {
            const entity = world.getEntity(upd.eid);
            const type = entity?.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }
        console.log('  By type:', JSON.stringify(byType));

        if (delta.updated.length > 0) {
            console.log('  Sample updates:');
            for (const upd of delta.updated.slice(0, 3)) {
                const entity = world.getEntity(upd.eid);
                console.log(`    ${upd.eid} (${entity?.type}):`, JSON.stringify(upd.changes));
            }
        }

        // CRITICAL: With 1600 food and 4 cells, only the cells should be "updated"
        // and even those should show 0 updates if velocity hasn't changed
        expect(byType['food'] || 0).toBe(0);
        expect(delta.updated.length).toBeLessThan(10);
    });

    test('cells actually moving should appear in delta', () => {
        // Simulate what happens when players are actively moving around

        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        world.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });

        // Create 1600 static food
        for (let i = 0; i < 1600; i++) {
            world.spawn('food', { x: (i % 40) * 150, y: Math.floor(i / 40) * 150 });
        }

        // Create 4 cells (2 players)
        const cells = [
            world.spawn('cell', { x: 500, y: 500 }),
            world.spawn('cell', { x: 550, y: 550 }),
            world.spawn('cell', { x: 3000, y: 3000 }),
            world.spawn('cell', { x: 3050, y: 3050 }),
        ];

        // Movement system that moves cells toward a target
        let targetX = 600;
        let targetY = 600;
        function movementSystem() {
            for (const cell of cells) {
                const transform = cell.get(Transform2D);
                const dx = targetX - transform.x;
                const dy = targetY - transform.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const speed = 400;
                const vx = (dx / dist) * speed;
                const vy = (dy / dist) * speed;
                cell.setVelocity(vx, vy);
            }
        }

        world.addSystem(movementSystem, { phase: 'update' });

        // Initialize
        for (let i = 0; i < 5; i++) {
            tick();
        }

        // Take first snapshot
        const snapshot1 = world.getSparseSnapshot();

        // Run 10 more ticks (cells are moving)
        for (let i = 0; i < 10; i++) {
            tick();
        }

        // Take second snapshot
        const snapshot2 = world.getSparseSnapshot();

        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Moving cells test:');
        console.log('  Total entities:', world.entityCount);
        console.log('  Updated:', delta.updated.length);
        console.log('  Delta size:', getDeltaSize(delta), 'bytes');

        const byType: Record<string, number> = {};
        for (const upd of delta.updated) {
            const entity = world.getEntity(upd.eid);
            const type = entity?.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        }
        console.log('  By type:', JSON.stringify(byType));

        // Only 4 cells should be updated (they're moving)
        expect(byType['cell']).toBe(4);
        // NO food should be updated
        expect(byType['food'] || 0).toBe(0);
        // Total should be exactly 4
        expect(delta.updated.length).toBe(4);
    });

    test('syncPhysicsToComponents should not cause false updates', () => {
        world.defineEntity('staticThing')
            .with(Transform2D)
            .with(Body2D, { bodyType: BODY_STATIC });

        // Create entities
        for (let i = 0; i < 50; i++) {
            world.spawn('staticThing', { x: i * 10, y: i * 10 });
        }

        // Initialize physics
        tick();

        // Take snapshot
        const snapshot1 = world.getSparseSnapshot();

        // Run physics again (nothing should change for static bodies)
        tick();

        // Take another snapshot
        const snapshot2 = world.getSparseSnapshot();

        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Static sync test:');
        console.log('  Updated:', delta.updated.length);

        if (delta.updated.length > 0) {
            console.log('  UNEXPECTED UPDATES:');
            for (const upd of delta.updated.slice(0, 5)) {
                console.log(`    Entity ${upd.eid}:`, JSON.stringify(upd.changes));
            }
        }

        // ZERO entities should be updated - static bodies don't move
        expect(delta.updated.length).toBe(0);
    });
});
