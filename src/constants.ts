/**
 * Cell Eater - Game Constants
 */

// World dimensions
export const WORLD_WIDTH = 6000;
export const WORLD_HEIGHT = 6000;

// Zoom settings
export const BASE_ZOOM = 1.0;
export const MIN_ZOOM = 0.35;
export const ZOOM_SCALE_FACTOR = 0.004;

// Movement
export const SPEED = 200;

// Cell sizing
export const INITIAL_RADIUS = 20;
export const MAX_RADIUS = 200;

// Eating mechanics
export const EAT_RATIO = 1.2;
export const FOOD_GROW = 0.05;
export const PLAYER_GROW = 0.3;

// Food spawning
export const FOOD_COUNT = 800;
export const MAX_FOOD = 1600;
export const FOOD_SPAWN_CHANCE = 0.15;

// Split mechanics
export const MIN_SPLIT_RADIUS = 15;
export const SPLIT_VELOCITY = 400;
export const SPLIT_CONTROL_DELAY = 30;
export const MAX_CELLS_PER_PLAYER = 16;
export const MERGE_DELAY_FRAMES = 600;

// Color palette
export const COLORS = [
    '#ff6b6b', '#ff8e72', '#ffa94d', '#ffd43b', '#a9e34b', '#69db7c',
    '#38d9a9', '#3bc9db', '#4dabf7', '#748ffc', '#9775fa', '#da77f2',
    '#f783ac', '#e64980', '#d6336c', '#c2255c', '#ff4500', '#32cd32',
    '#1e90ff', '#ff1493', '#00ced1', '#ffa500', '#9400d3', '#00ff7f'
];
