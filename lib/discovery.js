/**
 * Plugin Discovery Module
 * 
 * Discovers OpenCode plugins from two locations (priority: last wins):
 * 1. User config: ~/.config/opencode/node_modules/
 * 2. Local: {targetDir}/node_modules/
 * 
 * Each location can contain two types of packages:
 * - Monorepo: Package with subdirectories containing .opencode/ (e.g., opencode-plugins)
 * - Singlerepo: Package with plugin.json + content dirs in root (e.g., opencode-plugin-time-tracking)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Gets the user config directory for OpenCode plugins.
 * This is where user-level plugins are installed.
 * 
 * @returns {string} Path to ~/.config/opencode/node_modules
 */
function getUserConfigDir() {
  return path.join(os.homedir(), '.config', 'opencode', 'node_modules');
}

/**
 * Discovers all available plugins from all locations.
 * 
 * Priority (last wins):
 * 1. User config: ~/.config/opencode/node_modules/
 * 2. Local: {targetDir}/node_modules/
 * 
 * If targetDir is the user config directory (~/.config/opencode), only local
 * is scanned to avoid duplicate scanning of the same directory.
 * 
 * @param {string} targetDir - The .opencode directory (e.g., /project/.opencode)
 * @returns {Map<string, PluginDescriptor>} Map of plugin name to descriptor
 */
export function discoverPlugins(targetDir) {
  const userConfigDir = getUserConfigDir();
  const localNodeModules = path.join(targetDir, 'node_modules');
  
  // Scan all locations (order matters: last wins)
  const allPlugins = new Map();
  
  // Check if local === user-config (when running from ~/.config/opencode)
  const isUserConfigTarget = path.resolve(localNodeModules) === path.resolve(userConfigDir);
  
  // 1. User config (lower priority) - skip if same as local
  if (!isUserConfigTarget) {
    const userPlugins = scanLocation(userConfigDir, 'user');
    for (const [name, descriptor] of userPlugins.entries()) {
      allPlugins.set(name, descriptor);
    }
  }
  
  // 2. Local (highest priority) - labeled as 'user' if it's the user-config dir
  const localLabel = isUserConfigTarget ? 'user' : 'local';
  const localPlugins = scanLocation(localNodeModules, localLabel);
  for (const [name, descriptor] of localPlugins.entries()) {
    if (allPlugins.has(name)) {
      console.log(`  ⚠️  Plugin "${name}" found in local, overrides user`);
    }
    allPlugins.set(name, descriptor);
  }
  
  return allPlugins;
}

/**
 * Scans a node_modules directory for OpenCode plugins.
 * Detects both monorepos and singlerepos.
 *
 * @param {string} nodeModulesDir - Path to node_modules directory
 * @param {string} location - Location identifier ('global' or 'local')
 * @returns {Map<string, PluginDescriptor>}
 */
function scanLocation(nodeModulesDir, location) {
  const plugins = new Map();

  if (!fs.existsSync(nodeModulesDir)) {
    return plugins;
  }
  
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir);
  } catch {
    return plugins;
  }
  
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    
    if (entry.startsWith('@')) {
      // Scoped package - scan subdirectories
      const scopedDir = path.join(nodeModulesDir, entry);
      try {
        const packages = fs.readdirSync(scopedDir);
        for (const pkg of packages) {
          const pkgPath = path.join(scopedDir, pkg);
          scanPackage(pkgPath, location, plugins);
        }
      } catch {
        // Ignore read errors
      }
    } else {
      // Unscoped package
      const pkgPath = path.join(nodeModulesDir, entry);
      scanPackage(pkgPath, location, plugins);
    }
  }
  
  return plugins;
}

/**
 * Scans a single package and adds discovered plugins to the map.
 * Handles both monorepos and singlerepos.
 * 
 * @param {string} pkgPath - Path to the package
 * @param {string} location - Location identifier
 * @param {Map<string, PluginDescriptor>} plugins - Map to add plugins to
 */
function scanPackage(pkgPath, location, plugins) {
  if (!fs.statSync(pkgPath).isDirectory()) return;
  
  // Check if it's a monorepo (has subdirectories with .opencode/)
  if (isMonorepo(pkgPath)) {
    const monorepoPlugins = scanMonorepoSubdirs(pkgPath, location);
    for (const [name, descriptor] of monorepoPlugins.entries()) {
      plugins.set(name, descriptor);
    }
    return;
  }
  
  // Check if it's a singlerepo plugin
  const singlePlugin = loadSinglerepoPlugin(pkgPath, location);
  if (singlePlugin) {
    plugins.set(singlePlugin.pluginName, singlePlugin);
  }
}

/**
 * Checks if a package is a monorepo (has subdirectories with .opencode/).
 * 
 * @param {string} pkgPath - Path to the package
 * @returns {boolean}
 */
function isMonorepo(pkgPath) {
  const ignoreDirs = ['node_modules', '.git', 'scripts', 'docs', 'schemas', 'lib'];
  
  let entries;
  try {
    entries = fs.readdirSync(pkgPath, { withFileTypes: true });
  } catch {
    return false;
  }
  
  for (const entry of entries) {
    if (!entry.isDirectory() || ignoreDirs.includes(entry.name)) continue;
    
    const opencodeDir = path.join(pkgPath, entry.name, '.opencode');
    if (fs.existsSync(opencodeDir)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Scans subdirectories of a monorepo for plugins.
 * 
 * @param {string} monorepoPath - Path to the monorepo
 * @param {string} location - Location identifier
 * @returns {Map<string, PluginDescriptor>}
 */
function scanMonorepoSubdirs(monorepoPath, location) {
  const plugins = new Map();
  const ignoreDirs = ['node_modules', '.git', 'scripts', 'docs', 'schemas', 'lib'];
  
  let entries;
  try {
    entries = fs.readdirSync(monorepoPath, { withFileTypes: true });
  } catch {
    return plugins;
  }
  
  for (const entry of entries) {
    if (!entry.isDirectory() || ignoreDirs.includes(entry.name)) continue;
    
    const pluginDir = path.join(monorepoPath, entry.name);
    const opencodeDir = path.join(pluginDir, '.opencode');
    
    if (!fs.existsSync(opencodeDir)) continue;
    
    // Detect content types from .opencode/ subdirectories
    let types;
    try {
      types = fs.readdirSync(opencodeDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      continue;
    }
    
    if (types.length === 0) continue;
    
    // Load plugin metadata
    const pluginJson = loadPluginJson(pluginDir);
    
    plugins.set(entry.name, {
      packageName: getMonorepoPackageName(monorepoPath, entry.name),
      pluginName: entry.name,
      version: getMonorepoVersion(monorepoPath),
      category: pluginJson?.category || 'optional',
      description: pluginJson?.description || `Plugin: ${entry.name}`,
      rootDir: pluginDir,
      contentTypes: types,
      configSchema: pluginJson?.configSchema || null,
      hooks: pluginJson?.hooks || null,
      hasAgentsMd: fs.existsSync(path.join(pluginDir, 'AGENTS.md')),
      location: location,
      type: 'monorepo',
    });
  }
  
  return plugins;
}

/**
 * Gets the package name for a monorepo plugin.
 * 
 * @param {string} monorepoPath - Path to the monorepo
 * @param {string} pluginName - Name of the plugin subdirectory
 * @returns {string}
 */
function getMonorepoPackageName(monorepoPath, pluginName) {
  const packageJsonPath = path.join(monorepoPath, 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return `${packageJson.name}/${pluginName}`;
  } catch {
    return `monorepo:${pluginName}`;
  }
}

/**
 * Gets the version from a monorepo's package.json.
 * 
 * @param {string} monorepoPath - Path to the monorepo
 * @returns {string}
 */
function getMonorepoVersion(monorepoPath) {
  const packageJsonPath = path.join(monorepoPath, 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Loads a singlerepo plugin from a package directory.
 * 
 * @param {string} pluginPath - Path to the plugin package
 * @param {string} location - Location identifier
 * @returns {PluginDescriptor|null}
 */
function loadSinglerepoPlugin(pluginPath, location) {
  const packageJsonPath = path.join(pluginPath, 'package.json');
  const pluginJsonPath = path.join(pluginPath, 'plugin.json');
  
  // Must have package.json
  if (!fs.existsSync(packageJsonPath)) return null;
  
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  } catch {
    return null;
  }
  
  // Criterion 1: opencode.plugin: true in package.json
  if (packageJson.opencode?.plugin === true) {
    return createSinglerepoDescriptor(pluginPath, packageJson, location);
  }
  
  // Criterion 2: Has plugin.json and content directories
  if (fs.existsSync(pluginJsonPath) && hasContentDirectories(pluginPath)) {
    return createSinglerepoDescriptor(pluginPath, packageJson, location);
  }
  
  return null;
}

/**
 * Creates a plugin descriptor for a singlerepo plugin.
 * 
 * @param {string} pluginPath - Path to the plugin package
 * @param {Object} packageJson - Parsed package.json
 * @param {string} location - Location identifier
 * @returns {PluginDescriptor}
 */
function createSinglerepoDescriptor(pluginPath, packageJson, location) {
  const pluginJson = loadPluginJson(pluginPath);
  
  return {
    packageName: packageJson.name,
    pluginName: pluginJson?.name || extractPluginNameFromPackage(packageJson.name),
    version: packageJson.version,
    category: pluginJson?.category || packageJson.opencode?.category || 'optional',
    description: pluginJson?.description || packageJson.description,
    rootDir: pluginPath,
    contentTypes: detectContentTypes(pluginPath),
    configSchema: pluginJson?.configSchema || null,
    hooks: pluginJson?.hooks || null,
    hasAgentsMd: fs.existsSync(path.join(pluginPath, 'AGENTS.md')),
    location: location,
    type: 'singlerepo',
  };
}

/**
 * Loads plugin.json if it exists.
 * 
 * @param {string} pluginPath - Path to plugin directory
 * @returns {Object|null}
 */
function loadPluginJson(pluginPath) {
  const pluginJsonPath = path.join(pluginPath, 'plugin.json');
  if (!fs.existsSync(pluginJsonPath)) return null;
  
  try {
    return JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Checks if a plugin has content directories.
 * 
 * @param {string} pluginPath - Path to plugin directory
 * @returns {boolean}
 */
function hasContentDirectories(pluginPath) {
  const contentTypes = ['agents', 'commands', 'guidelines', 'skills', 'assets', 'tools', 'plugins'];
  return contentTypes.some(type => 
    fs.existsSync(path.join(pluginPath, type))
  );
}

/**
 * Detects available content types in a plugin.
 * For singlerepo plugins, content is in package root.
 * 
 * @param {string} pluginPath - Path to plugin directory
 * @returns {string[]}
 */
function detectContentTypes(pluginPath) {
  const contentTypes = ['agents', 'commands', 'guidelines', 'skills', 'assets', 'tools', 'plugins'];
  
  return contentTypes.filter(type => {
    const dir = path.join(pluginPath, type);
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Extracts plugin name from package name.
 * Examples:
 *   @techdivision/opencode-plugin-pm -> pm
 *   opencode-plugin-magento -> magento
 * 
 * @param {string} packageName - NPM package name
 * @returns {string}
 */
function extractPluginNameFromPackage(packageName) {
  // Remove scope if present
  const name = packageName.startsWith('@') 
    ? packageName.split('/')[1] 
    : packageName;
  
  // Remove opencode-plugin- prefix if present
  return name.replace(/^opencode-plugin-/, '');
}

/**
 * Gets all unique content types from discovered plugins.
 * 
 * @param {Map<string, PluginDescriptor>} plugins - Discovered plugins
 * @returns {string[]}
 */
export function getContentTypes(plugins) {
  const types = new Set();
  for (const plugin of plugins.values()) {
    for (const type of plugin.contentTypes) {
      types.add(type);
    }
  }
  return Array.from(types).sort();
}

/**
 * @typedef {Object} PluginDescriptor
 * @property {string} packageName - NPM package name or "monorepo-name/plugin-name"
 * @property {string} pluginName - Short plugin name (for commands, e.g., "pm")
 * @property {string} version - Plugin version
 * @property {string} category - "core", "standard", or "optional"
 * @property {string} description - Plugin description
 * @property {string} rootDir - Absolute path to plugin root
 * @property {string[]} contentTypes - Available content types (agents, commands, etc.)
 * @property {string|null} configSchema - Path to config schema file (relative to rootDir)
 * @property {Object|null} hooks - Hook declarations from plugin.json (e.g., { postlink: "scripts/postlink.js" })
 * @property {boolean} hasAgentsMd - Whether plugin has AGENTS.md
 * @property {string} location - Installation location: 'global' or 'local'
 * @property {string} type - Package type: 'monorepo' or 'singlerepo'
 */
