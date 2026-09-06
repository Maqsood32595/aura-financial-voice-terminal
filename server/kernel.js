import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fractal Kernel for SEC EDGAR 10-K Voice Agent
 * Auto-discovers and registers manifests in server/features/
 */
export class FractalKernel {
  constructor(app) {
    this.app = app;
    this.features = new Map();
    this.voiceTools = new Map();
  }

  async bootstrap() {
    console.log('\n[Fractal Kernel] Initializing SEC EDGAR manifest discovery...');
    const featuresDir = path.resolve(__dirname, 'features');
    if (!fs.existsSync(featuresDir)) return;

    const featureFolders = fs.readdirSync(featuresDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const folder of featureFolders) {
      const manifestPath = path.join(featuresDir, folder, 'feature.manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        this.features.set(manifest.name, manifest);

        // Auto-mount Express route
        const routesPath = path.join(featuresDir, folder, 'routes.js');
        if (fs.existsSync(routesPath)) {
          const { default: router } = await import(`file://${routesPath.replace(/\\/g, '/')}`);
          this.app.use(manifest.baseRoute, router);
          console.log(`[Fractal Kernel] Mounting Feature: [${manifest.name}] v${manifest.version} -> ${manifest.baseRoute}`);
        }

        // Register Voice Tools
        if (manifest.voiceTools) {
          for (const tool of manifest.voiceTools) {
            this.voiceTools.set(tool.name, { ...tool, feature: manifest.name });
            console.log(`  └─ Registered In-RAM Financial Voice Tool: '${tool.name}'`);
          }
        }
      }
    }
    console.log(`[Fractal Kernel] Successfully loaded ${this.features.size} SEC feature slices.\n`);
  }
}
