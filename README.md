# @techdivision/opencode-cli

CLI tools for OpenCode plugin management.

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9

## Installation

### Global (Recommended)

Install once, use everywhere:

```bash
npm install -g github:techdivision/opencode-cli
```

Then use from any project:

```bash
cd /path/to/my-project
npx opencode-link              # Link standard plugins
npx opencode-link list         # List available plugins
npx opencode-link status       # Show current links
```

### As Dependency

Used automatically when you install `@techdivision/opencode-plugins`:

```bash
cd /path/to/my-project/.opencode
npm install github:techdivision/opencode-plugins
npx opencode-link
```

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

## Plugin Discovery

Plugins are discovered from two locations (priority: last wins):

1. **Global**: `npm config get prefix`/lib/node_modules/
2. **Local**: `{project}/.opencode/node_modules/`

Each location can contain:
- **Monorepo**: Package with subdirectories containing `.opencode/` (e.g., opencode-plugins)
- **Singlerepo**: Package with `plugin.json` + content dirs in root (e.g., opencode-plugin-time-tracking)

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
