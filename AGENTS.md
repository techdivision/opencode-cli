# AGENTS.md - OpenCode CLI

This file provides guidance for AI coding agents working in this repository.

## Quick Reference

| Item | Value |
|------|-------|
| **Language** | JavaScript (ES Modules) |
| **Node Version** | >=18 |
| **Dependencies** | Zero (Node.js built-ins only) |
| **Entry Point** | `bin/opencode-link.js` |
| **Type System** | JSDoc annotations |

## Build/Lint/Test Commands

This project has **no build step** - it uses pure ES Modules JavaScript.

```bash
# No build required - run directly
node bin/opencode-link.js list

# Link globally for development testing
npm link

# Test CLI in a fresh directory
mkdir -p /tmp/test-cli && cd /tmp/test-cli
npx opencode-link list

# Test with local plugins
mkdir -p /tmp/test-cli/.opencode && cd /tmp/test-cli/.opencode
npm install github:techdivision/opencode-plugins
npx opencode-link list

# Verify ES module syntax
node --check bin/opencode-link.js
node --check lib/discovery.js
node --check lib/linker.js
node --check lib/schema.js
```

**Note**: This project has no automated tests, linting, or formatting tools configured. Testing is done manually via the CLI commands above.

## Project Structure

```
opencode-cli/
├── package.json              # NPM package config (type: module)
├── README.md                 # User documentation
├── AGENTS.md                 # AI agent guidance (this file)
├── bin/
│   └── opencode-link.js      # CLI entry point (~714 lines)
└── lib/
    ├── index.js              # Re-exports all modules
    ├── discovery.js          # Plugin discovery logic (~424 lines)
    ├── linker.js             # Symlink utilities (~359 lines)
    └── schema.js             # JSON schema generation (~88 lines)
```

## Code Style Guidelines

### Module System (ES Modules)

```javascript
// CORRECT - ES Module imports (Node.js built-ins only)
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// CORRECT - __dirname equivalent for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CORRECT - Named exports
export function discoverPlugins(targetDir) { ... }
export const AGENTS_MD_MARKER = '<!-- AUTO-GENERATED -->';
```

### Formatting Rules

- **Indentation**: 2 spaces (not tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Trailing commas**: Use in multi-line arrays/objects
- **Line length**: No strict limit, but keep readable

### Naming Conventions

```javascript
// Functions and variables: camelCase
function discoverPlugins(targetDir) { ... }
const allPlugins = new Map();

// Constants: UPPER_SNAKE_CASE
const AGENTS_MD_MARKER = '<!-- AUTO-GENERATED -->';
const CONTENT_TYPE_MAPPING = { ... };

// Private functions: camelCase (no underscore prefix)
function getGlobalDir() { ... }  // Not exported = private
```

### JSDoc Documentation

All exported functions MUST have JSDoc comments:

```javascript
/**
 * Discovers all available plugins from all locations.
 * 
 * Priority (last wins):
 * 1. Global: npm global prefix (npm install -g)
 * 2. Local: {targetDir}/node_modules/
 * 
 * @param {string} targetDir - The .opencode directory
 * @returns {Map<string, PluginDescriptor>} Map of plugin name to descriptor
 */
export function discoverPlugins(targetDir) { ... }
```

Use `@typedef` for complex types at the end of files.

### Error Handling

```javascript
// Silent catch for non-critical operations
try {
  const prefix = execSync('npm config get prefix', { encoding: 'utf-8' }).trim();
  return path.join(prefix, 'lib', 'node_modules');
} catch {
  return null;  // Empty catch - failure is acceptable
}

// Check existence before operations
if (!fs.existsSync(nodeModulesDir)) {
  return plugins;  // Early return, no error thrown
}
```

### Console Output

Use ANSI color codes for terminal output:

```javascript
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

console.log(`${colors.green}  + ${message}${colors.reset}`);
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

## Git Workflow

1. Work on `main` branch (small repo)
2. Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
3. Tag releases: `v0.1.0`, `v0.2.0`, etc.

## Related Repositories

- **opencode-plugins**: Main plugin repository
- **opencode-plugin-time-tracking**: Example singlerepo plugin
- **opencode-plugin-shell-env**: Example singlerepo plugin
