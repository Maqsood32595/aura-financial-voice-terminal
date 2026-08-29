import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { voiceOrchestrator } from './core/voice-orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fractal Kernel
 * Manifest-driven feature loader and isolation engine.
 * Discovers and mounts modular features with zero tight-coupling.
 */
export class FractalKernel {
  constructor() {
    this.features = new Map();
    this.manifests = [];
  }

  /**
   * Boot Kernel and load all feature cells
   * @param {import('express').Express} app 
   * @param {string} [featuresDir]
   */
  async boot(app, featuresDir = path.join(__dirname, 'features')) {
    console.log('\n[Fractal Kernel] Initializing manifest discovery...');
    
    if (!fs.existsSync(featuresDir)) {
      console.warn(`[Fractal Kernel] No features directory found at ${featuresDir}`);
      return;
    }

    const featureDirs = fs.readdirSync(featuresDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const name of featureDirs) {
      const manifestPath = path.join(featuresDir, name, 'feature.manifest.json');
      if (!fs.existsSync(manifestPath)) {
        console.warn(`[Fractal Kernel] Skipping '${name}': Missing feature.manifest.json`);
        continue;
      }

      try {
        const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestRaw);
        this.manifests.push(manifest);

        console.log(`[Fractal Kernel] Mounting Feature: [${manifest.name}] v${manifest.version} -> ${manifest.basePath}`);

        // 1. Mount REST Routes if defined
        const routesFile = path.join(featuresDir, name, manifest.routesFile || 'routes.js');
        if (fs.existsSync(routesFile)) {
          const routesModule = await import(pathToFileURL(routesFile).href);
          if (routesModule.default) {
            app.use(manifest.basePath, routesModule.default);
          }
        }

        // 2. Register Voice Tools if defined
        const serviceFile = path.join(featuresDir, name, manifest.serviceFile || 'service.js');
        if (fs.existsSync(serviceFile)) {
          const serviceModule = await import(pathToFileURL(serviceFile).href);
          if (manifest.voiceTools && Array.isArray(manifest.voiceTools)) {
            for (const tool of manifest.voiceTools) {
              const executor = serviceModule[tool.handler];
              const validator = serviceModule[tool.validator];
              if (executor) {
                voiceOrchestrator.registerTool(tool.name, {
                  description: tool.description,
                  execute: executor,
                  validate: validator
                });
                console.log(`  └─ Registered In-RAM Voice Tool: '${tool.name}'`);
              }
            }
          }
        }

        this.features.set(manifest.name, manifest);
      } catch (err) {
        console.error(`[Fractal Kernel] Failed to mount feature '${name}':`, err);
      }
    }

    console.log(`[Fractal Kernel] Successfully loaded ${this.features.size} features.\n`);
  }

  /**
   * Get all registered feature manifests
   */
  getManifests() {
    return this.manifests;
  }
}

export const kernel = new FractalKernel();
