const shell = require('shelljs');
const path = require('path');

shell.mkdir("-p", "dist");
shell.mkdir("-p", "dist/icons");

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
shell.cp("-R", "src/icons/*.svg", "dist/");
