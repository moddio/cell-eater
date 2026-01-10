/**
 * Delta Performance Test
 *
 * Tests that delta computation correctly identifies only changed entities.
 * This reproduces the issue where delta bandwidth was 9.3 kB/s when only 2 entities moved.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { World } from '../core/world';
import { Transform2D, Body2D, Sprite, SHAPE_CIRCLE, BODY_STATIC, BODY_DYNAMIC } from '../components';
import { computeStateDelta, isDeltaEmpty, getDeltaSize } from './state-delta';
import { INDEX_MASK } from '../core/constants';

describe('Delta Performance', () => {
    let world: World;

    beforeEach(() => {
        // Don't clear component registry - components are registered at module load
        // and cannot be re-registered
        world = new World();
    });

    afterEach(() => {
        // Reset world state
        world.reset();
    });

    test('detects only changed entities when most are static', () => {
        // Define entity types using the correct World API
        world.defineEntity('food')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 8 })
            .with(Body2D, { bodyType: BODY_STATIC });

        world.defineEntity('cell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE, radius: 20 })
            .with(Body2D, { bodyType: BODY_DYNAMIC });

        // Create 100 static food entities
        for (let i = 0; i < 100; i++) {
            world.spawn('food', { x: i * 10, y: i * 10 });
        }

        // Create 2 moving cell entities
        const cell1 = world.spawn('cell', { x: 100, y: 100 });
        const cell2 = world.spawn('cell', { x: 200, y: 200 });

        // Take first snapshot
        world.frame = 1;
        const snapshot1 = world.getSparseSnapshot();

        // Move only the cells - modify the raw storage directly for accuracy
        // Note: entity.get(Transform2D) returns a proxy that handles fixed-point conversion
        const index1 = cell1.eid & INDEX_MASK;
        const index2 = cell2.eid & INDEX_MASK;
        Transform2D.storage.fields['x'][index1] = 110 * 65536;
        Transform2D.storage.fields['y'][index1] = 110 * 65536;
        Transform2D.storage.fields['x'][index2] = 210 * 65536;
        Transform2D.storage.fields['y'][index2] = 210 * 65536;

        // Take second snapshot
        world.frame = 2;
        const snapshot2 = world.getSparseSnapshot();

        // Debug: examine snapshots
        console.log('Snapshot 1:');
        console.log('  entityCount:', snapshot1.entityCount);
        console.log('  componentData keys:', Array.from(snapshot1.componentData.keys()));

        // Compute delta
        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Delta stats:');
        console.log('  Created:', delta.created.length);
        console.log('  Updated:', delta.updated.length);
        console.log('  Deleted:', delta.deleted.length);
        console.log('  Delta size:', getDeltaSize(delta), 'bytes');

        // Should only have 2 updated entities (the cells that moved)
        expect(delta.created.length).toBe(0);
        expect(delta.deleted.length).toBe(0);
        expect(delta.updated.length).toBe(2); // Only the 2 cells that moved

        // Verify the updated entities are the cells
        const updatedEids = delta.updated.map(u => u.eid);
        expect(updatedEids).toContain(cell1.eid);
        expect(updatedEids).toContain(cell2.eid);
    });

    test('identical snapshots produce empty delta', () => {
        // Define entity type
        world.defineEntity('staticFood')
            .with(Transform2D)
            .with(Sprite);

        // Create some entities
        for (let i = 0; i < 50; i++) {
            world.spawn('staticFood', { x: i, y: i });
        }

        // Take two snapshots without changing anything
        world.frame = 1;
        const snapshot1 = world.getSparseSnapshot();

        world.frame = 2;
        const snapshot2 = world.getSparseSnapshot();

        const delta = computeStateDelta(snapshot1, snapshot2);

        expect(isDeltaEmpty(delta)).toBe(true);
        expect(delta.created.length).toBe(0);
        expect(delta.updated.length).toBe(0);
        expect(delta.deleted.length).toBe(0);
    });

    test('only includes changed fields in updates', () => {
        world.defineEntity('movableEntity')
            .with(Transform2D)
            .with(Sprite);

        const entity = world.spawn('movableEntity', { x: 100, y: 200 });

        world.frame = 1;
        const snapshot1 = world.getSparseSnapshot();

        // Only change x, not y or angle (directly modify storage)
        const index = entity.eid & INDEX_MASK;
        Transform2D.storage.fields['x'][index] = 150 * 65536;

        world.frame = 2;
        const snapshot2 = world.getSparseSnapshot();

        const delta = computeStateDelta(snapshot1, snapshot2);

        expect(delta.updated.length).toBe(1);
        const update = delta.updated[0];
        expect(update.eid).toBe(entity.eid);

        // Should only have Transform2D.x changed
        expect(update.changes['Transform2D']).toBeDefined();
        expect(update.changes['Transform2D'].x).toBe(150 * 65536);
        // y and angle should NOT be in changes since they didn't change
        expect(update.changes['Transform2D'].y).toBeUndefined();
        expect(update.changes['Transform2D'].angle).toBeUndefined();
    });

    test('large world with few moving entities has small delta', () => {
        // This simulates the cell-eater scenario: 1604 entities, only 2 moving
        world.defineEntity('staticPellet')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE })
            .with(Body2D, { bodyType: BODY_STATIC });

        world.defineEntity('movingCell')
            .with(Transform2D)
            .with(Sprite, { shape: SHAPE_CIRCLE })
            .with(Body2D, { bodyType: BODY_DYNAMIC });

        // Create ~1600 static food entities (like in cell-eater)
        for (let i = 0; i < 1600; i++) {
            world.spawn('staticPellet', { x: (i % 100) * 10, y: Math.floor(i / 100) * 10 });
        }

        // Create 4 moving cells (like 2 players)
        const cells: any[] = [];
        for (let i = 0; i < 4; i++) {
            cells.push(world.spawn('movingCell', { x: 500 + i * 50, y: 500 + i * 50 }));
        }

        // Take first snapshot
        world.frame = 1;
        const snapshot1 = world.getSparseSnapshot();

        // Move only the cells (directly modify storage)
        for (const cell of cells) {
            const index = cell.eid & INDEX_MASK;
            Transform2D.storage.fields['x'][index] += 10 * 65536;
            Transform2D.storage.fields['y'][index] += 5 * 65536;
        }

        // Take second snapshot
        world.frame = 2;
        const snapshot2 = world.getSparseSnapshot();

        // Compute delta
        const delta = computeStateDelta(snapshot1, snapshot2);

        console.log('Large world delta stats:');
        console.log('  Total entities:', world.entityCount);
        console.log('  Created:', delta.created.length);
        console.log('  Updated:', delta.updated.length);
        console.log('  Deleted:', delta.deleted.length);
        console.log('  Delta size:', getDeltaSize(delta), 'bytes');

        // CRITICAL: Should only have 4 updated entities (the moving cells)
        // If this shows more than 4, there's a bug in delta computation
        expect(delta.updated.length).toBe(4);
        expect(delta.created.length).toBe(0);
        expect(delta.deleted.length).toBe(0);

        // Delta should be small (< 1KB) for just 4 entity updates
        const deltaSize = getDeltaSize(delta);
        expect(deltaSize).toBeLessThan(1000);
        console.log('  Expected ~4 updates, got', delta.updated.length);
    });
});
