import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.cache', 'dist', 'build']);
const EXCLUDE_FILES = new Set(['wish-web-bhopmgamer-main-repaired.zip', '.DS_Store']);

async function packProject(projectRoot, outputFile) {
  const zip = new JSZip();

  function addFiles(currentDir, relativePrefix = '') {
    const entries = fs.readdirSync(currentDir);
    for (const entry of entries) {
      if (relativePrefix === '' && EXCLUDE_DIRS.has(entry)) continue;
      if (EXCLUDE_FILES.has(entry)) continue;

      const fullPath = path.join(currentDir, entry);
      const relPath = relativePrefix ? `${relativePrefix}/${entry}` : entry;
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        addFiles(fullPath, relPath);
      } else if (stat.isFile()) {
        const data = fs.readFileSync(fullPath);
        zip.file(relPath, data);
      }
    }
  }

  console.log(`Packaging project from ${projectRoot}...`);
  addFiles(projectRoot);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  fs.writeFileSync(outputFile, buffer);
  const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
  console.log(`✅ Packed project to ${outputFile} (${sizeMb} MB)`);
}

const root = process.cwd();
const target = path.resolve(root, 'wish-web-bhopmgamer-main-repaired.zip');

packProject(root, target).catch(err => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
