/**
 * Spatial Hash Grid for O(1) Broad Phase Collision Detection
 *
 * Divides the world into fixed-size cells. Bodies are hashed to cells
 * based on their position. Collision queries only check nearby cells.
 *
 * Handles oversized entities (larger than cell size) by checking them
 * against all other entities - since there are typically few of these,
 * the O(n) cost is acceptable.
 *
 * Optimal for .io games with many uniform-sized entities (food, bullets)
 * plus a few large obstacles or grown players.
 */
import { RigidBody2D } from './rigid-body';
export declare class SpatialHash2D {
    private cellSize;
    private invCellSize;
    private cells;
    private bodyToCell;
    private oversized;
    private allRegular;
    /**
     * Create a spatial hash grid.
     * @param cellSize Size of each cell. Entities larger than this are
     *                 handled specially (checked against all others).
     */
    constructor(cellSize?: number);
    /**
     * Hash a position to a cell key.
     * Uses bit packing for fast integer key: (x << 16) | y
     */
    private hashPosition;
    /**
     * Clear all cells (call at start of each frame).
     */
    clear(): void;
    /**
     * Insert a body into the grid.
     * Oversized bodies (diameter > cellSize) are tracked separately.
     */
    insert(body: RigidBody2D): void;
    /**
     * Insert all bodies into the grid.
     */
    insertAll(bodies: RigidBody2D[]): void;
    /**
     * Get all bodies in the same cell as a position.
     */
    queryPoint(x: number, y: number): RigidBody2D[];
    /**
     * Get all bodies in the same and adjacent cells (3x3 neighborhood).
     * This handles bodies near cell boundaries.
     */
    queryNearby(body: RigidBody2D): RigidBody2D[];
    /**
     * Query bodies within a radius (for larger entities that span multiple cells).
     */
    queryRadius(x: number, y: number, radius: number): RigidBody2D[];
    /**
     * Iterate over potential collision pairs, calling the callback for each.
     * Each pair is visited exactly once. No Set or deduplication needed -
     * the algorithm structure guarantees uniqueness.
     */
    forEachPair(callback: (a: RigidBody2D, b: RigidBody2D) => void): void;
    /**
     * Get potential collision pairs as an array.
     * For large body counts, prefer forEachPair() to avoid array allocation.
     */
    getPotentialPairs(): Array<[RigidBody2D, RigidBody2D]>;
    /**
     * Get statistics for debugging.
     */
    getStats(): {
        cellCount: number;
        maxPerCell: number;
        avgPerCell: number;
        oversizedCount: number;
    };
}
