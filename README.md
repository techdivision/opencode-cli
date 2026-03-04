# @techdivision/opencode-cli

CLI tools for OpenCode plugin management.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9

## Installation

### Option A: User-wide Plugins (recommended)

Install CLI globally and plugins in your user config directory:

```bash
# Install CLI globally
npm install -g github:techdivision/opencode-cli

# Install plugins in user config directory
cd ~/.config/opencode
npm install github:techdivision/opencode-plugins

# Link plugins (from user config directory)
opencode-link              # Links directly to ~/.config/opencode/commands/, etc.

# Or link in any project
cd /path/to/my-project
opencode-link              # Links to .opencode/commands/, etc.
```

### Option B: Project-local Plugins

Install plugins locally in each project:

```bash
cd /path/to/my-project
mkdir -p .opencode && cd .opencode
npm install github:techdivision/opencode-plugins
npx opencode-link
cd ..
```

### Option C: Global CLI + Local Plugins

Install CLI globally, plugins per project:

```bash
# Install CLI globally (once)
npm install -g github:techdivision/opencode-cli

# In each project: install plugins locally
cd /path/to/my-project/.opencode
npm install github:techdivision/opencode-plugins
cd ..

# Run from project root
opencode-link list         # Finds plugins in .opencode/node_modules/
```

## Plugin Discovery

Plugins are discovered from two locations (priority: **last wins**):

| Priority | Location | Path |
|----------|----------|------|
| 1 (low) | User config | `~/.config/opencode/node_modules/` |
| 2 (high) | Local | `{project}/.opencode/node_modules/` |

**Important**: If a plugin exists in both locations, the **local** version wins.

Each location can contain:
- **Monorepo**: Package with subdirectories containing `.opencode/` (e.g., opencode-plugins)
- **Singlerepo**: Package with `plugin.json` + content dirs in root (e.g., opencode-plugin-time-tracking)

## Commands

| Command | Description |
|---------|-------------|
| `opencode-link` | Link all standard plugins |
| `opencode-link all` | Link ALL plugins (standard + optional) |
| `opencode-link <plugin>` | Link a specific plugin |
| `opencode-link list` | List available plugins |
| `opencode-link status` | Show current links |
| `opencode-link clean` | Remove all symlinks |
| `opencode-link schema` | Regenerate schema |

## Options

| Flag | Description |
|------|-------------|
| `--target-dir=<path>` | Override target directory |
| `--singular` | Use singular directory names (agent/ instead of agents/) |

## Programmatic Usage

You can also use the CLI modules programmatically:

```javascript
import { discoverPlugins, getContentTypes } from '@techdivision/opencode-cli/discovery';
import { createSymlink, getItemsToLink } from '@techdivision/opencode-cli/linker';
import { generateCombinedSchema } from '@techdivision/opencode-cli/schema';

// Discover plugins
const plugins = discoverPlugins('/path/to/.opencode');
console.log(`Found ${plugins.size} plugins`);

// Get all content types
const types = getContentTypes(plugins);
console.log(`Content types: ${types.join(', ')}`);
```

## License

MIT
