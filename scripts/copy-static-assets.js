const shell = require('shelljs');
const path = require('path');

shell.mkdir("-p", "dist");
// Node-RED only looks for icons in an "icons" directory next to a registered node
// file. dist/twitch/twitch-api-config.js sits in dist/twitch, so this directory is
// scanned for the whole package and any node can reference its icons by filename.
shell.mkdir("-p", "dist/twitch/icons");

// Copy all HTML files recursively
function copyHtml(srcDir, destDir) {
  shell.ls("-R", srcDir).forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    if (shell.test("-f", srcPath) && srcPath.endsWith(".html")) {
      // Make sure the target directory exists
      shell.mkdir("-p", path.dirname(destPath));
      shell.cp(srcPath, destPath);
    }
  });
}

copyHtml("src", "dist");

// Copy icons
shell.cp("-R", "src/icons/*.svg", "dist/twitch/icons/");

