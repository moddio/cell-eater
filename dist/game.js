"use strict";
var CellEater = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // cdn-global:modu-engine
  var require_modu_engine = __commonJS({
    "cdn-global:modu-engine"(exports, module) {
      module.exports = window.Modu;
    }
  });

  // src/game.ts
  var game_exports = {};
  __export(game_exports, {
    cameraChaseEnabled: () => cameraChaseEnabled,
    initGame: () => initGame
  });
  var modu4 = __toESM(require_modu_engine());

  // src/constants.ts
  var WORLD_WIDTH = 6e3;
  var WORLD_HEIGHT = 6e3;
  var BASE_ZOOM = 1;
  var MIN_ZOOM = 0.35;
  var ZOOM_SCALE_FACTOR = 4e-3;
  var SPEED = 400;
  var INITIAL_RADIUS = 20;
  var MAX_RADIUS = 200;
  var EAT_RATIO = 1.2;
  var FOOD_GROW = 0.05;
  var PLAYER_GROW = 0.3;
  var FOOD_COUNT = 800;
  var MAX_FOOD = 1600;
  var FOOD_SPAWN_CHANCE = 0.15;
  var MIN_SPLIT_RADIUS = 15;
  var SPLIT_IMPULSE = 800;
  var MAX_CELLS_PER_PLAYER = 16;
  var MERGE_DELAY_FRAMES = 300;
  var MERGE_THRESHOLD = 0.5;
  var REPULSION_FACTOR = 0.3;
  var REPULSION_BASE = 1;
  var MOVE_DEADZONE = 5;
  var COLORS = [
    "#ff6b6b",
    "#ff8e72",
    "#ffa94d",
    "#ffd43b",
    "#a9e34b",
    "#69db7c",
    "#38d9a9",
    "#3bc9db",
    "#4dabf7",
    "#748ffc",
    "#9775fa",
    "#da77f2",
    "#f783ac",
    "#e64980",
    "#d6336c",
    "#c2255c",
    "#ff4500",
    "#32cd32",
    "#1e90ff",
    "#ff1493",
    "#00ced1",
    "#ffa500",
    "#9400d3",
    "#00ff7f"
  ];

  // src/entities.ts
  var modu = __toESM(require_modu_engine());
  var MergeCooldown = modu.defineComponent("MergeCooldown", { frame: 0 });
  function defineEntities(game2) {
    game2.defineEntity("cell").with(modu.Transform2D).with(modu.Sprite, { shape: modu.SHAPE_CIRCLE, radius: INITIAL_RADIUS, layer: 1 }).with(modu.Body2D, { shapeType: modu.SHAPE_CIRCLE, radius: INITIAL_RADIUS, bodyType: modu.BODY_KINEMATIC }).with(modu.Player).with(MergeCooldown).register();
    game2.defineEntity("food").with(modu.Transform2D).with(modu.Sprite, { shape: modu.SHAPE_CIRCLE, radius: 8, layer: 0 }).with(modu.Body2D, { shapeType: modu.SHAPE_CIRCLE, radius: 8, bodyType: modu.BODY_STATIC }).register();
    game2.defineEntity("camera").with(modu.Camera2D, { smoothing: 0.25 }).syncNone().register();
  }

  // src/systems.ts
  var import_modu_engine = __toESM(require_modu_engine());
  var modu2 = __toESM(require_modu_engine());
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
    }
    return hash >>> 0;
  }
  function getClientIdStr(game2, numericId) {
    return game2.getClientIdString(numericId) || "";
  }
  function compareStrings(a, b) {
    if (a < b)
      return -1;
    if (a > b)
      return 1;
    return 0;
  }
  function getPlayerCellsGrouped(game2) {
    const playerCells = /* @__PURE__ */ new Map();
    const allCells = [...game2.query("cell")].sort((a, b) => a.eid - b.eid);
    for (const cell of allCells) {
      if (cell.destroyed)
        continue;
      const clientId = cell.get(modu2.Player).clientId;
      if (clientId === void 0 || clientId === null)
        continue;
      if (!playerCells.has(clientId))
        playerCells.set(clientId, []);
      playerCells.get(clientId).push(cell);
    }
    return playerCells;
  }
  function getSortedPlayers(game2, playerCells) {
    return [...playerCells.entries()].sort(
      (a, b) => compareStrings(getClientIdStr(game2, a[0]), getClientIdStr(game2, b[0]))
    );
  }
  function getPlayerCells(game2, clientId) {
    const cells = [];
    for (const cell of game2.query("cell")) {
      if (cell.get(modu2.Player).clientId === clientId && !cell.destroyed) {
        cells.push(cell);
      }
    }
    return cells;
  }
  function spawnFood(game2) {
    const colorStr = COLORS[(0, import_modu_engine.dRandom)() * COLORS.length | 0];
    const color = game2.internString("color", colorStr);
    game2.spawn("food", {
      x: 50 + (0, import_modu_engine.dRandom)() * (WORLD_WIDTH - 100) | 0,
      y: 50 + (0, import_modu_engine.dRandom)() * (WORLD_HEIGHT - 100) | 0,
      color
    });
  }
  function spawnCell(game2, clientId, options = {}) {
    const hash = hashString(clientId);
    const colorStr = options.color || COLORS[hash % COLORS.length];
    const color = game2.internString("color", colorStr);
    const radius = options.radius || INITIAL_RADIUS;
    const spawnX = options.x ?? 100 + (hash >>> 0) % (WORLD_WIDTH - 200);
    const spawnY = options.y ?? 100 + (hash >>> 16 ^ hash) % (WORLD_HEIGHT - 200);
    const entity = game2.spawn("cell", {
      x: spawnX,
      y: spawnY,
      clientId,
      color
    });
    if (options.radius) {
      const sprite = entity.get(modu2.Sprite);
      const body = entity.get(modu2.Body2D);
      sprite.radius = radius;
      body.radius = radius;
    }
    if (options.vx !== void 0 || options.vy !== void 0) {
      const body = entity.get(modu2.Body2D);
      body.vx = options.vx || 0;
      body.vy = options.vy || 0;
    }
    return entity;
  }
  function setupSystems(game2) {
    game2.addSystem(() => {
      const playerCells = getPlayerCellsGrouped(game2);
      const sortedPlayers = getSortedPlayers(game2, playerCells);
      const repulsion = /* @__PURE__ */ new Map();
      for (const [, siblings] of sortedPlayers) {
        for (const cell of siblings) {
          repulsion.set(cell.eid, { vx: 0, vy: 0 });
        }
        if (siblings.length < 2)
          continue;
        for (let i = 0; i < siblings.length; i++) {
          const cellA = siblings[i];
          const tA = cellA.get(modu2.Transform2D);
          const sA = cellA.get(modu2.Sprite);
          for (let j = i + 1; j < siblings.length; j++) {
            const cellB = siblings[j];
            const tB = cellB.get(modu2.Transform2D);
            const sB = cellB.get(modu2.Sprite);
            const dx = tA.x - tB.x;
            const dy = tA.y - tB.y;
            const distSq = dx * dx + dy * dy;
            const minDist = sA.radius + sB.radius;
            const minDistSq = minDist * minDist;
            if (distSq < minDistSq && distSq > 1) {
              const dist = (0, import_modu_engine.dSqrt)(distSq) || 1;
              const overlap = minDist - dist;
              const pushForce = overlap * REPULSION_FACTOR + REPULSION_BASE;
              const nx = dx / dist;
              const ny = dy / dist;
              const repA = repulsion.get(cellA.eid);
              const repB = repulsion.get(cellB.eid);
              repA.vx += nx * pushForce;
              repA.vy += ny * pushForce;
              repB.vx -= nx * pushForce;
              repB.vy -= ny * pushForce;
            }
          }
        }
      }
      for (const [clientId, cells] of sortedPlayers) {
        const playerInput = game2.world.getInput(clientId);
        for (const cell of cells) {
          const sprite = cell.get(modu2.Sprite);
          const transform = cell.get(modu2.Transform2D);
          const body = cell.get(modu2.Body2D);
          let vx = 0, vy = 0;
          if (playerInput?.target) {
            const tx = playerInput.target.x;
            const ty = playerInput.target.y;
            if (isFinite(tx) && isFinite(ty)) {
              const dx = tx - transform.x;
              const dy = ty - transform.y;
              const dist = (0, import_modu_engine.dSqrt)(dx * dx + dy * dy);
              if (dist > MOVE_DEADZONE) {
                vx = dx / dist * SPEED;
                vy = dy / dist * SPEED;
              }
            }
          }
          const rep = repulsion.get(cell.eid);
          if (rep) {
            vx += rep.vx;
            vy += rep.vy;
          }
          cell.setVelocity(vx, vy);
          const r = sprite.radius;
          transform.x = Math.max(r, Math.min(WORLD_WIDTH - r, transform.x));
          transform.y = Math.max(r, Math.min(WORLD_HEIGHT - r, transform.y));
        }
      }
    }, { phase: "update" });
    game2.addSystem(() => {
      const shouldSpawn = (0, import_modu_engine.dRandom)() < FOOD_SPAWN_CHANCE;
      if (shouldSpawn && game2.getEntitiesByType("food").length < MAX_FOOD) {
        spawnFood(game2);
      }
    }, { phase: "update" });
    game2.addSystem(() => {
      const playerCells = getPlayerCellsGrouped(game2);
      const sortedPlayers = getSortedPlayers(game2, playerCells);
      for (const [clientId, cells] of sortedPlayers) {
        const playerInput = game2.world.getInput(clientId);
        if (playerInput?.split) {
          console.log(`[SPLIT SYSTEM] frame=${game2.world.frame} clientId=${clientId} split=true target=${JSON.stringify(playerInput?.target)} cells=${cells.length}`);
        }
        if (!playerInput?.split || !playerInput?.target)
          continue;
        if (cells.length >= MAX_CELLS_PER_PLAYER) {
          console.log(`[SPLIT] Skipping - max cells reached (${cells.length}/${MAX_CELLS_PER_PLAYER})`);
          continue;
        }
        const cellsToSplit = cells.filter((c) => c.get(modu2.Sprite).radius >= MIN_SPLIT_RADIUS).slice(0, MAX_CELLS_PER_PLAYER - cells.length);
        console.log(`[SPLIT] Cells eligible for split: ${cellsToSplit.length} of ${cells.length} (minRadius=${MIN_SPLIT_RADIUS})`);
        for (const cell of cellsToSplit) {
          const t = cell.get(modu2.Transform2D);
          const s = cell.get(modu2.Sprite);
          const b = cell.get(modu2.Body2D);
          const dx = playerInput.target.x - t.x;
          const dy = playerInput.target.y - t.y;
          const len = (0, import_modu_engine.dSqrt)(dx * dx + dy * dy) || 1;
          const r = s.radius / Math.SQRT2;
          s.radius = r;
          b.radius = r;
          const clientIdStr = game2.getClientIdString(clientId);
          if (!clientIdStr)
            continue;
          const newCell = spawnCell(game2, clientIdStr, {
            x: t.x,
            y: t.y,
            radius: r,
            color: game2.getString("color", s.color)
          });
          const newBody = newCell.get(modu2.Body2D);
          newBody.impulseX = dx / len * SPLIT_IMPULSE;
          newBody.impulseY = dy / len * SPLIT_IMPULSE;
          const mergeFrame = game2.world.frame + MERGE_DELAY_FRAMES;
          cell.get(MergeCooldown).frame = mergeFrame;
          newCell.get(MergeCooldown).frame = mergeFrame;
        }
      }
    }, { phase: "update" });
    game2.addSystem(() => {
      const currentFrame = game2.world.frame;
      const playerCells = getPlayerCellsGrouped(game2);
      const sortedPlayers = getSortedPlayers(game2, playerCells);
      for (const [, cells] of sortedPlayers) {
        if (cells.length < 2)
          continue;
        cells.sort((a, b) => {
          const radiusDiff = b.get(modu2.Sprite).radius - a.get(modu2.Sprite).radius;
          return radiusDiff !== 0 ? radiusDiff : a.eid - b.eid;
        });
        for (let i = 0; i < cells.length; i++) {
          const cellA = cells[i];
          if (cellA.destroyed)
            continue;
          const tA = cellA.get(modu2.Transform2D);
          const sA = cellA.get(modu2.Sprite);
          for (let j = i + 1; j < cells.length; j++) {
            const cellB = cells[j];
            if (cellB.destroyed)
              continue;
            const mergeFrameA = cellA.get(MergeCooldown).frame;
            const mergeFrameB = cellB.get(MergeCooldown).frame;
            if (currentFrame < mergeFrameA || currentFrame < mergeFrameB)
              continue;
            const tB = cellB.get(modu2.Transform2D);
            const sB = cellB.get(modu2.Sprite);
            const dx = tA.x - tB.x;
            const dy = tA.y - tB.y;
            const dist = (0, import_modu_engine.dSqrt)(dx * dx + dy * dy);
            const mergeThreshold = (sA.radius + sB.radius) * MERGE_THRESHOLD;
            if (dist < mergeThreshold) {
              console.log("MERGE: cellA.eid=", cellA.eid, "clientId=", cellA.get(modu2.Player).clientId);
              console.log("MERGE: cellB.eid=", cellB.eid, "clientId=", cellB.get(modu2.Player).clientId);
              const areaA = sA.radius * sA.radius;
              const areaB = sB.radius * sB.radius;
              const newRadius = Math.min((0, import_modu_engine.dSqrt)(areaA + areaB), MAX_RADIUS);
              sA.radius = newRadius;
              cellA.get(modu2.Body2D).radius = newRadius;
              cellB.destroy();
              console.log("AFTER MERGE: cellA.clientId=", cellA.get(modu2.Player).clientId);
            }
          }
        }
      }
    }, { phase: "update" });
  }
  function setupCollisions(game2, physics2) {
    physics2.onCollision("cell", "food", (cell, food) => {
      if (food.destroyed)
        return;
      const sprite = cell.get(modu2.Sprite);
      const foodSprite = food.get(modu2.Sprite);
      sprite.radius = Math.min(sprite.radius + foodSprite.radius * FOOD_GROW, MAX_RADIUS);
      cell.get(modu2.Body2D).radius = sprite.radius;
      food.destroy();
    });
    physics2.onCollision("cell", "cell", (cellA, cellB) => {
      if (cellA.get(modu2.Player).clientId === cellB.get(modu2.Player).clientId)
        return;
      const eaterSprite = cellA.get(modu2.Sprite);
      const preySprite = cellB.get(modu2.Sprite);
      if (eaterSprite.radius > preySprite.radius * EAT_RATIO) {
        eaterSprite.radius = Math.min(eaterSprite.radius + preySprite.radius * PLAYER_GROW, MAX_RADIUS);
        cellA.get(modu2.Body2D).radius = eaterSprite.radius;
        cellB.destroy();
      }
    });
  }

  // src/render.ts
  var modu3 = __toESM(require_modu_engine());
  function lightenColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + percent);
    const g = Math.min(255, (num >> 8 & 255) + percent);
    const b = Math.min(255, (num & 255) + percent);
    return `rgb(${r},${g},${b})`;
  }
  function darkenColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, (num >> 16) - percent);
    const g = Math.max(0, (num >> 8 & 255) - percent);
    const b = Math.max(0, (num & 255) - percent);
    return `rgb(${r},${g},${b})`;
  }
  function worldToScreen(worldX, worldY, camX, camY, camZoom, WIDTH2, HEIGHT2) {
    return {
      x: (worldX - camX) * camZoom + WIDTH2 / 2,
      y: (worldY - camY) * camZoom + HEIGHT2 / 2
    };
  }
  function updateCamera(game2, cameraEntity2, getLocalClientId2, alpha) {
    const localId = getLocalClientId2();
    if (localId === null)
      return;
    const cells = getPlayerCells(game2, localId);
    if (cells.length === 0)
      return;
    const camera = cameraEntity2.get(modu3.Camera2D);
    let totalSize = 0;
    let totalArea = 0;
    let centerX = 0;
    let centerY = 0;
    for (const cell of cells) {
      cell.interpolate(alpha);
      const sprite = cell.get(modu3.Sprite);
      const area = sprite.radius * sprite.radius;
      centerX += cell.render.interpX * area;
      centerY += cell.render.interpY * area;
      totalArea += area;
      totalSize += sprite.radius;
    }
    if (totalArea > 0) {
      centerX /= totalArea;
      centerY /= totalArea;
      if (cameraChaseEnabled) {
        camera.x += (centerX - camera.x) * camera.smoothing;
        camera.y += (centerY - camera.y) * camera.smoothing;
      }
      camera.targetZoom = Math.max(MIN_ZOOM, BASE_ZOOM - (totalSize - INITIAL_RADIUS) * ZOOM_SCALE_FACTOR);
      camera.zoom += (camera.targetZoom - camera.zoom) * camera.smoothing;
    }
  }
  function createRenderer(game2, renderer2, getCameraEntity, canvas2, minimapCanvas2, sizeDisplay2, getLocalClientId2) {
    const ctx = renderer2.context;
    const minimapCtx = minimapCanvas2.getContext("2d");
    const WIDTH2 = canvas2.width;
    const HEIGHT2 = canvas2.height;
    function renderMinimap() {
      const cameraEntity2 = getCameraEntity();
      const camera = cameraEntity2.get(modu3.Camera2D);
      const mmW = minimapCanvas2.width;
      const mmH = minimapCanvas2.height;
      const scaleX = mmW / WORLD_WIDTH;
      const scaleY = mmH / WORLD_HEIGHT;
      minimapCtx.fillStyle = "rgba(17, 17, 17, 0.9)";
      minimapCtx.fillRect(0, 0, mmW, mmH);
      minimapCtx.strokeStyle = "#333";
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(0, 0, mmW, mmH);
      for (const entity of game2.getAllEntities()) {
        if (entity.destroyed)
          continue;
        try {
          const sprite = entity.get(modu3.Sprite);
          if (!sprite || !sprite.visible)
            continue;
          const transform = entity.get(modu3.Transform2D);
          const x = transform.x * scaleX;
          const y = transform.y * scaleY;
          const isFood = sprite.layer === 0;
          const radius = isFood ? 1 : Math.max(3, sprite.radius * scaleX * 1.5);
          const colorStr = game2.getString("color", sprite.color) || "#fff";
          minimapCtx.fillStyle = isFood ? "rgba(255,255,255,0.3)" : colorStr;
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, radius, 0, Math.PI * 2);
          minimapCtx.fill();
        } catch {
        }
      }
      const viewLeft = (camera.x - WIDTH2 / 2 / camera.zoom) * scaleX;
      const viewTop = (camera.y - HEIGHT2 / 2 / camera.zoom) * scaleY;
      const viewWidth = WIDTH2 / camera.zoom * scaleX;
      const viewHeight = HEIGHT2 / camera.zoom * scaleY;
      minimapCtx.strokeStyle = "#fff";
      minimapCtx.lineWidth = 1;
      minimapCtx.strokeRect(viewLeft, viewTop, viewWidth, viewHeight);
      const localId = getLocalClientId2();
      if (localId !== null) {
        const cells = getPlayerCells(game2, localId);
        for (const cell of cells) {
          if (cell.destroyed)
            continue;
          const transform = cell.get(modu3.Transform2D);
          const x = transform.x * scaleX;
          const y = transform.y * scaleY;
          minimapCtx.strokeStyle = "#fff";
          minimapCtx.lineWidth = 2;
          minimapCtx.beginPath();
          minimapCtx.arc(x, y, 5, 0, Math.PI * 2);
          minimapCtx.stroke();
        }
      }
    }
    return function renderWithCamera() {
      const cameraEntity2 = getCameraEntity();
      const alpha = game2.getRenderAlpha();
      const camera = cameraEntity2.get(modu3.Camera2D);
      updateCamera(game2, cameraEntity2, getLocalClientId2, alpha);
      const camX = camera.x;
      const camY = camera.y;
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(0, 0, WIDTH2, HEIGHT2);
      ctx.save();
      ctx.translate(WIDTH2 / 2, HEIGHT2 / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camX, -camY);
      ctx.strokeStyle = "#e0e0e0";
      ctx.lineWidth = 1 / camera.zoom;
      const gridSize = 100;
      const startX = Math.floor((camX - WIDTH2 / 2 / camera.zoom) / gridSize) * gridSize;
      const startY = Math.floor((camY - HEIGHT2 / 2 / camera.zoom) / gridSize) * gridSize;
      const endX = camX + WIDTH2 / 2 / camera.zoom;
      const endY = camY + HEIGHT2 / 2 / camera.zoom;
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
      ctx.strokeStyle = "#ccc";
      ctx.lineWidth = 4 / camera.zoom;
      ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      const entities = [];
      for (const entity of game2.getAllEntities()) {
        if (entity.destroyed)
          continue;
        try {
          const sprite = entity.get(modu3.Sprite);
          if (sprite && sprite.visible) {
            entity.interpolate(alpha);
            entities.push({ entity, layer: sprite.layer });
          }
        } catch {
        }
      }
      entities.sort((a, b) => a.layer - b.layer);
      for (const { entity } of entities) {
        const sprite = entity.get(modu3.Sprite);
        const x = entity.render.interpX + sprite.offsetX;
        const y = entity.render.interpY + sprite.offsetY;
        const screenPos = worldToScreen(x, y, camX, camY, camera.zoom, WIDTH2, HEIGHT2);
        const screenRadius = sprite.radius * camera.zoom;
        if (screenPos.x + screenRadius < 0 || screenPos.x - screenRadius > WIDTH2 || screenPos.y + screenRadius < 0 || screenPos.y - screenRadius > HEIGHT2) {
          continue;
        }
        const colorStr = game2.getString("color", sprite.color) || "#fff";
        if (sprite.shape === modu3.SHAPE_CIRCLE) {
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
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
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
      const localId = getLocalClientId2();
      if (localId !== null) {
        const cells = getPlayerCells(game2, localId);
        const totalRadius = cells.reduce((sum, c) => sum + c.get(modu3.Sprite).radius, 0);
        sizeDisplay2.textContent = `Size: ${Math.floor(totalRadius)}`;
      }
    };
  }

  // src/game.ts
  var game;
  var renderer;
  var physics;
  var input;
  var cameraSystem;
  var cameraEntity;
  var canvas;
  var minimapCanvas;
  var sizeDisplay;
  var WIDTH;
  var HEIGHT;
  var mouseX;
  var mouseY;
  var cameraChaseEnabled = true;
  var prevToggleCameraState = false;
  function getLocalClientId() {
    const clientId = game.localClientId;
    if (!clientId || typeof clientId !== "string")
      return null;
    return game.internClientId(clientId);
  }
  function setupInput(getCameraEntity) {
    mouseX = WIDTH / 2;
    mouseY = HEIGHT / 2;
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });
    input.action("target", {
      type: "vector",
      bindings: [() => {
        const cam = getCameraEntity().get(modu4.Camera2D);
        const worldX = (mouseX - WIDTH / 2) / cam.zoom + cam.x;
        const worldY = (mouseY - HEIGHT / 2) / cam.zoom + cam.y;
        return { x: worldX, y: worldY };
      }]
    });
    input.action("split", {
      type: "button",
      bindings: ["key: "]
      // Use string binding like toggleCamera
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === " ") {
        console.log("[INPUT] Space keydown detected!");
        console.log('[INPUT] isKeyDown(" ") result:', input.isKeyDown(" "));
        console.log('[INPUT] input.get("split") result:', input.get("split"));
        console.log("[INPUT] All actions:", input.getAll());
      }
    });
    input.action("toggleCamera", {
      type: "button",
      bindings: ["key:c"]
    });
  }
  function initGame() {
    canvas = document.getElementById("game");
    minimapCanvas = document.getElementById("minimap");
    sizeDisplay = document.getElementById("size-display");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    WIDTH = canvas.width;
    HEIGHT = canvas.height;
    window.addEventListener("resize", () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      WIDTH = canvas.width;
      HEIGHT = canvas.height;
    });
    game = modu4.createGame();
    renderer = game.addPlugin(modu4.Simple2DRenderer, canvas);
    physics = game.addPlugin(modu4.Physics2DSystem, { gravity: { x: 0, y: 0 } });
    input = game.addPlugin(modu4.InputPlugin, canvas);
    cameraSystem = game.addPlugin(modu4.CameraSystem);
    window.game = game;
    defineEntities(game);
    setupCollisions(game, physics);
    setupSystems(game);
    cameraEntity = game.spawn("camera");
    const cam = cameraEntity.get(modu4.Camera2D);
    cam.x = WORLD_WIDTH / 2;
    cam.y = WORLD_HEIGHT / 2;
    renderer.camera = cameraEntity;
    function ensureCameraEntity() {
      if (!cameraEntity || cameraEntity.destroyed || !cameraEntity.has(modu4.Camera2D)) {
        cameraEntity = game.spawn("camera");
        const cam2 = cameraEntity.get(modu4.Camera2D);
        cam2.x = WORLD_WIDTH / 2;
        cam2.y = WORLD_HEIGHT / 2;
        renderer.camera = cameraEntity;
      }
      return cameraEntity;
    }
    setupInput(ensureCameraEntity);
    game.addSystem(() => {
      const localId = getLocalClientId();
      if (localId === null)
        return;
      const playerInput = game.world.getInput(localId);
      const togglePressed = playerInput?.toggleCamera === true;
      if (togglePressed && !prevToggleCameraState) {
        cameraChaseEnabled = !cameraChaseEnabled;
        console.log("[DEBUG] Camera chase:", cameraChaseEnabled ? "ON" : "OFF");
      }
      prevToggleCameraState = togglePressed;
    }, { phase: "update" });
    renderer.render = createRenderer(
      game,
      renderer,
      ensureCameraEntity,
      // Pass getter function
      canvas,
      minimapCanvas,
      sizeDisplay,
      getLocalClientId
    );
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get("room") || "cell-eater-ecs";
    game.connect(roomId, {
      onRoomCreate() {
        console.log("[cell-eater] onRoomCreate");
        for (let i = 0; i < FOOD_COUNT; i++)
          spawnFood(game);
      },
      onConnect(clientId) {
        console.log("[cell-eater] onConnect:", clientId);
        spawnCell(game, clientId);
        if (clientId === game.localClientId) {
          const player = game.getEntityByClientId(clientId);
          if (player) {
            const t = player.get(modu4.Transform2D);
            const cam2 = ensureCameraEntity().get(modu4.Camera2D);
            cam2.x = t.x;
            cam2.y = t.y;
          }
        }
      },
      onDisconnect(clientId) {
        console.log("[cell-eater] onDisconnect:", clientId);
        const internedId = game.internClientId(clientId);
        for (const cell of getPlayerCells(game, internedId)) {
          cell.destroy();
        }
      }
    });
    modu4.enableDebugUI(game);
    game.enablePrediction();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGame);
  } else {
    initGame();
  }
  return __toCommonJS(game_exports);
})();
//# sourceMappingURL=game.js.map
