# AGENTS.md - OpenCode CLI

This file provides guidance for AI coding agents working in this repository.

## Repository Overview

This repository contains the CLI tools for OpenCode plugin management.

- **Type**: CLI tool (ES Module, Node.js)
- **Entry Point**: `bin/opencode-link.js`
- **No external dependencies** - uses Node.js built-ins only

## Project Structure

```
opencode-cli/
├── package.json              # NPM package configuration
├── README.md                 # Documentation
├── AGENTS.md                 # This file
├── .gitignore
├── bin/
│   └── opencode-link.js      # CLI entry point
└── lib/
    ├── index.js              # Re-exports all modules
    ├── discovery.js          # Plugin discovery (global + local)
    ├── linker.js             # Symlink creation utilities
    └── schema.js             # JSON schema generation
```

## Files

| File | Purpose |
|------|---------|
| `bin/opencode-link.js` | CLI entry point, argument parsing, command dispatch |
| `lib/discovery.js` | Discovers plugins from global npm prefix and local node_modules |
| `lib/linker.js` | Creates symlinks with "last wins" strategy |
| `lib/schema.js` | Generates combined JSON schema from plugin schemas |
| `lib/index.js` | Re-exports all modules for convenience |

## Code Style

- **Module System**: ES Modules (`"type": "module"` in package.json)
- **Node.js APIs**: Use `fs`, `path`, `os`, `child_process` from Node.js built-ins
- **No Dependencies**: Zero external dependencies
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Functions**: Use JSDoc comments for public functions

```javascript
// Good - ES Module imports
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Good - __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Good - JSDoc for functions
/**
 * Discovers all available plugins from all locations.
 * @param {string} targetDir - The .opencode directory
 * @returns {Map<string, PluginDescriptor>} Map of plugin name to descriptor
 */
export function discoverPlugins(targetDir) { ... }
```

## Key Concepts

### Plugin Discovery (lib/discovery.js)

Plugins are discovered from two locations:
1. **Global**: `npm config get prefix`/lib/node_modules/
2. **Local**: `{targetDir}/node_modules/`

Priority: **last wins** (local overrides global)

### Plugin Types

- **Monorepo**: Package with subdirectories containing `.opencode/`
- **Singlerepo**: Package with `plugin.json` + content directories in root

### Symlink Strategy (lib/linker.js)

- **LAST WINS**: Existing symlinks are overwritten
- **Real files preserved**: Real files/directories are NOT overwritten
- **Same-source skipped**: Symlinks pointing to same source are skipped

## Testing

```bash
# Link globally for testing
npm link

# Test in a new project
mkdir -p /tmp/test-cli && cd /tmp/test-cli
npx opencode-link list

# Test with opencode-plugins
mkdir -p /tmp/test-cli/.opencode && cd /tmp/test-cli/.opencode
npm install github:techdivision/opencode-plugins
npx opencode-link list
```

## Git Workflow

This repository follows a simple workflow:

1. Work on `main` branch for now (small repo)
2. Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
3. Tag releases: `v0.1.0`, `v0.2.0`, etc.

## Related Repositories

- **opencode-plugins**: Main plugin repository (depends on this CLI)
- **opencode-plugin-time-tracking**: Example singlerepo plugin
- **opencode-plugin-shell-env**: Example singlerepo plugin
