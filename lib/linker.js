/**
 * Plugin Linker Module
 * 
 * Links plugin content to the target directory via symlinks.
 * Supports both unified plugins (node_modules) and legacy plugins (monorepo).
 */

import fs from 'fs';
import path from 'path';

/**
 * Module-level flag for singular directory mode.
 * When true, target directories use singular names (agent/, skill/).
 * When false (default), target directories use plural names (agents/, skills/).
 */
let useSingularDirs = false;

/**
 * Sets whether to use singular directory names for target directories.
 * Call with true when --singular flag is passed.
 *
 * @param {boolean} singular - Whether to use singular directory names
 */
export function setUseSingularDirs(singular) {
  useSingularDirs = singular;
}

/**
 * Mapping of content type names to their normalized forms.
 * Used for directory name normalization.
 */
const CONTENT_TYPE_MAPPING = {
  'agents': 'agent',
  'commands': 'command',
  'guidelines': 'guideline',
  'skills': 'skill',
  'assets': 'asset',
  'tools': 'tool',
  'plugins': 'plugin',
};

/**
 * Maps a content type name to its normalized form.
 * 
 * @param {string} type - Content type name
 * @returns {string} Normalized form of the type (or original if no mapping exists)
 */
export function mapContentType(type) {
  return CONTENT_TYPE_MAPPING[type] || type;
}

/**
 * Maps plural content type names to singular target directory names.
 * Only applies the mapping when singular mode is enabled (--singular flag).
 * By default, returns the type unchanged (plural names).
 *
 * @param {string} type - Content type name (may be plural or singular)
 * @returns {string} Target directory name (singular if --singular, otherwise unchanged)
 */
export function normalizeContentType(type) {
  if (!useSingularDirs) {
    return type;
  }

  return mapContentType(type);
}

/**
 * Gets source directory for a plugin based on type.
 * 
 * For unified plugins: content is in package root (agent/, command/, etc.)
 * For legacy plugins: content is in .opencode/ subdirectory
 * 
 * @param {PluginDescriptor} descriptor - Plugin descriptor
 * @param {string} type - Content type (agent, command, skill, etc.)
 * @returns {string|null} Source directory path or null if not exists
 */
export function getSourceDir(descriptor, type) {
  if (!descriptor.contentTypes.includes(type)) {
    return null;
  }
  
  if (descriptor.isUnified) {
    // Unified plugin: content in package root
    return path.join(descriptor.rootDir, type);
  } else {
    // Legacy plugin: content in .opencode/ subdirectory
    return path.join(descriptor.rootDir, '.opencode', type);
  }
}

/**
 * Determines which items to link based on type structure.
 * 
 * - skills: Traverse group directories (e.g., 'mcp/'), link individual skill dirs flat
 * - assets: Link subdirectories directly
 * - commands: Link .md files with plugin prefix (e.g., 'core.command-name.md')
 * - agents/guidelines: Link .md files without prefix
 * 
 * @param {string} sourceDir - Source directory
 * @param {string} type - Content type (may be plural)
 * @param {string} targetDir - Target directory
 * @param {string} pluginName - Plugin name for prefixing
 * @returns {Array<LinkItem>} Items to link
 */
export function getItemsToLink(sourceDir, type, targetDir, pluginName) {
  const items = [];
  
  if (!fs.existsSync(sourceDir)) {
    return items;
  }

  // Normalize type for display (plural -> singular)
  const displayType = normalizeContentType(type);

  if (type === 'skills') {
    // Skills: Traverse group directories (e.g., 'mcp/'), link individual skills flat
    const groups = fs.readdirSync(sourceDir).filter((f) => {
      const fullPath = path.join(sourceDir, f);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const group of groups) {
      const groupPath = path.join(sourceDir, group);
      const skills = fs.readdirSync(groupPath).filter((f) => {
        const fullPath = path.join(groupPath, f);
        return fs.statSync(fullPath).isDirectory();
      });

      for (const skill of skills) {
        items.push({
          sourcePath: path.join(groupPath, skill),
          targetPath: path.join(targetDir, skill), // Flat in target!
          displayName: `${displayType}/${skill}/ (from ${group}/)`,
          isDirectory: true,
        });
      }
    }
  } else if (type === 'assets') {
    // Assets: Link subdirectories directly
    const subdirs = fs.readdirSync(sourceDir).filter((f) => {
      const fullPath = path.join(sourceDir, f);
      return fs.statSync(fullPath).isDirectory();
    });

    for (const subdir of subdirs) {
      items.push({
        sourcePath: path.join(sourceDir, subdir),
        targetPath: path.join(targetDir, subdir),
        displayName: `${displayType}/${subdir}/`,
        isDirectory: true,
      });
    }
  } else if (type === 'tools') {
    // Tools: Link .ts/.js files without prefix (symlink since opencode#12241)
    const files = fs.readdirSync(sourceDir).filter((f) => 
      f.endsWith('.ts') || f.endsWith('.js')
    );

    for (const file of files) {
      items.push({
        sourcePath: path.join(sourceDir, file),
        targetPath: path.join(targetDir, file),
        displayName: `${displayType}/${file}`,
        isDirectory: false,
      });
    }
  } else if (type === 'plugins') {
    // Plugins: Link .ts/.js files without prefix (OpenCode lifecycle plugins)
    const files = fs.readdirSync(sourceDir).filter((f) => 
      f.endsWith('.ts') || f.endsWith('.js')
    );

    for (const file of files) {
      items.push({
        sourcePath: path.join(sourceDir, file),
        targetPath: path.join(targetDir, file),
        displayName: `${displayType}/${file}`,
        isDirectory: false,
      });
    }
  } else {
    // Standard types (agents, commands, guidelines): Link .md files
    const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      // Commands get plugin prefix (e.g., 'core.command-name.md' -> '/core.command-name')
      const targetFile = type === 'commands' ? `${pluginName}.${file}` : file;
      items.push({
        sourcePath: path.join(sourceDir, file),
        targetPath: path.join(targetDir, targetFile),
        displayName: `${displayType}/${targetFile}`,
        isDirectory: false,
      });
    }
  }

  return items;
}

/**
 * Creates a symlink with LAST WINS strategy.
 * 
 * @param {string} sourcePath - Source file/directory
 * @param {string} targetPath - Target symlink location
 * @returns {'created'|'overridden'|'skipped-same'|'skipped-real'|'error'}
 */
export function createSymlink(sourcePath, targetPath) {
  // Check if target already exists
  let targetExists = false;
  let targetIsSymlink = false;

  try {
    const stat = fs.lstatSync(targetPath);
    targetExists = true;
    targetIsSymlink = stat.isSymbolicLink();
  } catch {
    targetExists = false;
  }

  if (targetExists) {
    if (targetIsSymlink) {
      const existingTarget = fs.readlinkSync(targetPath);
      if (existingTarget === sourcePath) {
        return 'skipped-same';
      }
      // Different source - LAST WINS: remove and re-link
      fs.unlinkSync(targetPath);
      try {
        fs.symlinkSync(sourcePath, targetPath);
        return 'overridden';
      } catch {
        return 'error';
      }
    } else {
      // Real file/directory - do NOT override
      return 'skipped-real';
    }
  }

  // Create new symlink
  try {
    fs.symlinkSync(sourcePath, targetPath);
    return 'created';
  } catch {
    return 'error';
  }
}

/**
 * Marker used to identify auto-generated AGENTS.md files.
 */
export const AGENTS_MD_MARKER = '<!-- AUTO-GENERATED BY OPENCODE-LINK - DO NOT EDIT -->';

/**
 * Checks if an AGENTS.md file was auto-generated by this tool.
 * 
 * @param {string} filePath - Path to AGENTS.md
 * @returns {boolean}
 */
export function isAutoGeneratedAgentsMd(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.includes(AGENTS_MD_MARKER);
  } catch {
    return false;
  }
}

/**
 * Generates a combined AGENTS.md from all linked plugins that have one.
 * 
 * @param {Map<string, PluginDescriptor>} linkedPlugins - Linked plugin descriptors
 * @param {string} targetDir - Target directory (.opencode)
 * @returns {'created'|'overridden'|'skipped'|'removed'}
 */
export function generateCombinedAgentsMd(linkedPlugins, targetDir) {
  const projectRoot = path.dirname(targetDir);
  const targetPath = path.join(projectRoot, 'AGENTS.md');
  
  // Collect AGENTS.md content from each linked plugin
  const sections = [];
  for (const [pluginName, descriptor] of linkedPlugins.entries()) {
    if (descriptor.hasAgentsMd) {
      const agentsMdPath = path.join(descriptor.rootDir, 'AGENTS.md');
      try {
        const content = fs.readFileSync(agentsMdPath, 'utf-8');
        sections.push({ plugin: pluginName, content: content.trim() });
      } catch {
        // Ignore read errors
      }
    }
  }
  
  // Check if target exists and what type it is
  let targetExists = false;
  let targetIsAutoGenerated = false;
  try {
    fs.accessSync(targetPath);
    targetExists = true;
    targetIsAutoGenerated = isAutoGeneratedAgentsMd(targetPath);
  } catch {
    targetExists = false;
  }
  
  // If no plugins have AGENTS.md, remove auto-generated one (if exists)
  if (sections.length === 0) {
    if (targetExists && targetIsAutoGenerated) {
      fs.unlinkSync(targetPath);
      return 'removed';
    }
    return 'skipped';
  }
  
  // Don't overwrite user-created AGENTS.md
  if (targetExists && !targetIsAutoGenerated) {
    return 'skipped';
  }
  
  // Generate combined content
  const pluginNames = sections.map((s) => s.plugin).join(', ');
  const timestamp = new Date().toISOString();
  
  let combined = `${AGENTS_MD_MARKER}
<!--
  Generated: ${timestamp}
  Plugins: ${pluginNames}
  
  This file is auto-generated from plugin AGENTS.md files.
  It will be regenerated when you run 'npx opencode-link <plugin>'.
  To use your own AGENTS.md, delete this file and create a new one without the marker above.
-->

`;
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (i > 0) {
      combined += '\n---\n\n';
    }
    combined += `<!-- ============================================================ -->\n`;
    combined += `<!-- PLUGIN: ${section.plugin} -->\n`;
    combined += `<!-- ============================================================ -->\n\n`;
    combined += section.content + '\n';
  }
  
  // Write the combined file
  fs.writeFileSync(targetPath, combined);
  
  return targetExists ? 'overridden' : 'created';
}

/**
 * @typedef {Object} LinkItem
 * @property {string} sourcePath - Source file/directory path
 * @property {string} targetPath - Target symlink path
 * @property {string} displayName - Display name for logging
 * @property {boolean} isDirectory - Whether item is a directory
 */
