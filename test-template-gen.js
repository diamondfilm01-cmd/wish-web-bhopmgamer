import fs from 'fs';
import path from 'path';
import { validateUtpManifest } from './src/template-protocol-validator.js';

async function testGeneratedTemplate() {
    console.log('--- WishMagic Template Validator for Starlit Memories ---');
    
    const manifestPath = path.resolve('templates/tpl_starlit_memories/v1.0.0/manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('FAIL: manifest.json missing!');
        process.exit(1);
    }
    
    const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const validation = validateUtpManifest(manifestContent);
    
    if (validation.valid) {
        console.log('SUCCESS: Manifest is 100% valid according to WishMagic UTP specifications!');
        console.log(`Template: ${validation.template.name} (${validation.template.id}) v${validation.template.templateVersion}`);
        console.log(`Sections defined: ${validation.summary.sectionsCount}`);
        console.log(`Fields defined: ${validation.summary.fieldsCount}`);
    } else {
        console.error('FAIL: Manifest validation errors:', validation.errors);
        process.exit(1);
    }

    const indexPath = path.resolve('templates/tpl_starlit_memories/v1.0.0/index.html');
    if (fs.existsSync(indexPath)) {
        console.log('SUCCESS: index.html entry point verified.');
    } else {
        console.error('FAIL: index.html missing!');
        process.exit(1);
    }
}

testGeneratedTemplate().catch(err => {
    console.error('Validation test encountered an error:', err);
    process.exit(1);
});
