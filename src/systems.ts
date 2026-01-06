/**
 * Cell Eater - Game Systems
 */

import * as modu from 'modu-engine';
import { SpawnCellOptions } from './types';
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
    COLORS,
} from './constants';

// Track merge eligibility and split timing
export const cellMergeFrame = new Map<number, number>();
export const cellSplitFrame = new Map<number, number>();

// Helper functions
function getClientIdStr(game: modu.Game, numericId: number): string {
    return game.getClientIdString(numericId) || '';
}

function compareStrings(a: string, b: string): number {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
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
    const colorStr = options.color || COLORS[(Math.random() * COLORS.length) | 0];
    const color = game.internString('color', colorStr);
    const radius = options.radius || INITIAL_RADIUS;

    const entity = game.spawn('cell', {
        x: options.x ?? (100 + (Math.random() * (WORLD_WIDTH - 200)) | 0),
        y: options.y ?? (100 + (Math.random() * (WORLD_HEIGHT - 200)) | 0),
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
        const playerCells = new Map<number, modu.Entity[]>();
        const allCells = [...game.query('cell')].sort((a, b) => a.id - b.id);

        for (const cell of allCells) {
            if (cell.destroyed) continue;
            const cid = cell.get(modu.Player).clientId;
            if (cid === undefined || cid === null) continue;
            if (!playerCells.has(cid)) playerCells.set(cid, []);
            playerCells.get(cid)!.push(cell);
        }

        const repulsion = new Map<number, { vx: number; vy: number }>();
        const sortedPlayers = [...playerCells.entries()].sort((a, b) =>
            compareStrings(getClientIdStr(game, a[0]), getClientIdStr(game, b[0]))
        );

        for (const [, siblings] of sortedPlayers) {
            for (const cell of siblings) {
                repulsion.set(cell.id, { vx: 0, vy: 0 });
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
                        const pushForce = (overlap * 0.3) + 1;
                        const nx = dx / dist;
                        const ny = dy / dist;

                        const repA = repulsion.get(cellA.id)!;
                        const repB = repulsion.get(cellB.id)!;
                        repA.vx += nx * pushForce;
                        repA.vy += ny * pushForce;
                        repB.vx -= nx * pushForce;
                        repB.vy -= ny * pushForce;
                    }
                }
            }
        }

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

                    // Skip if target coords are invalid
                    if (!isFinite(tx) || !isFinite(ty)) {
                        console.warn('Invalid target:', tx, ty);
                    } else {
                        const dx = tx - transform.x;
                        const dy = ty - transform.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist > 5) {
                            vx = (dx / dist) * SPEED;
                            vy = (dy / dist) * SPEED;
                        }
                    }
                }

                // Add repulsion from sibling cells
                const rep = repulsion.get(cell.id);
                if (rep) {
                    vx += rep.vx;
                    vy += rep.vy;
                }

                const splitFrame = cellSplitFrame.get(cell.id) || 0;
                if (game.world.frame - splitFrame > 30) {
                    body.setVelocity(vx, vy);
                }

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
        const playerCells = new Map<number, modu.Entity[]>();
        const allCells = [...game.query('cell')].sort((a, b) => a.id - b.id);

        for (const cell of allCells) {
            if (cell.destroyed) continue;
            const clientId = cell.get(modu.Player).clientId;
            if (clientId === undefined || clientId === null) continue;
            if (!playerCells.has(clientId)) playerCells.set(clientId, []);
            playerCells.get(clientId)!.push(cell);
        }

        const sortedPlayers = [...playerCells.entries()].sort((a, b) =>
            compareStrings(getClientIdStr(game, a[0]), getClientIdStr(game, b[0]))
        );

        for (const [clientId, cells] of sortedPlayers) {
            const playerInput = game.world.getInput(clientId);

            if (!playerInput?.split || !playerInput?.target) continue;
            if (cells.length >= MAX_CELLS_PER_PLAYER) continue;

            const cellsToSplit = cells
                .filter(c => c.get(modu.Sprite).radius >= MIN_SPLIT_RADIUS)
                .slice(0, MAX_CELLS_PER_PLAYER - cells.length);

            for (const cell of cellsToSplit) {
                const t = cell.get(modu.Transform2D);
                const s = cell.get(modu.Sprite);
                const b = cell.get(modu.Body2D);

                // Direction to cursor
                const dx = playerInput.target.x - t.x;
                const dy = playerInput.target.y - t.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                // Halve radius
                const r = s.radius / Math.SQRT2;
                s.radius = r;
                b.radius = r;

                const clientIdStr = game.getClientIdString(clientId);
                if (!clientIdStr) continue;

                // Spawn new cell and apply impulse towards cursor
                const newCell = spawnCell(game, clientIdStr, {
                    x: t.x,
                    y: t.y,
                    radius: r,
                    color: game.getString('color', s.color)
                });

                const newBody = newCell.get(modu.Body2D);
                newBody.impulseX = (dx / len) * 400;
                newBody.impulseY = (dy / len) * 400;
                newBody.damping = 0.05;

                // Track timing
                const mergeFrame = game.world.frame + MERGE_DELAY_FRAMES;
                cellMergeFrame.set(cell.id, mergeFrame);
                cellMergeFrame.set(newCell.id, mergeFrame);
                cellSplitFrame.set(newCell.id, game.world.frame);
            }
        }
    }, { phase: 'update' });

    // Merge system
    game.addSystem(() => {
        const currentFrame = game.world.frame;
        const playerCells = new Map<number, modu.Entity[]>();
        const allCells = [...game.query('cell')].sort((a, b) => a.id - b.id);

        for (const cell of allCells) {
            if (cell.destroyed) continue;
            const clientId = cell.get(modu.Player).clientId;
            if (clientId === undefined || clientId === null) continue;
            if (!playerCells.has(clientId)) playerCells.set(clientId, []);
            playerCells.get(clientId)!.push(cell);
        }

        const sortedPlayers = [...playerCells.entries()].sort((a, b) =>
            compareStrings(getClientIdStr(game, a[0]), getClientIdStr(game, b[0]))
        );

        for (const [, cells] of sortedPlayers) {
            if (cells.length < 2) continue;

            cells.sort((a, b) => {
                const radiusDiff = b.get(modu.Sprite).radius - a.get(modu.Sprite).radius;
                return radiusDiff !== 0 ? radiusDiff : a.id - b.id;
            });

            for (let i = 0; i < cells.length; i++) {
                const cellA = cells[i];
                if (cellA.destroyed) continue;

                const tA = cellA.get(modu.Transform2D);
                const sA = cellA.get(modu.Sprite);

                for (let j = i + 1; j < cells.length; j++) {
                    const cellB = cells[j];
                    if (cellB.destroyed) continue;

                    const mergeFrameA = cellMergeFrame.get(cellA.id) || 0;
                    const mergeFrameB = cellMergeFrame.get(cellB.id) || 0;
                    if (currentFrame < mergeFrameA || currentFrame < mergeFrameB) continue;

                    const tB = cellB.get(modu.Transform2D);
                    const sB = cellB.get(modu.Sprite);

                    const dx = tA.x - tB.x;
                    const dy = tA.y - tB.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const mergeThreshold = (sA.radius + sB.radius) * 0.5;

                    if (dist < mergeThreshold) {
                        const areaA = sA.radius * sA.radius;
                        const areaB = sB.radius * sB.radius;
                        const newRadius = Math.min(Math.sqrt(areaA + areaB), MAX_RADIUS);

                        sA.radius = newRadius;
                        cellA.get(modu.Body2D).radius = newRadius;
                        cellB.destroy();
                        cellMergeFrame.delete(cellB.id);
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
            cellMergeFrame.delete(cellB.id);
        }
    });
}
