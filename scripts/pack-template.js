import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function packTemplate(sourceDir, outputFile) {
  const zip = new JSZip();

  function addFilesFromDir(dir, zipFolder) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        addFilesFromDir(fullPath, zipFolder.folder(item));
      } else {
        const fileData = fs.readFileSync(fullPath);
        zipFolder.file(item, fileData);
      }
    }
  }

  addFilesFromDir(sourceDir, zip);

  const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputFile, content);
  console.log(`Successfully packed ${sourceDir} -> ${outputFile} (${content.length} bytes)`);
}

const source = path.resolve('templates/tpl_starlit_memories/v1.0.0');
const output = path.resolve('starlit_memories_v1.0.0.zip');

packTemplate(source, output).catch(err => {
  console.error('Failed to pack template:', err);
  process.exit(1);
});
