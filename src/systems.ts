/**
 * Cell Eater - Game Systems
 */

import * as modu from 'modu-engine';
import { SpawnCellOptions } from './types';
import { MergeCooldown } from './entities';
import {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    SPEED,
    INITIAL_RADIUS,
    MAX_RADIUS,
    EAT_RATIO,
    FOOD_GROW,
    PLAYER_GROW,
    MAX_FOOD,
    FOOD_SPAWN_CHANCE,
    MIN_SPLIT_RADIUS,
    MAX_CELLS_PER_PLAYER,
    MERGE_DELAY_FRAMES,
    MERGE_THRESHOLD,
    SPLIT_IMPULSE,
    REPULSION_FACTOR,
    REPULSION_BASE,
    MOVE_DEADZONE,
    COLORS,
} from './constants';


// Simple hash function for deterministic spawn positions
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0; // Convert to unsigned
}

// Track previous positions for actual speed measurement

// Helper: Get client ID string for deterministic sorting
function getClientIdStr(game: modu.Game, numericId: number): string {
    return game.getClientIdString(numericId) || '';
}

// Helper: Compare strings for deterministic sorting
function compareStrings(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

// Helper: Group cells by player, sorted deterministically
function getPlayerCellsGrouped(game: modu.Game): Map<number, modu.Entity[]> {
    const playerCells = new Map<number, modu.Entity[]>();
    const allCells = [...game.query('cell')].sort((a, b) => a.eid - b.eid);

    for (const cell of allCells) {
        if (cell.destroyed) continue;
        const clientId = cell.get(modu.Player).clientId;
        if (clientId === undefined || clientId === null) continue;
        if (!playerCells.has(clientId)) playerCells.set(clientId, []);
        playerCells.get(clientId)!.push(cell);
    }

    return playerCells;
}

// Helper: Get sorted player entries for deterministic iteration
function getSortedPlayers(game: modu.Game, playerCells: Map<number, modu.Entity[]>): [number, modu.Entity[]][] {
    return [...playerCells.entries()].sort((a, b) =>
        compareStrings(getClientIdStr(game, a[0]), getClientIdStr(game, b[0]))
    );
}

export function getPlayerCells(game: modu.Game, clientId: number): modu.Entity[] {
    const cells: modu.Entity[] = [];
    for (const cell of game.query('cell')) {
        if (cell.get(modu.Player).clientId === clientId && !cell.destroyed) {
            cells.push(cell);
        }
    }
    return cells;
}

export function spawnFood(game: modu.Game): void {
    const colorStr = COLORS[(Math.random() * COLORS.length) | 0];
    const color = game.internString('color', colorStr);
    game.spawn('food', {
        x: 50 + (Math.random() * (WORLD_WIDTH - 100)) | 0,
        y: 50 + (Math.random() * (WORLD_HEIGHT - 100)) | 0,
        color
    });
}

export function spawnCell(game: modu.Game, clientId: string, options: SpawnCellOptions = {}): modu.Entity {
    // Use hash-based positioning for determinism (random in callbacks desyncs RNG)
    const hash = hashString(clientId);
    const colorStr = options.color || COLORS[hash % COLORS.length];
    const color = game.internString('color', colorStr);
    const radius = options.radius || INITIAL_RADIUS;

    // Derive spawn position from hash (different bits for x and y)
    const spawnX = options.x ?? (100 + ((hash >>> 0) % (WORLD_WIDTH - 200)));
    const spawnY = options.y ?? (100 + ((hash >>> 16 ^ hash) % (WORLD_HEIGHT - 200)));

    const entity = game.spawn('cell', {
        x: spawnX,
        y: spawnY,
        clientId,
        color
    });

    if (options.radius) {
        const sprite = entity.get(modu.Sprite);
        const body = entity.get(modu.Body2D);
        sprite.radius = radius;
        body.radius = radius;
    }

    if (options.vx !== undefined || options.vy !== undefined) {
        const body = entity.get(modu.Body2D);
        body.vx = options.vx || 0;
        body.vy = options.vy || 0;
    }

    return entity;
}

export function setupSystems(game: modu.Game): void {
    // Movement system with integrated repulsion
    game.addSystem(() => {
        const playerCells = getPlayerCellsGrouped(game);
        const sortedPlayers = getSortedPlayers(game, playerCells);

        // Calculate repulsion forces between sibling cells
        const repulsion = new Map<number, { vx: number; vy: number }>();

        for (const [, siblings] of sortedPlayers) {
            for (const cell of siblings) {
                repulsion.set(cell.eid, { vx: 0, vy: 0 });
            }

            if (siblings.length < 2) continue;

            for (let i = 0; i < siblings.length; i++) {
                const cellA = siblings[i];
                const tA = cellA.get(modu.Transform2D);
                const sA = cellA.get(modu.Sprite);

                for (let j = i + 1; j < siblings.length; j++) {
                    const cellB = siblings[j];
                    const tB = cellB.get(modu.Transform2D);
                    const sB = cellB.get(modu.Sprite);

                    const dx = tA.x - tB.x;
                    const dy = tA.y - tB.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = sA.radius + sB.radius;
                    const minDistSq = minDist * minDist;

                    if (distSq < minDistSq && distSq > 1) {
                        const dist = Math.sqrt(distSq) || 1;
                        const overlap = minDist - dist;
                        const pushForce = (overlap * REPULSION_FACTOR) + REPULSION_BASE;
                        const nx = dx / dist;
                        const ny = dy / dist;

                        const repA = repulsion.get(cellA.eid)!;
                        const repB = repulsion.get(cellB.eid)!;
                        repA.vx += nx * pushForce;
                        repA.vy += ny * pushForce;
                        repB.vx -= nx * pushForce;
                        repB.vy -= ny * pushForce;
                    }
                }
            }
        }

        // Apply movement based on input
        for (const [clientId, cells] of sortedPlayers) {
            const playerInput = game.world.getInput(clientId);

            for (const cell of cells) {
                const sprite = cell.get(modu.Sprite);
                const transform = cell.get(modu.Transform2D);
                const body = cell.get(modu.Body2D);

                let vx = 0, vy = 0;

                if (playerInput?.target) {
                    const tx = playerInput.target.x;
                    const ty = playerInput.target.y;

                    if (isFinite(tx) && isFinite(ty)) {
                        const dx = tx - transform.x;
                        const dy = ty - transform.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist > MOVE_DEADZONE) {
                            vx = (dx / dist) * SPEED;
                            vy = (dy / dist) * SPEED;
                        }
                    }
                }

                // Add repulsion from sibling cells
                const rep = repulsion.get(cell.eid);
                if (rep) {
                    vx += rep.vx;
                    vy += rep.vy;
                }

                cell.setVelocity(vx, vy);

                // Clamp to world bounds
                const r = sprite.radius;
                transform.x = Math.max(r, Math.min(WORLD_WIDTH - r, transform.x));
                transform.y = Math.max(r, Math.min(WORLD_HEIGHT - r, transform.y));
            }
        }
    }, { phase: 'update' });

    // Food spawning system
    game.addSystem(() => {
        const shouldSpawn = Math.random() < FOOD_SPAWN_CHANCE;
        if (shouldSpawn && game.getEntitiesByType('food').length < MAX_FOOD) {
            spawnFood(game);
        }
    }, { phase: 'update' });

    // Split system
    game.addSystem(() => {
        const playerCells = getPlayerCellsGrouped(game);
        const sortedPlayers = getSortedPlayers(game, playerCells);

        for (const [clientId, cells] of sortedPlayers) {
            const playerInput = game.world.getInput(clientId);

            // Debug: log when split is true
            if (playerInput?.split) {
                console.log(`[SPLIT SYSTEM] frame=${game.world.frame} clientId=${clientId} split=true target=${JSON.stringify(playerInput?.target)} cells=${cells.length}`);
            }

            if (!playerInput?.split || !playerInput?.target) continue;
            if (cells.length >= MAX_CELLS_PER_PLAYER) {
                console.log(`[SPLIT] Skipping - max cells reached (${cells.length}/${MAX_CELLS_PER_PLAYER})`);
                continue;
            }

            const cellsToSplit = cells
                .filter(c => c.get(modu.Sprite).radius >= MIN_SPLIT_RADIUS)
                .slice(0, MAX_CELLS_PER_PLAYER - cells.length);

            console.log(`[SPLIT] Cells eligible for split: ${cellsToSplit.length} of ${cells.length} (minRadius=${MIN_SPLIT_RADIUS})`);

            for (const cell of cellsToSplit) {
                const t = cell.get(modu.Transform2D);
                const s = cell.get(modu.Sprite);
                const b = cell.get(modu.Body2D);

                // Direction to cursor
                const dx = playerInput.target.x - t.x;
                const dy = playerInput.target.y - t.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                // Halve radius (area split in half)
                const r = s.radius / Math.SQRT2;
                s.radius = r;
                b.radius = r;

                const clientIdStr = game.getClientIdString(clientId);
                if (!clientIdStr) continue;

                // Spawn new cell
                const newCell = spawnCell(game, clientIdStr, {
                    x: t.x,
                    y: t.y,
                    radius: r,
                    color: game.getString('color', s.color)
                });

                // Apply impulse towards cursor
                const newBody = newCell.get(modu.Body2D);
                newBody.impulseX = (dx / len) * SPLIT_IMPULSE;
                newBody.impulseY = (dy / len) * SPLIT_IMPULSE;

                // Track merge timing
                const mergeFrame = game.world.frame + MERGE_DELAY_FRAMES;
                cell.get(MergeCooldown).frame = mergeFrame;
                newCell.get(MergeCooldown).frame = mergeFrame;
            }
        }
    }, { phase: 'update' });

    // Merge system
    game.addSystem(() => {
        const currentFrame = game.world.frame;
        const playerCells = getPlayerCellsGrouped(game);
        const sortedPlayers = getSortedPlayers(game, playerCells);

        for (const [, cells] of sortedPlayers) {
            if (cells.length < 2) continue;

            // Sort by radius (largest first) for deterministic merge order
            cells.sort((a, b) => {
                const radiusDiff = b.get(modu.Sprite).radius - a.get(modu.Sprite).radius;
                return radiusDiff !== 0 ? radiusDiff : a.eid - b.eid;
            });

            for (let i = 0; i < cells.length; i++) {
                const cellA = cells[i];
                if (cellA.destroyed) continue;

                const tA = cellA.get(modu.Transform2D);
                const sA = cellA.get(modu.Sprite);

                for (let j = i + 1; j < cells.length; j++) {
                    const cellB = cells[j];
                    if (cellB.destroyed) continue;

                    // Check merge cooldown
                    const mergeFrameA = cellA.get(MergeCooldown).frame;
                    const mergeFrameB = cellB.get(MergeCooldown).frame;
                    if (currentFrame < mergeFrameA || currentFrame < mergeFrameB) continue;

                    const tB = cellB.get(modu.Transform2D);
                    const sB = cellB.get(modu.Sprite);

                    const dx = tA.x - tB.x;
                    const dy = tA.y - tB.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const mergeThreshold = (sA.radius + sB.radius) * MERGE_THRESHOLD;

                    if (dist < mergeThreshold) {
                        console.log('MERGE: cellA.eid=', cellA.eid, 'clientId=', cellA.get(modu.Player).clientId);
                        console.log('MERGE: cellB.eid=', cellB.eid, 'clientId=', cellB.get(modu.Player).clientId);

                        // Merge: combine areas
                        const areaA = sA.radius * sA.radius;
                        const areaB = sB.radius * sB.radius;
                        const newRadius = Math.min(Math.sqrt(areaA + areaB), MAX_RADIUS);

                        sA.radius = newRadius;
                        cellA.get(modu.Body2D).radius = newRadius;
                        cellB.destroy();

                        console.log('AFTER MERGE: cellA.clientId=', cellA.get(modu.Player).clientId);
                    }
                }
            }
        }
    }, { phase: 'update' });
}

export function setupCollisions(game: modu.Game, physics: modu.Physics2DSystem): void {
    // Cell eats food
    physics.onCollision('cell', 'food', (cell, food) => {
        if (food.destroyed) return;
        const sprite = cell.get(modu.Sprite);
        const foodSprite = food.get(modu.Sprite);
        sprite.radius = Math.min(sprite.radius + foodSprite.radius * FOOD_GROW, MAX_RADIUS);
        cell.get(modu.Body2D).radius = sprite.radius;
        food.destroy();
    });

    // Cell eats smaller cell (different players only)
    physics.onCollision('cell', 'cell', (cellA, cellB) => {
        if (cellA.get(modu.Player).clientId === cellB.get(modu.Player).clientId) return;

        const eaterSprite = cellA.get(modu.Sprite);
        const preySprite = cellB.get(modu.Sprite);
        if (eaterSprite.radius > preySprite.radius * EAT_RATIO) {
            eaterSprite.radius = Math.min(eaterSprite.radius + preySprite.radius * PLAYER_GROW, MAX_RADIUS);
            cellA.get(modu.Body2D).radius = eaterSprite.radius;
            cellB.destroy();
        }
    });
}
