const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Every node ships an editor file next to its runtime file, and the editor loads
 * the script block of that HTML into the page. A syntax error there does not fail
 * loudly anywhere: the node type simply never registers and the editor renders
 * the node as an unknown node, so a flow that imports it looks broken. Parse the
 * script blocks and fail the build instead.
 */

const srcDir = path.resolve(__dirname, '..', 'src');
const scriptBlock = /<script[^>]*\btype=["']text\/javascript["'][^>]*>([\s\S]*?)<\/script>/gi;

function htmlFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return htmlFiles(full);
        return entry.name.endsWith('.html') ? [full] : [];
    });
}

const failures = [];
const checked = htmlFiles(srcDir);

for (const file of checked) {
    const html = fs.readFileSync(file, 'utf8');
    const relative = path.relative(path.resolve(__dirname, '..'), file);
    const blocks = [...html.matchAll(scriptBlock)];

    if (!blocks.length) {
        failures.push(`${relative}: no editor script block found`);
        continue;
    }

    for (const [, code] of blocks) {
        if (!code.trim()) continue;
        try {
            new vm.Script(code, { filename: relative });
        } catch (err) {
            failures.push(`${relative}: ${err.message}`);
        }
    }
}

if (failures.length) {
    console.error(`editor script syntax errors in ${failures.length} file(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nthe editor cannot register these node types, so they show up as unknown nodes');
    process.exit(1);
}

console.log(`editor scripts parse: ${checked.length} html files`);
