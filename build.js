/**
 * Build script for cell-eater game
 *
 * Features:
 * - Deterministic transform: converts math operators to fixed-point equivalents
 * - Bundles game + engine into single file
 * - Source maps for debugging
 *
 * Usage:
 *   node build.js           # Build once
 *   node build.js --watch   # Watch mode
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

/**
 * Transform code to use deterministic math functions.
 * Automatically detects and converts Math.sqrt, Math.random, etc.
 */
function deterministicTransform(code, filename, fullPath) {
    // Skip node_modules and engine source (engine already uses deterministic math)
    if (filename.includes('node_modules') || fullPath.includes('engine')) {
        return code;
    }

    console.log(`[deterministic] Transforming: ${filename}`);

    // Track what we need to import
    const neededImports = new Set();

    // Check what's already imported from modu-engine (handles multi-line imports)
    const existingImportMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]modu-engine['"]/s);
    const existingImportBlock = existingImportMatch ? existingImportMatch[1] : '';

    // Check if specific identifiers exist in the import block
    const hasDSqrt = /\bdSqrt\b/.test(existingImportBlock);
    const hasDRandom = /\bdRandom\b/.test(existingImportBlock);

    // Transform Math.sqrt(x) -> dSqrt(x)
    code = code.replace(/Math\.sqrt\s*\(/g, () => {
        if (!hasDSqrt) {
            neededImports.add('dSqrt');
        }
        return 'dSqrt(';
    });

    // Transform Math.random() -> dRandom()
    code = code.replace(/Math\.random\s*\(\s*\)/g, () => {
        if (!hasDRandom) {
            neededImports.add('dRandom');
        }
        return 'dRandom()';
    });

    // NOTE: fpMul/fpDiv auto-transform is DISABLED
    // It doesn't work because fpMul expects fixed-point integers, not floats.
    // The game code must either:
    // 1. Use fixed-point values throughout (toFixed/toFloat)
    // 2. Or rely on the engine's internal deterministic math
    //
    // code = transformBinaryOp(code, '*', 'fpMul', neededImports);
    // code = transformBinaryOp(code, '/', 'fpDiv', neededImports);

    // Add imports if needed
    if (neededImports.size > 0) {
        const imports = Array.from(neededImports).join(', ');
        // Check if there's already an import from modu-engine (handles multi-line with 's' flag)
        const engineImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]modu-engine['"]/s;
        const match = code.match(engineImportRegex);

        if (match) {
            // Add to existing import - handle trailing comma
            let existingImports = match[1].trim();
            // Remove trailing comma if present
            if (existingImports.endsWith(',')) {
                existingImports = existingImports.slice(0, -1);
            }
            const newImports = `${existingImports}, ${imports}`;
            code = code.replace(engineImportRegex, `import { ${newImports} } from 'modu-engine'`);
        } else {
            // Add new import at start of file
            code = `import { ${imports} } from 'modu-engine';\n` + code;
        }
    }

    return code;
}

/**
 * Transform binary operators (*, /) to function calls.
 * Transforms floating-point math while preserving integer patterns.
 */
function transformBinaryOp(code, op, fnName, neededImports) {
    // Skip if this function is already imported
    const existingImportMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]modu-engine['"]/s);
    const alreadyImported = existingImportMatch && new RegExp(`\\b${fnName}\\b`).test(existingImportMatch[1]);

    const escapedOp = op === '*' ? '\\*' : '\\/';

    // Match: expr * expr or expr / expr
    // Don't capture parentheses - they break the transform
    const pattern = new RegExp(
        `([\\w.\\[\\]]+)\\s*(${escapedOp})\\s*([\\w.\\[\\]]+)`,
        'g'
    );

    let result = '';
    let lastIndex = 0;
    let inString = false;
    let inComment = false;
    let stringChar = '';
    let bracketDepth = 0;

    // First pass: identify string/comment regions and bracket depth
    const regions = [];
    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const prev = code[i - 1];
        const next = code[i + 1];

        if (inComment) {
            if (inComment === 'line' && char === '\n') {
                inComment = false;
            } else if (inComment === 'block' && char === '*' && next === '/') {
                inComment = false;
                i++;
            }
            continue;
        }

        if (inString) {
            if (char === stringChar && prev !== '\\') {
                inString = false;
            }
            continue;
        }

        if (char === '/' && next === '/') {
            inComment = 'line';
            continue;
        }
        if (char === '/' && next === '*') {
            inComment = 'block';
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            inString = true;
            stringChar = char;
            continue;
        }

        if (char === '[') bracketDepth++;
        if (char === ']') bracketDepth--;

        regions.push({ index: i, bracketDepth, inString: false, inComment: false });
    }

    // Helper to check if position is safe to transform
    function isSafePosition(index) {
        // Check if we're in a string or comment
        let inStr = false;
        let inCmt = false;
        let strChar = '';
        let brDepth = 0;

        for (let i = 0; i < index && i < code.length; i++) {
            const char = code[i];
            const prev = code[i - 1];
            const next = code[i + 1];

            if (inCmt) {
                if (inCmt === 'line' && char === '\n') inCmt = false;
                else if (inCmt === 'block' && char === '*' && next === '/') { inCmt = false; i++; }
                continue;
            }
            if (inStr) {
                if (char === strChar && prev !== '\\') inStr = false;
                continue;
            }
            if (char === '/' && next === '/') { inCmt = 'line'; continue; }
            if (char === '/' && next === '*') { inCmt = 'block'; continue; }
            if (char === '"' || char === "'" || char === '`') { inStr = true; strChar = char; continue; }
            if (char === '[') brDepth++;
            if (char === ']') brDepth--;
        }

        return !inStr && !inCmt && brDepth === 0;
    }

    // Helper to check if this is an integer-only expression
    function isIntegerPattern(left, right, matchIndex, fullMatch) {
        // Check for integer truncation pattern: | 0 after the expression
        const after = code.slice(matchIndex + fullMatch.length, matchIndex + fullMatch.length + 10);
        if (/^\s*\|\s*0/.test(after)) return true;

        // Both operands are integer literals
        if (/^\d+$/.test(left) && /^\d+$/.test(right)) return true;

        // Common integer-only patterns
        const integerNames = /^(length|size|count|index|i|j|k|n|width|height)$/i;
        if (integerNames.test(left) && /^\d+$/.test(right)) return true;
        if (integerNames.test(right) && /^\d+$/.test(left)) return true;

        // Array access patterns - check if we're inside brackets
        const before = code.slice(Math.max(0, matchIndex - 50), matchIndex);
        if (/\[\s*$/.test(before)) return true;

        return false;
    }

    // Helper to strip parentheses from operands for pattern matching
    function stripParens(s) {
        return s.replace(/^[()\s]+|[()\s]+$/g, '');
    }

    // Helper to check if this looks like float math
    function isFloatPattern(left, right) {
        // Strip surrounding parens for pattern matching
        left = stripParens(left);
        right = stripParens(right);

        // Decimal literals (0.5, .5, 2.0, etc.)
        if (/^\d*\.\d+$/.test(left) || /^\d*\.\d+$/.test(right)) return true;
        if (/^\d+\.\d*$/.test(left) || /^\d+\.\d*$/.test(right)) return true;

        // Common float variable names in game code
        const floatNames = /^(x|y|z|vx|vy|vz|dx|dy|dz|dist|distSq|speed|radius|scale|zoom|alpha|angle|rot|velocity|force|mass|friction|gravity|delta|dt|time|area|overlap|push|nx|ny|nz|minDist|maxDist|newRadius|areaA|areaB|totalArea|centerX|centerY|avgRadius|spreadZoom|mergeThreshold|screenRadius|pushForce|speedMultiplier)$/i;
        if (floatNames.test(left) || floatNames.test(right)) return true;

        // Property access that's likely float
        const floatProps = /(\.x|\.y|\.z|\.vx|\.vy|\.vz|\.radius|\.speed|\.scale|\.zoom|\.alpha|\.width|\.height|\.offsetX|\.offsetY|\.smoothing|\.targetZoom|\.interpX|\.interpY)$/i;
        if (floatProps.test(left) || floatProps.test(right)) return true;

        // Constants that are likely floats
        const floatConsts = /^(SPEED|GRAVITY|FRICTION|SCALE|ZOOM|EAT_RATIO|FOOD_GROW|PLAYER_GROW|SPLIT_VELOCITY|MIN_ZOOM|BASE_ZOOM|ZOOM_SCALE_FACTOR|INITIAL_RADIUS|MAX_RADIUS|WORLD_WIDTH|WORLD_HEIGHT|Math\.PI|Math\.SQRT2)$/;
        if (floatConsts.test(left) || floatConsts.test(right)) return true;

        return false;
    }

    // Process matches
    code = code.replace(pattern, (match, left, operator, right, offset) => {
        // Skip if in string/comment or inside brackets
        if (!isSafePosition(offset)) {
            return match;
        }

        // Skip integer patterns
        if (isIntegerPattern(left.trim(), right.trim(), offset, match)) {
            return match;
        }

        // Transform if it looks like float math
        if (isFloatPattern(left.trim(), right.trim())) {
            if (!alreadyImported) {
                neededImports.add(fnName);
            }
            return `${fnName}(${left.trim()}, ${right.trim()})`;
        }

        // Default: don't transform (conservative)
        return match;
    });

    return code;
}

// esbuild plugin for deterministic transforms
const deterministicPlugin = {
    name: 'deterministic',
    setup(build) {
        build.onLoad({ filter: /\.(ts|js)$/ }, async (args) => {
            const source = await fs.promises.readFile(args.path, 'utf8');
            const transformed = deterministicTransform(source, path.basename(args.path), args.path);

            return {
                contents: transformed,
                loader: args.path.endsWith('.ts') ? 'ts' : 'js',
            };
        });
    },
};

// Plugin to map 'modu-engine' imports to the CDN global
const cdnEnginePlugin = {
    name: 'cdn-engine',
    setup(build) {
        // Resolve 'modu-engine' to a virtual module
        build.onResolve({ filter: /^modu-engine$/ }, () => ({
            path: 'modu-engine',
            namespace: 'cdn-global',
        }));

        // Return a module that re-exports from the global
        build.onLoad({ filter: /.*/, namespace: 'cdn-global' }, () => ({
            contents: 'module.exports = window.Modu;',
            loader: 'js',
        }));
    },
};

// Build configuration
const buildOptions = {
    entryPoints: ['src/game.ts'],
    bundle: true,
    outfile: 'dist/game.js',
    format: 'iife',
    globalName: 'CellEater',
    sourcemap: true,
    target: 'es2020',
    plugins: [deterministicPlugin, cdnEnginePlugin],
    define: {
        'process.env.NODE_ENV': '"development"',
    },
    logLevel: 'info',
};

async function build() {
    const args = process.argv.slice(2);
    const watch = args.includes('--watch');
    const serve = args.includes('--serve');

    // Auto-detect: CI/GitHub Actions = production (CDN), otherwise local
    const isCI = process.env.CI || process.env.GITHUB_ACTIONS;
    const localEngineUrl = 'http://localhost:3001/dist/modu.min.js';
    const cdnEngineUrl = `https://cdn.moduengine.com/modu.min.js?v=${Date.now()}`;
    const engineUrl = isCI ? cdnEngineUrl : localEngineUrl;

    // Ensure dist directory exists
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }

    // Update engine URL in dist/index.html, setting engine URL
    // Use regex to match CDN URL with any or no version parameter
    let indexHtml = fs.readFileSync('dist/index.html', 'utf8');
    indexHtml = indexHtml.replace(localEngineUrl, engineUrl);
    indexHtml = indexHtml.replace(/https:\/\/cdn\.moduengine\.com\/modu\.min\.js(\?v=\d+)?/, engineUrl);
    fs.writeFileSync('dist/index.html', indexHtml);
    console.log('[build] Engine: ' + (isCI ? 'CDN (CI)' : 'localhost'));

    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('[build] Watching for changes...');

        if (serve) {
            // Kill any existing process on the port
            const { execSync } = require('child_process');
            try {
                if (process.platform === 'win32') {
                    execSync('npx kill-port 8080', { stdio: 'ignore' });
                } else {
                    execSync('lsof -ti:8080 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
                }
            } catch {}

            const { host, port } = await ctx.serve({
                servedir: 'dist',
                port: 8080,
            });
            console.log(`[build] Serving at http://localhost:${port}`);
        }
    } else {
        await esbuild.build(buildOptions);
        console.log('[build] Done!');
    }
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
