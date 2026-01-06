/**
 * Cell Eater - Agar.io style multiplayer game
 *
 * Build auto-transforms: Math.sqrt() -> dSqrt(), Math.random() -> dRandom()
 */

import * as modu from 'modu-engine';
import { WORLD_WIDTH, WORLD_HEIGHT, FOOD_COUNT } from './constants';
import { defineEntities } from './entities';
import {
    setupSystems,
    setupCollisions,
    spawnFood,
    spawnCell,
    getPlayerCells,
    cellMergeFrame,
} from './systems';
import { createRenderer } from './render';

// Game state
let game: modu.Game;
let renderer: modu.Simple2DRenderer;
let physics: modu.Physics2DSystem;
let input: modu.InputPlugin;
let cameraSystem: modu.CameraSystem;
let cameraEntity: modu.Entity;

let canvas: HTMLCanvasElement;
let minimapCanvas: HTMLCanvasElement;
let sizeDisplay: HTMLElement;
let WIDTH: number;
let HEIGHT: number;

let mouseX: number;
let mouseY: number;

function getLocalClientId(): number | null {
    const clientId = game.localClientId;
    if (!clientId || typeof clientId !== 'string') return null;
    return game.internClientId(clientId);
}

function setupInput(getCameraEntity: () => modu.Entity): void {
    mouseX = WIDTH / 2;
    mouseY = HEIGHT / 2;

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    input.action('target', {
        type: 'vector',
        bindings: [() => {
            // Convert screen to world coordinates
            const cam = getCameraEntity().get(modu.Camera2D);
            const worldX = (mouseX - WIDTH / 2) / cam.zoom + cam.x;
            const worldY = (mouseY - HEIGHT / 2) / cam.zoom + cam.y;
            return { x: worldX, y: worldY };
        }]
    });

    input.action('split', {
        type: 'button',
        bindings: ['key: ']
    });
}

export function initGame(): void {
    canvas = document.getElementById('game') as HTMLCanvasElement;
    minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
    sizeDisplay = document.getElementById('size-display')!;
    WIDTH = canvas.width;
    HEIGHT = canvas.height;

    game = modu.createGame();
    renderer = game.addPlugin(modu.Simple2DRenderer, canvas);
    physics = game.addPlugin(modu.Physics2DSystem, { gravity: { x: 0, y: 0 } });
    input = game.addPlugin(modu.InputPlugin, canvas);
    cameraSystem = game.addPlugin(modu.CameraSystem);

    // Expose for debugging
    (window as any).game = game;

    defineEntities(game);
    setupCollisions(game, physics);
    setupSystems(game);

    // Create camera entity and set it on renderer
    cameraEntity = game.spawn('camera');
    const cam = cameraEntity.get(modu.Camera2D);
    cam.x = WORLD_WIDTH / 2;
    cam.y = WORLD_HEIGHT / 2;
    renderer.camera = cameraEntity;

    // Helper to ensure camera entity exists (survives snapshot loads)
    function ensureCameraEntity(): modu.Entity {
        if (!cameraEntity || cameraEntity.destroyed || !cameraEntity.has(modu.Camera2D)) {
            cameraEntity = game.spawn('camera');
            const cam = cameraEntity.get(modu.Camera2D);
            cam.x = WORLD_WIDTH / 2;
            cam.y = WORLD_HEIGHT / 2;
            renderer.camera = cameraEntity;
        }
        return cameraEntity;
    }

    setupInput(ensureCameraEntity);

    renderer.render = createRenderer(
        game,
        renderer,
        ensureCameraEntity,  // Pass getter function
        canvas,
        minimapCanvas,
        sizeDisplay,
        getLocalClientId
    );

    game.connect('cell-eater-ecs', {
        onRoomCreate() {
            console.log('[cell-eater] onRoomCreate');
            for (let i = 0; i < FOOD_COUNT; i++) spawnFood(game);
        },
        onConnect(clientId: string) {
            console.log('[cell-eater] onConnect:', clientId);
            spawnCell(game, clientId);

            if (clientId === game.localClientId) {
                const player = game.getEntityByClientId(clientId);
                if (player) {
                    const t = player.get(modu.Transform2D);
                    const cam = ensureCameraEntity().get(modu.Camera2D);
                    cam.x = t.x;
                    cam.y = t.y;
                }
            }
        },
        onDisconnect(clientId: string) {
            console.log('[cell-eater] onDisconnect:', clientId);
            const internedId = game.internClientId(clientId);
            for (const cell of getPlayerCells(game, internedId)) {
                cell.destroy();
                cellMergeFrame.delete(cell.id);
            }
        }
    });

    modu.enableDebugUI(game);
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
