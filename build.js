/**
 * Build script for modu-engine
 *
 * Usage:
 *   node build.js           # Build once
 *   node build.js --watch   # Watch mode
 *   node build.js --watch --serve  # Watch + dev server
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Build configuration
const buildOptions = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    outdir: 'dist',
    entryNames: '[name]-[hash]',
    format: 'esm',
    sourcemap: true,
    target: 'es2020',
    platform: 'browser',
    logLevel: 'info',
    metafile: true,
};

// Also build IIFE for script tag usage
const iifeBuildOptions = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    outdir: 'dist',
    entryNames: '[name].iife-[hash]',
    format: 'iife',
    globalName: 'Modu',
    sourcemap: true,
    target: 'es2020',
    platform: 'browser',
    logLevel: 'info',
    metafile: true,
};

// Clean old hashed files
function cleanOldBuilds() {
    if (!fs.existsSync('dist')) return;
    const files = fs.readdirSync('dist');
    for (const file of files) {
        // Match files like index-HASH.js, index.iife-HASH.js and their sourcemaps
        if (/^index(-|\.iife-)[a-f0-9]+\.js(\.map)?$/.test(file)) {
            fs.unlinkSync(path.join('dist', file));
        }
    }
}

// Write manifest with current filenames
function writeManifest(esmResult, iifeResult) {
    const manifest = {};

    for (const [outfile] of Object.entries(esmResult.metafile.outputs)) {
        if (outfile.endsWith('.js') && !outfile.endsWith('.map')) {
            manifest['modu.js'] = path.basename(outfile);
        }
    }
    for (const [outfile] of Object.entries(iifeResult.metafile.outputs)) {
        if (outfile.endsWith('.js') && !outfile.endsWith('.map')) {
            manifest['modu.iife.js'] = path.basename(outfile);
        }
    }

    fs.writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
    console.log('[build] Manifest:', manifest);
}

async function build() {
    const args = process.argv.slice(2);
    const watch = args.includes('--watch');
    const serve = args.includes('--serve');

    // Ensure dist directory exists
    if (!fs.existsSync('dist')) {
        fs.mkdirSync('dist');
    }

    // Clean old hashed builds
    cleanOldBuilds();

    // Copy example index.html if it exists
    if (fs.existsSync('examples/index.html')) {
        fs.copyFileSync('examples/index.html', 'dist/index.html');
        console.log('[build] Copied examples/index.html to dist/');
    }

    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        const ctxIife = await esbuild.context(iifeBuildOptions);

        await ctx.watch();
        await ctxIife.watch();
        console.log('[build] Watching for changes...');

        if (serve) {
            // Kill any existing process on the port
            const { execSync } = require('child_process');
            try {
                if (process.platform === 'win32') {
                    execSync('npx kill-port 3003', { stdio: 'ignore' });
                } else {
                    execSync('lsof -ti:3003 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
                }
            } catch {}

            const { port } = await ctx.serve({
                servedir: 'dist',
                port: 3003,
            });
            console.log(`[build] Serving at http://localhost:${port}`);
        }
    } else {
        const [esmResult, iifeResult] = await Promise.all([
            esbuild.build(buildOptions),
            esbuild.build(iifeBuildOptions),
        ]);
        writeManifest(esmResult, iifeResult);
        console.log('[build] Done!');
    }
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
