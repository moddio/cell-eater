/**
 * Cell Eater - Rendering & Camera
 */

import * as modu from 'modu-engine';
import { getPlayerCells } from './systems';
import {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    BASE_ZOOM,
    MIN_ZOOM,
    ZOOM_SCALE_FACTOR,
    INITIAL_RADIUS,
} from './constants';

export function lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + percent);
    const b = Math.min(255, (num & 0x0000FF) + percent);
    return `rgb(${r},${g},${b})`;
}

export function darkenColor(hex: string, percent: number): string {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, ((num >> 8) & 0x00FF) - percent);
    const b = Math.max(0, (num & 0x0000FF) - percent);
    return `rgb(${r},${g},${b})`;
}

export function worldToScreen(
    worldX: number,
    worldY: number,
    camX: number,
    camY: number,
    camZoom: number,
    WIDTH: number,
    HEIGHT: number
): { x: number; y: number } {
    return {
        x: (worldX - camX) * camZoom + WIDTH / 2,
        y: (worldY - camY) * camZoom + HEIGHT / 2
    };
}

export function updateCamera(
    game: modu.Game,
    cameraEntity: modu.Entity,
    getLocalClientId: () => number | null
): void {
    const localId = getLocalClientId();
    if (localId === null) return;

    const cells = getPlayerCells(game, localId);
    if (cells.length === 0) return;

    const camera = cameraEntity.get(modu.Camera2D);

    let totalSize = 0;
    let totalArea = 0;
    let centerX = 0;
    let centerY = 0;

    for (const cell of cells) {
        const transform = cell.get(modu.Transform2D);
        const sprite = cell.get(modu.Sprite);
        const area = sprite.radius * sprite.radius;

        centerX += transform.x * area;
        centerY += transform.y * area;
        totalArea += area;
        totalSize += sprite.radius;
    }

    if (totalArea > 0) {
        centerX /= totalArea;
        centerY /= totalArea;

        camera.x += (centerX - camera.x) * camera.smoothing;
        camera.y += (centerY - camera.y) * camera.smoothing;

        camera.targetZoom = Math.max(MIN_ZOOM, BASE_ZOOM - (totalSize - INITIAL_RADIUS) * ZOOM_SCALE_FACTOR);
        camera.zoom += (camera.targetZoom - camera.zoom) * camera.smoothing;
    }
}

export function createRenderer(
    game: modu.Game,
    renderer: modu.Simple2DRenderer,
    getCameraEntity: () => modu.Entity,
    canvas: HTMLCanvasElement,
    minimapCanvas: HTMLCanvasElement,
    sizeDisplay: HTMLElement,
    getLocalClientId: () => number | null
): () => void {
    const ctx = renderer.context;
    const minimapCtx = minimapCanvas.getContext('2d')!;
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    function renderMinimap(): void {
        const cameraEntity = getCameraEntity();
        const camera = cameraEntity.get(modu.Camera2D);
        const mmW = minimapCanvas.width;
        const mmH = minimapCanvas.height;
        const scaleX = mmW / WORLD_WIDTH;
        const scaleY = mmH / WORLD_HEIGHT;

        minimapCtx.fillStyle = 'rgba(17, 17, 17, 0.9)';
        minimapCtx.fillRect(0, 0, mmW, mmH);

        minimapCtx.strokeStyle = '#333';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(0, 0, mmW, mmH);

        for (const entity of game.getAllEntities()) {
            if (entity.destroyed) continue;
            try {
                const sprite = entity.get(modu.Sprite);
                if (!sprite || !sprite.visible) continue;

                const transform = entity.get(modu.Transform2D);
                const x = transform.x * scaleX;
                const y = transform.y * scaleY;

                const isFood = sprite.layer === 0;
                const radius = isFood ? 1 : Math.max(3, sprite.radius * scaleX * 1.5);

                const colorStr = game.getString('color', sprite.color) || '#fff';
                minimapCtx.fillStyle = isFood ? 'rgba(255,255,255,0.3)' : colorStr;
                minimapCtx.beginPath();
                minimapCtx.arc(x, y, radius, 0, Math.PI * 2);
                minimapCtx.fill();
            } catch {}
        }

        const viewLeft = (camera.x - WIDTH / 2 / camera.zoom) * scaleX;
        const viewTop = (camera.y - HEIGHT / 2 / camera.zoom) * scaleY;
        const viewWidth = (WIDTH / camera.zoom) * scaleX;
        const viewHeight = (HEIGHT / camera.zoom) * scaleY;

        minimapCtx.strokeStyle = '#fff';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);

        const localId = getLocalClientId();
        if (localId !== null) {
            const cells = getPlayerCells(game, localId);
            for (const cell of cells) {
                if (cell.destroyed) continue;
                const transform = cell.get(modu.Transform2D);
                const x = transform.x * scaleX;
                const y = transform.y * scaleY;

                minimapCtx.strokeStyle = '#fff';
                minimapCtx.lineWidth = 2;
                minimapCtx.beginPath();
                minimapCtx.arc(x, y, 5, 0, Math.PI * 2);
                minimapCtx.stroke();
            }
        }
    }

    return function renderWithCamera(): void {
        const cameraEntity = getCameraEntity();
        const alpha = game.getRenderAlpha();
        const camera = cameraEntity.get(modu.Camera2D);

        updateCamera(game, cameraEntity, getLocalClientId);

        // Use camera position directly (matches input coordinate conversion)
        const camX = camera.x;
        const camY = camera.y;

        // Clear canvas
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.save();
        ctx.translate(WIDTH / 2, HEIGHT / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camX, -camY);

        // Draw grid
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1 / camera.zoom;
        const gridSize = 100;
        const startX = Math.floor((camX - WIDTH / 2 / camera.zoom) / gridSize) * gridSize;
        const startY = Math.floor((camY - HEIGHT / 2 / camera.zoom) / gridSize) * gridSize;
        const endX = camX + WIDTH / 2 / camera.zoom;
        const endY = camY + HEIGHT / 2 / camera.zoom;

        for (let x = startX; x <= endX; x += gridSize) {
            if (x >= 0 && x <= WORLD_WIDTH) {
                ctx.beginPath();
                ctx.moveTo(x, Math.max(0, startY));
                ctx.lineTo(x, Math.min(WORLD_HEIGHT, endY));
                ctx.stroke();
            }
        }
        for (let y = startY; y <= endY; y += gridSize) {
            if (y >= 0 && y <= WORLD_HEIGHT) {
                ctx.beginPath();
                ctx.moveTo(Math.max(0, startX), y);
                ctx.lineTo(Math.min(WORLD_WIDTH, endX), y);
                ctx.stroke();
            }
        }

        // Draw world boundary
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 4 / camera.zoom;
        ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

        // Collect and sort entities by layer
        const entities: { entity: modu.Entity; layer: number }[] = [];
        for (const entity of game.getAllEntities()) {
            if (entity.destroyed) continue;
            try {
                const sprite = entity.get(modu.Sprite);
                if (sprite && sprite.visible) {
                    entity.interpolate(alpha);
                    entities.push({ entity, layer: sprite.layer });
                }
            } catch {}
        }
        entities.sort((a, b) => a.layer - b.layer);

        // Draw entities
        for (const { entity } of entities) {
            const sprite = entity.get(modu.Sprite);
            const x = entity.render.interpX + sprite.offsetX;
            const y = entity.render.interpY + sprite.offsetY;

            const screenPos = worldToScreen(x, y, camX, camY, camera.zoom, WIDTH, HEIGHT);
            const screenRadius = sprite.radius * camera.zoom;
            if (screenPos.x + screenRadius < 0 || screenPos.x - screenRadius > WIDTH ||
                screenPos.y + screenRadius < 0 || screenPos.y - screenRadius > HEIGHT) {
                continue;
            }

            const colorStr = game.getString('color', sprite.color) || '#fff';

            if (sprite.shape === modu.SHAPE_CIRCLE) {
                const r = sprite.radius;
                const isCell = sprite.layer === 1;

                if (isCell && r > 10) {
                    const gradient = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
                    gradient.addColorStop(0, lightenColor(colorStr, 40));
                    gradient.addColorStop(0.7, colorStr);
                    gradient.addColorStop(1, darkenColor(colorStr, 20));

                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = darkenColor(colorStr, 30);
                    ctx.lineWidth = Math.max(2, r * 0.08);
                    ctx.stroke();

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.beginPath();
                    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.25, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillStyle = colorStr;
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        ctx.restore();

        renderMinimap();

        // Update size display
        const localId = getLocalClientId();
        if (localId !== null) {
            const cells = getPlayerCells(game, localId);
            const totalRadius = cells.reduce((sum, c) => sum + c.get(modu.Sprite).radius, 0);
            sizeDisplay.textContent = `Size: ${Math.floor(totalRadius)}`;
        }
    };
}
