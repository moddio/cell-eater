/**
 * Test: Static bodies should NOT cause delta changes
 *
 * Hypothesis: syncPhysicsToComponents writes to ALL bodies every frame,
 * including static bodies, causing them to show up in delta.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { Game } from '../game';
import { Transform2D, Body2D, Sprite, SHAPE_CIRCLE, BODY_STATIC, BODY_KINEMATIC } from '../components';
import { computeStateDelta, getDeltaSize } from './state-delta';
import { Physics2DSystem } from '../plugins/physics2d/system';

describe('Static Body Delta Bug', () => {
    let game: Game;
    let physics: Physics2DSystem;

    beforeEach(() => {
        game = new Game({ tickRate: 60 });
        physics = new Physics2DSystem({ gravity: { x: 0, y: 0 } });
        physics.attach(game.world);

        game.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC, shapeType: SHAPE_CIRCLE, radius: 8 });

        game.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_KINEMATIC, shapeType: SHAPE_CIRCLE, radius: 20 });
    });

    test('static bodies should NOT appear in delta', () => {
        // Create 60 static food entities
        for (let i = 0; i < 60; i++) {
            game.spawn('food', { x: (i % 10) * 100, y: Math.floor(i / 10) * 100 });
        }

        // Create 2 kinematic cells
        game.spawn('cell', { x: 500, y: 500 });
        game.spawn('cell', { x: 600, y: 600 });

        // Run a few frames to stabilize
        for (let i = 0; i < 5; i++) {
            game.world.tick(i);
        }

        // Get baseline snapshot
        const prevSnapshot = game.world.getSparseSnapshot();
        console.log(`After 5 ticks: ${prevSnapshot.entityCount} entities`);

        // Run 10 more frames WITHOUT any movement
        for (let i = 5; i < 15; i++) {
            game.world.tick(i);
        }

        const currentSnapshot = game.world.getSparseSnapshot();
        const delta = computeStateDelta(prevSnapshot, currentSnapshot);

        console.log(`Delta: created=${delta.created.length} updated=${delta.updated.length} deleted=${delta.deleted.length}`);
        console.log(`Delta size: ${getDeltaSize(delta)} bytes`);

        if (delta.updated.length > 0) {
            console.log('Updated entities:');
            for (const upd of delta.updated) {
                const entity = game.world.getEntity(upd.eid);
                console.log(`  eid=${upd.eid} type=${entity?.type} changes=${JSON.stringify(upd.changes)}`);
            }

            // Categorize by type
            const byType: Record<string, number> = {};
            for (const upd of delta.updated) {
                const entity = game.world.getEntity(upd.eid);
                const type = entity?.type || 'unknown';
                byType[type] = (byType[type] || 0) + 1;
            }
            console.log('By type:', byType);
        }

        // CRITICAL: Static food should NOT be in delta
        const foodInDelta = delta.updated.filter(upd => {
            const entity = game.world.getEntity(upd.eid);
            return entity?.type === 'food';
        });

        if (foodInDelta.length > 0) {
            console.log('\n!!! BUG: Static food entities in delta !!!');
            console.log(`${foodInDelta.length} food entities have changes`);
            console.log('Sample:', foodInDelta.slice(0, 3).map(f => ({
                eid: f.eid,
                changes: f.changes
            })));
        }

        // Without movement, delta should be empty
        expect(delta.updated.length).toBe(0);
        expect(delta.created.length).toBe(0);
        expect(delta.deleted.length).toBe(0);
    });

    test('static body values after physics tick', () => {
        // Create one food and one cell
        const food = game.spawn('food', { x: 100.5, y: 200.25 });
        const cell = game.spawn('cell', { x: 500, y: 500 });

        console.log('Initial food position:', {
            x: food.get(Transform2D).x,
            y: food.get(Transform2D).y
        });

        // Run physics tick
        game.world.tick(0);

        console.log('After tick 0 food position:', {
            x: food.get(Transform2D).x,
            y: food.get(Transform2D).y
        });

        const beforeValues = {
            x: food.get(Transform2D).x,
            y: food.get(Transform2D).y,
            vx: food.get(Body2D).vx,
            vy: food.get(Body2D).vy
        };

        // Run more ticks
        for (let i = 1; i <= 5; i++) {
            game.world.tick(i);
        }

        const afterValues = {
            x: food.get(Transform2D).x,
            y: food.get(Transform2D).y,
            vx: food.get(Body2D).vx,
            vy: food.get(Body2D).vy
        };

        console.log('Before:', beforeValues);
        console.log('After:', afterValues);

        // Check if values are identical
        expect(afterValues.x).toBe(beforeValues.x);
        expect(afterValues.y).toBe(beforeValues.y);
        expect(afterValues.vx).toBe(beforeValues.vx);
        expect(afterValues.vy).toBe(beforeValues.vy);
    });

    test('measure delta bandwidth for 60 seconds simulation', () => {
        // Create 60 food + 2 cells (like cell-eater)
        for (let i = 0; i < 60; i++) {
            game.spawn('food', { x: (i % 10) * 100, y: Math.floor(i / 10) * 100 });
        }
        game.spawn('cell', { x: 500, y: 500 });
        game.spawn('cell', { x: 600, y: 600 });

        // Stabilize
        for (let i = 0; i < 10; i++) {
            game.world.tick(i);
        }

        let prevSnapshot = game.world.getSparseSnapshot();
        let totalDeltaBytes = 0;
        const FRAMES = 60; // 1 second at 60fps

        for (let i = 10; i < 10 + FRAMES; i++) {
            game.world.tick(i);
            const currentSnapshot = game.world.getSparseSnapshot();
            const delta = computeStateDelta(prevSnapshot, currentSnapshot);
            totalDeltaBytes += getDeltaSize(delta);
            prevSnapshot = currentSnapshot;
        }

        console.log(`Total delta bytes over ${FRAMES} frames: ${totalDeltaBytes}`);
        console.log(`Bandwidth: ${totalDeltaBytes} B/s (${(totalDeltaBytes / 1024).toFixed(2)} kB/s)`);

        // Without any movement, bandwidth should be near zero
        // If it's >10 kB/s, that's the bug!
        expect(totalDeltaBytes).toBeLessThan(1000); // Should be basically 0
    });
});
