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

## Plugin Types

### Monorepo Plugins

A monorepo contains multiple plugins in subdirectories, each with a `.opencode/` folder.

**Example:** [opencode-plugins](https://github.com/techdivision/opencode-plugins)

```
opencode-plugins/
├── package.json
├── core/
│   └── .opencode/
│       ├── commands/
│       ├── agents/
│       └── skills/
├── pm/
│   └── .opencode/
│       ├── commands/
│       └── agents/
└── magento/
    └── .opencode/
        └── commands/
```

Install: `npm install github:techdivision/opencode-plugins`

### Singlerepo Plugins

A singlerepo is a standalone plugin with content directories in the package root.

**Example:** [opencode-plugin-magento](https://github.com/techdivision/opencode-plugin-magento)

```
opencode-plugin-magento/
├── package.json
├── plugin.json          # Plugin metadata (name, category, hooks)
├── commands/
│   ├── quality.md
│   └── deploy.md
├── agents/
│   └── magento-expert.md
└── skills/
    └── magento/
        └── ...
```

Install: `npm install github:techdivision/opencode-plugin-magento`

## How Linking Works

When you run `opencode-link <plugin>`, the CLI:

1. **Discovers** plugins from user config and local `node_modules/`
2. **Creates symlinks** from target directory to plugin source files
3. **Runs postlink hooks** if defined in `plugin.json`

### Example: Linking in a Project

```bash
cd /path/to/my-project
opencode-link magento
```

**Before:**
```
my-project/
└── .opencode/
    └── node_modules/
        └── @techdivision/opencode-plugin-magento/
            └── commands/
                ├── quality.md
                └── deploy.md
```

**After:**
```
my-project/
└── .opencode/
    ├── commands/
    │   ├── magento.quality.md -> ../node_modules/.../commands/quality.md
    │   └── magento.deploy.md  -> ../node_modules/.../commands/deploy.md
    └── node_modules/
        └── ...
```

### Example: Linking in User Config

```bash
cd ~/.config/opencode
opencode-link time-tracking
```

**Result:**
```
~/.config/opencode/
├── config.json              # OpenCode main config (not touched)
├── commands/
│   ├── time-tracking.init.md -> ./node_modules/.../commands/init.md
│   └── time-tracking.timesheet.md -> ...
├── agents/
│   └── time-tracking.md -> ./node_modules/.../agents/time-tracking.md
└── node_modules/
    └── @techdivision/opencode-plugin-time-tracking/
        └── ...
```

### Symlink Naming Convention

| Content Type | Source File | Target Symlink |
|--------------|-------------|----------------|
| commands | `commands/deploy.md` | `commands/{plugin}.deploy.md` |
| agents | `agents/expert.md` | `agents/expert.md` |
| guidelines | `guidelines/style.md` | `guidelines/style.md` |
| skills | `skills/group/skill-name/` | `skills/skill-name/` |
| tools | `tools/my-tool.ts` | `tools/my-tool.ts` |

**Note:** Commands are prefixed with the plugin name to avoid conflicts between plugins.

## External Skills

External skills are agent skills sourced directly from GitHub repositories, curated via [skills.sh](https://skills.sh). They are downloaded and symlinked automatically — no npm install required.

### Quick Start

```bash
# Search for skills
opencode-link external-skills:find react

# Add a skill to your project (updates opencode-project.json + installs immediately)
opencode-link external-skills:add vercel-labs/agent-skills vercel-react-best-practices

# Show installed external skills
opencode-link external-skills:list
```

### How It Works

1. Skills are configured in `.opencode/opencode-project.json` under `externalSkills`
2. `opencode-link` (default run) detects the config and downloads/links them automatically
3. Files land in `.opencode/.external-skills/<skill-name>/SKILL.md` (gitignored)
4. Symlinks are created in `.opencode/skills/<skill-name>/`

### Configuration (`opencode-project.json`)

```json
{
  "externalSkills": [
    {
      "source": "vercel-labs/agent-skills",
      "skills": ["vercel-react-best-practices", "vercel-nextjs-app-router"],
      "branch": "main",
      "category": "optional"
    },
    {
      "source": "some-org/all-their-skills"
    }
  ]
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `source` | yes | — | GitHub `owner/repo` |
| `skills` | no | all | Skill names to install. Omit to install all skills in the repo. |
| `branch` | no | `main` | Git branch to download from |
| `category` | no | `optional` | `standard` or `optional` |

### Security Checks

Before downloading, each skill is audited via three security partners (ATH, Socket, Snyk):

| Risk level | Behaviour |
|------------|-----------|
| `safe` / `low` | Installed automatically |
| `medium` | Installed with a warning |
| `high` | Interactive confirmation required (non-interactive: aborted) |
| `critical` | Always skipped |

Use `--force` to bypass high-risk prompts or to force reinstall an up-to-date skill.

> **Note:** Security data is fetched from `add-skill.vercel.sh`. If the service is unavailable, installation continues with a warning — it never blocks.

### Update Detection

Skills store a SHA fingerprint (`.skill-meta.json`) after download. Subsequent runs skip skills whose SHA hasn't changed. Use `external-skills:update` to explicitly pull the latest version.

```bash
# Re-download skills where the upstream SHA changed
opencode-link external-skills:update

# Force-reinstall all skills regardless of SHA
opencode-link --force external-skills:install
```

### GitHub Rate Limits

The GitHub API is used to fetch file SHAs. Set `GITHUB_TOKEN` to increase the rate limit:

```bash
export GITHUB_TOKEN=ghp_...
opencode-link external-skills:install
```

## Commands

| Command | Description |
|---------|-------------|
| `opencode-link` | Link all standard plugins + install configured external skills |
| `opencode-link all` | Link ALL plugins (standard + optional) |
| `opencode-link <plugin>` | Link a specific plugin |
| `opencode-link list` | List available plugins and configured external skills |
| `opencode-link status` | Show current links |
| `opencode-link clean` | Remove all symlinks and `.external-skills/` directory |
| `opencode-link schema` | Regenerate schema |
| `opencode-link external-skills:find <query>` | Search skills.sh for skills |
| `opencode-link external-skills:add <owner/repo> <skill>` | Add skill to config and install |
| `opencode-link external-skills:install` | Install/update all configured external skills |
| `opencode-link external-skills:update` | Re-download skills with upstream changes |
| `opencode-link external-skills:list` | Show installed external skills with security status |

## Options

| Flag | Description |
|------|-------------|
| `--target-dir=<path>` | Override target directory |
| `--singular` | Use singular directory names (agent/ instead of agents/) |
| `--force` | Force reinstall even if up to date; bypass high-risk security prompt |

## Programmatic Usage

You can also use the CLI modules programmatically:

```javascript
import { discoverPlugins, getContentTypes } from '@techdivision/opencode-cli/discovery';
import { createSymlink, getItemsToLink } from '@techdivision/opencode-cli/linker';
import { generateCombinedSchema } from '@techdivision/opencode-cli/schema';
import { searchSkills, fetchAuditData } from '@techdivision/opencode-cli/skills-registry';
import { installExternalSkills, listInstalledExternalSkills } from '@techdivision/opencode-cli/external-skills';

// Discover plugins
const plugins = discoverPlugins('/path/to/.opencode');
console.log(`Found ${plugins.size} plugins`);

// Search skills.sh
const results = await searchSkills('react');

// Install configured external skills
await installExternalSkills('/path/to/.opencode', { force: false });

// List installed external skills
const installed = listInstalledExternalSkills('/path/to/.opencode');
```

## License

MIT
