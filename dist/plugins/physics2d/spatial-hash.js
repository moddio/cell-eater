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
import { toFloat, dSqrt } from '../../math/fixed';
import { Shape2DType } from './shapes';
// ============================================
// Helper: Get body radius for size comparison
// ============================================
function getBodyRadius(body) {
    if (body.shape.type === Shape2DType.Circle) {
        return toFloat(body.shape.radius);
    }
    else {
        const box = body.shape;
        // Use diagonal half-length as radius
        const hw = toFloat(box.halfWidth);
        const hh = toFloat(box.halfHeight);
        return dSqrt(hw * hw + hh * hh);
    }
}
// ============================================
// Spatial Hash Grid
// ============================================
export class SpatialHash2D {
    /**
     * Create a spatial hash grid.
     * @param cellSize Size of each cell. Entities larger than this are
     *                 handled specially (checked against all others).
     */
    constructor(cellSize = 64) {
        this.cells = new Map();
        this.bodyToCell = new Map();
        // Oversized entities (diameter > cellSize) - checked against all others
        this.oversized = [];
        // All regular (non-oversized) bodies for oversized checks
        this.allRegular = [];
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
    }
    /**
     * Hash a position to a cell key.
     * Uses bit packing for fast integer key: (x << 16) | y
     */
    hashPosition(x, y) {
        const cellX = Math.floor(x * this.invCellSize) & 0xFFFF;
        const cellY = Math.floor(y * this.invCellSize) & 0xFFFF;
        return (cellX << 16) | cellY;
    }
    /**
     * Clear all cells (call at start of each frame).
     */
    clear() {
        this.cells.clear();
        this.bodyToCell.clear();
        this.oversized.length = 0;
        this.allRegular.length = 0;
    }
    /**
     * Insert a body into the grid.
     * Oversized bodies (diameter > cellSize) are tracked separately.
     */
    insert(body) {
        const radius = getBodyRadius(body);
        const diameter = radius * 2;
        // Oversized entities are checked against everything
        if (diameter > this.cellSize) {
            this.oversized.push(body);
            return;
        }
        // Regular entities go into spatial hash
        this.allRegular.push(body);
        const x = toFloat(body.position.x);
        const y = toFloat(body.position.y);
        const key = this.hashPosition(x, y);
        let cell = this.cells.get(key);
        if (!cell) {
            cell = [];
            this.cells.set(key, cell);
        }
        cell.push(body);
        this.bodyToCell.set(body, key);
    }
    /**
     * Insert all bodies into the grid.
     */
    insertAll(bodies) {
        for (const body of bodies) {
            this.insert(body);
        }
    }
    /**
     * Get all bodies in the same cell as a position.
     */
    queryPoint(x, y) {
        const key = this.hashPosition(x, y);
        return this.cells.get(key) || [];
    }
    /**
     * Get all bodies in the same and adjacent cells (3x3 neighborhood).
     * This handles bodies near cell boundaries.
     */
    queryNearby(body) {
        const x = toFloat(body.position.x);
        const y = toFloat(body.position.y);
        const cellX = Math.floor(x * this.invCellSize);
        const cellY = Math.floor(y * this.invCellSize);
        const result = [];
        // Check 3x3 grid of cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = (cellX + dx) & 0xFFFF;
                const ny = (cellY + dy) & 0xFFFF;
                const key = (nx << 16) | ny;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const other of cell) {
                        if (other !== body) {
                            result.push(other);
                        }
                    }
                }
            }
        }
        return result;
    }
    /**
     * Query bodies within a radius (for larger entities that span multiple cells).
     */
    queryRadius(x, y, radius) {
        const cellRadius = Math.ceil(radius * this.invCellSize);
        const cellX = Math.floor(x * this.invCellSize);
        const cellY = Math.floor(y * this.invCellSize);
        const result = [];
        const seen = new Set();
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dy = -cellRadius; dy <= cellRadius; dy++) {
                const nx = (cellX + dx) & 0xFFFF;
                const ny = (cellY + dy) & 0xFFFF;
                const key = (nx << 16) | ny;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const body of cell) {
                        if (!seen.has(body)) {
                            seen.add(body);
                            result.push(body);
                        }
                    }
                }
            }
        }
        return result;
    }
    /**
     * Iterate over potential collision pairs, calling the callback for each.
     * Each pair is visited exactly once. No Set or deduplication needed -
     * the algorithm structure guarantees uniqueness.
     */
    forEachPair(callback) {
        for (const [key, cell] of this.cells) {
            // Check within same cell - pairs (i, j) where i < j are unique
            for (let i = 0; i < cell.length; i++) {
                for (let j = i + 1; j < cell.length; j++) {
                    callback(cell[i], cell[j]);
                }
            }
            // Check against neighbor cells with HIGHER keys only
            // This ensures each cross-cell pair is checked exactly once
            const cellX = (key >> 16) & 0xFFFF;
            const cellY = key & 0xFFFF;
            // Only check neighbors with higher cell keys to avoid duplicates
            const neighbors = [
                ((cellX + 1) & 0xFFFF) << 16 | cellY, // Right (+x)
                (cellX << 16) | ((cellY + 1) & 0xFFFF), // Below (+y)
                (((cellX + 1) & 0xFFFF) << 16) | ((cellY + 1) & 0xFFFF), // Below-right (+x,+y)
            ];
            for (const neighborKey of neighbors) {
                // Only process if neighbor key > current key (avoids duplicates)
                if (neighborKey <= key)
                    continue;
                const neighborCell = this.cells.get(neighborKey);
                if (!neighborCell)
                    continue;
                for (const a of cell) {
                    for (const b of neighborCell) {
                        callback(a, b);
                    }
                }
            }
            // Below-left neighbor needs special handling (has lower x but higher y)
            const belowLeftKey = (((cellX - 1) & 0xFFFF) << 16) | ((cellY + 1) & 0xFFFF);
            const belowLeftCell = this.cells.get(belowLeftKey);
            if (belowLeftCell) {
                for (const a of cell) {
                    for (const b of belowLeftCell) {
                        callback(a, b);
                    }
                }
            }
        }
        // Handle oversized entities - check against ALL other entities
        // This is O(oversized * total) but there are typically very few oversized entities
        const oversized = this.oversized;
        const allRegular = this.allRegular;
        // Oversized vs oversized
        for (let i = 0; i < oversized.length; i++) {
            for (let j = i + 1; j < oversized.length; j++) {
                callback(oversized[i], oversized[j]);
            }
        }
        // Oversized vs all regular entities
        for (const big of oversized) {
            for (const small of allRegular) {
                callback(big, small);
            }
        }
    }
    /**
     * Get potential collision pairs as an array.
     * For large body counts, prefer forEachPair() to avoid array allocation.
     */
    getPotentialPairs() {
        const pairs = [];
        this.forEachPair((a, b) => pairs.push([a, b]));
        return pairs;
    }
    /**
     * Get statistics for debugging.
     */
    getStats() {
        let maxPerCell = 0;
        let totalBodies = 0;
        for (const cell of this.cells.values()) {
            maxPerCell = Math.max(maxPerCell, cell.length);
            totalBodies += cell.length;
        }
        return {
            cellCount: this.cells.size,
            maxPerCell,
            avgPerCell: this.cells.size > 0 ? totalBodies / this.cells.size : 0,
            oversizedCount: this.oversized.length
        };
    }
}
