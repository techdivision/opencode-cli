/**
 * External Skills Module
 *
 * Handles config reading, download, security checks, symlinking and update detection
 * for external skills configured in opencode-project.json.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {
  fetchAuditData,
  downloadSkillFile,
  getSkillSha,
  listRepoSkills,
  getHighestRisk,
  formatAuditDisplay,
} from './skills-registry.js';
import {createSymlink} from './linker.js';

const EXTERNAL_SKILLS_DIR_NAME = '.external-skills';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Reads the externalSkills array from opencode-project.json.
 * Returns [] if not configured or file doesn't exist.
 *
 * @param {string} targetDir  path to .opencode directory
 * @returns {ExternalSkillConfig[]}
 */
export function readExternalSkillsConfig(targetDir) {
  const configPath = path.join(targetDir, 'opencode-project.json');
  if (!fs.existsSync(configPath)) return [];

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const externalSkills = config.externalSkills;
    if (!Array.isArray(externalSkills)) return [];
    return externalSkills;
  } catch {
    return [];
  }
}

/**
 * Returns the path to the .external-skills directory.
 *
 * @param {string} targetDir
 * @returns {string}
 */
function getExternalSkillsDir(targetDir) {
  return path.join(targetDir, EXTERNAL_SKILLS_DIR_NAME);
}

/**
 * Ensures the .external-skills directory exists and is gitignored.
 *
 * @param {string} targetDir
 */
function ensureExternalSkillsDir(targetDir) {
  const dir = getExternalSkillsDir(targetDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }

  // Ensure .gitignore in targetDir covers .external-skills/
  const gitignorePath = path.join(targetDir, '.gitignore');
  const entry = `${EXTERNAL_SKILLS_DIR_NAME}/\n`;

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, entry);
  } else {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(EXTERNAL_SKILLS_DIR_NAME)) {
      fs.appendFileSync(gitignorePath, (content.endsWith('\n') ? '' : '\n') + entry);
    }
  }
}

/**
 * Reads .skill-meta.json for an installed external skill.
 *
 * @param {string} externalSkillsDir
 * @param {string} skillName
 * @returns {ExternalSkillMeta|null}
 */
export function readSkillMeta(externalSkillsDir, skillName) {
  const metaPath = path.join(externalSkillsDir, skillName, '.skill-meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Writes .skill-meta.json for an installed external skill.
 *
 * @param {string} externalSkillsDir
 * @param {string} skillName
 * @param {ExternalSkillMeta} meta
 */
function writeSkillMeta(externalSkillsDir, skillName, meta) {
  const skillDir = path.join(externalSkillsDir, skillName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, {recursive: true});
  }
  const metaPath = path.join(skillDir, '.skill-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
}

/**
 * Asks the user a yes/no question in an interactive TTY.
 * Returns the answer (true = yes, false = no).
 *
 * @param {string} question
 * @returns {Promise<boolean>}
 */
function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * Installs a single skill:
 * 1. Checks security (never blocks if unavailable)
 * 2. Downloads SKILL.md
 * 3. Writes .skill-meta.json
 *
 * Returns 'installed', 'skipped', 'aborted', or 'failed'.
 *
 * @param {string} externalSkillsDir
 * @param {string} ownerRepo
 * @param {string} skillName
 * @param {string} skillPath
 * @param {string} branch
 * @param {boolean} force
 * @param {AuditResponse|null} auditData  pre-fetched audit data for entire repo
 * @returns {Promise<'installed'|'skipped'|'aborted'|'failed'>}
 */
async function installSingleSkill(externalSkillsDir, ownerRepo, skillName, skillPath, branch, force, auditData) {
  const existingMeta = readSkillMeta(externalSkillsDir, skillName);

  // Check current SHA to detect if already up to date
  const latestSha = await getSkillSha(ownerRepo, skillPath, branch);

  if (!force && existingMeta && existingMeta.sha && latestSha && existingMeta.sha === latestSha) {
    console.log(`${colors.gray}  - ${skillName} (up to date, skipped)${colors.reset}`);
    return 'skipped';
  }

  // Security audit for this specific skill
  const skillAuditData = auditData ? auditData[skillName] : null;
  const risk = getHighestRisk(skillAuditData);

  if (skillAuditData) {
    const display = formatAuditDisplay(skillAuditData);
    console.log(`${colors.cyan}  ${skillName} Security Audit: ${display}${colors.reset}`);
  } else {
    console.log(`${colors.yellow}  ${skillName}  (security check unavailable)${colors.reset}`);
  }

  // Enforce security policy
  const skillUrl = `https://skills.sh/${ownerRepo}/${skillName}`;

  if (risk === 'critical' && !force) {
    console.log(`${colors.red}  ! ${skillName}: Risk level CRITICAL — skipping. Review: ${skillUrl} — Use --force to override.${colors.reset}`);
    return 'aborted';
  }

  if (risk === 'high' && !force) {
    const isInteractive = process.stdin.isTTY;
    if (!isInteractive) {
      console.log(`${colors.red}  ! ${skillName}: Risk level HIGH — aborted. Review: ${skillUrl} — Use --force to override.${colors.reset}`);
      return 'aborted';
    }
    const confirmed = await askConfirmation(`  ${colors.yellow}Risk level HIGH for "${skillName}". Review: ${skillUrl}\n  Install anyway? [y/N] ${colors.reset}`);
    if (!confirmed) {
      console.log(`${colors.yellow}  - ${skillName}: Skipped by user.${colors.reset}`);
      return 'aborted';
    }
  }

  if (risk === 'medium') {
    console.log(`${colors.yellow}  ⚠ ${skillName}: Risk level MEDIUM — review skill before using it: ${skillUrl}${colors.reset}`);
  }

  // Download SKILL.md
  const result = await downloadSkillFile(ownerRepo, skillPath, branch);
  if (!result) {
    console.log(`${colors.red}  ! ${skillName}: Failed to download SKILL.md${colors.reset}`);
    return 'failed';
  }

  const {content, sha} = result;

  // Write SKILL.md
  const skillDir = path.join(externalSkillsDir, skillName);
  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, {recursive: true});
  }
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);

  // Write metadata
  /** @type {ExternalSkillMeta} */
  const meta = {
    name: skillName,
    source: ownerRepo,
    skillPath,
    branch,
    sha,
    downloadedAt: new Date().toISOString(),
    security: skillAuditData || null,
  };
  writeSkillMeta(externalSkillsDir, skillName, meta);

  console.log(`${colors.green}  + Downloaded SKILL.md (sha: ${sha ? sha.substring(0, 7) : 'unknown'})${colors.reset}`);
  return 'installed';
}

/**
 * Downloads all configured external skills to .external-skills/.
 * Runs security check before each download.
 * Skips skills where SHA matches cached value.
 *
 * @param {string} targetDir
 * @param {{ force?: boolean }} options
 * @returns {Promise<{installed: string[], skipped: string[], failed: string[]}>}
 */
export async function installExternalSkills(targetDir, options = {}) {
  const force = options.force || false;
  const configs = readExternalSkillsConfig(targetDir);
  const externalSkillsDir = getExternalSkillsDir(targetDir);

  if (configs.length === 0) {
    return {installed: [], skipped: [], failed: []};
  }

  ensureExternalSkillsDir(targetDir);

  const installed = [];
  const skipped = [];
  const failed = [];

  console.log(`\n${colors.cyan}External skills (from opencode-project.json)...${colors.reset}`);

  for (const config of configs) {
    const {source: ownerRepo, branch = 'main', skills: requestedSkills} = config;

    // Determine which skills to install
    let skillsToInstall;
    if (requestedSkills && requestedSkills.length > 0) {
      skillsToInstall = requestedSkills.map((name) => ({
        name,
        path: `skills/${name}`,
      }));
    } else {
      // Discover all skills in the repo
      const discovered = await listRepoSkills(ownerRepo, branch);
      if (discovered.length === 0) {
        console.log(`${colors.yellow}  ⚠ No skills found in ${ownerRepo}${colors.reset}`);
        continue;
      }
      skillsToInstall = discovered.map((name) => ({
        name: name || path.basename(ownerRepo),
        path: name ? `skills/${name}` : '',
      }));
    }

    // Fetch audit data for entire repo at once (one API call)
    const skillNames = skillsToInstall.map((s) => s.name);
    const auditData = await fetchAuditData(ownerRepo, skillNames);

    for (const skill of skillsToInstall) {
      const result = await installSingleSkill(
        externalSkillsDir,
        ownerRepo,
        skill.name,
        skill.path,
        branch,
        force,
        auditData,
      );

      if (result === 'installed') installed.push(skill.name);
      else if (result === 'skipped') skipped.push(skill.name);
      else failed.push(skill.name);
    }
  }

  return {installed, skipped, failed};
}

/**
 * Creates symlinks in .opencode/skills/ pointing to .external-skills/<name>/.
 * Reuses createSymlink() from linker.js (last-wins strategy).
 *
 * @param {string} targetDir
 */
export function linkExternalSkills(targetDir) {
  const externalSkillsDir = getExternalSkillsDir(targetDir);
  if (!fs.existsSync(externalSkillsDir)) return;

  // Ensure skills/ directory exists in targetDir
  const skillsDir = path.join(targetDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, {recursive: true});
  }

  const skillDirs = fs.readdirSync(externalSkillsDir).filter((name) => {
    const fullPath = path.join(externalSkillsDir, name);
    return fs.statSync(fullPath).isDirectory() && !name.startsWith('.');
  });

  for (const skillName of skillDirs) {
    const sourcePath = path.join(externalSkillsDir, skillName);
    const targetPath = path.join(skillsDir, skillName);
    const result = createSymlink(sourcePath, targetPath);

    if (result === 'created' || result === 'overridden') {
      console.log(`${colors.green}  + Linked → skills/${skillName}${colors.reset}`);
    }
    // skipped-same: already correct, no output needed
    // skipped-real: real directory exists, warn
    if (result === 'skipped-real') {
      console.log(`${colors.yellow}  ~ skills/${skillName} (real directory exists, not overriding)${colors.reset}`);
    }
    if (result === 'error') {
      console.log(`${colors.red}  ! Failed to link skills/${skillName}${colors.reset}`);
    }
  }
}

/**
 * Checks GitHub SHAs for all installed external skills.
 * Returns list of skills that have updates available.
 *
 * @param {string} targetDir
 * @returns {Promise<Array<{name: string, currentSha: string, latestSha: string}>>}
 */
export async function checkExternalSkillUpdates(targetDir) {
  const externalSkillsDir = getExternalSkillsDir(targetDir);
  if (!fs.existsSync(externalSkillsDir)) return [];

  const updates = [];
  const installed = listInstalledExternalSkills(targetDir);

  for (const meta of installed) {
    const latestSha = await getSkillSha(meta.source, meta.skillPath, meta.branch);
    if (latestSha && meta.sha && latestSha !== meta.sha) {
      updates.push({
        name: meta.name,
        currentSha: meta.sha,
        latestSha,
      });
    }
  }

  return updates;
}

/**
 * Re-downloads all external skills where updates are available.
 *
 * @param {string} targetDir
 */
export async function updateExternalSkills(targetDir) {
  const externalSkillsDir = getExternalSkillsDir(targetDir);

  console.log(`\n${colors.cyan}Checking for external skill updates...${colors.reset}`);
  const updates = await checkExternalSkillUpdates(targetDir);

  if (updates.length === 0) {
    console.log(`${colors.gray}  All external skills are up to date.${colors.reset}`);
    return;
  }

  console.log(`${colors.yellow}  ${updates.length} update(s) available.${colors.reset}`);

  // Force-reinstall outdated skills
  const installed = listInstalledExternalSkills(targetDir);
  const updateNames = new Set(updates.map((u) => u.name));

  for (const meta of installed) {
    if (!updateNames.has(meta.name)) continue;

    const auditData = await fetchAuditData(meta.source, [meta.name]);

    const result = await installSingleSkill(
      externalSkillsDir,
      meta.source,
      meta.name,
      meta.skillPath,
      meta.branch,
      true,  // force=true for updates
      auditData,
    );

    if (result === 'installed') {
      console.log(`${colors.green}  + Updated ${meta.name}${colors.reset}`);
    } else {
      console.log(`${colors.red}  ! Failed to update ${meta.name}${colors.reset}`);
    }
  }
}

/**
 * Lists all installed external skills with their meta info.
 *
 * @param {string} targetDir
 * @returns {ExternalSkillMeta[]}
 */
export function listInstalledExternalSkills(targetDir) {
  const externalSkillsDir = getExternalSkillsDir(targetDir);
  if (!fs.existsSync(externalSkillsDir)) return [];

  const skillsDir = path.join(targetDir, 'skills');

  const result = [];
  const entries = fs.readdirSync(externalSkillsDir).filter((name) => {
    const fullPath = path.join(externalSkillsDir, name);
    return fs.statSync(fullPath).isDirectory() && !name.startsWith('.');
  });

  for (const name of entries) {
    // Only count as installed if the symlink in skills/ exists
    const symlinkPath = path.join(skillsDir, name);
    try {
      if (!fs.lstatSync(symlinkPath).isSymbolicLink()) continue;
    } catch {
      continue;
    }

    const meta = readSkillMeta(externalSkillsDir, name);
    if (meta) result.push(meta);
  }

  return result;
}

/**
 * Adds a skill to opencode-project.json and installs it immediately.
 *
 * - Creates opencode-project.json if it does not exist.
 * - If the source repo is already configured, adds the skill name to the existing entry.
 * - Errors if the skill name is already listed under that source.
 *
 * @param {string} targetDir
 * @param {string} ownerRepo   e.g. "vercel-labs/agent-skills"
 * @param {string} skillName   e.g. "vercel-react-best-practices"
 * @param {{ branch?: string, category?: string, force?: boolean }} options
 * @returns {Promise<void>}
 */
export async function addExternalSkill(targetDir, ownerRepo, skillName, options = {}) {
  const {branch = 'main', category = 'optional', force = false} = options;
  const configPath = path.join(targetDir, 'opencode-project.json');

  // Read existing config (or start fresh)
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      console.log(`${colors.red}  ! opencode-project.json is not valid JSON — cannot update.${colors.reset}`);
      process.exit(1);
    }
  }

  if (!Array.isArray(config.externalSkills)) {
    config.externalSkills = [];
  }

  // Find existing entry for this source
  const existing = config.externalSkills.find((e) => e.source === ownerRepo);

  // Check if skill is already configured (explicitly or via "install all")
  const alreadyConfigured = existing && (
    !Array.isArray(existing.skills) ||
    existing.skills.includes(skillName)
  );

  if (alreadyConfigured) {
    const isInteractive = process.stdin.isTTY;
    if (!isInteractive) {
      console.log(`${colors.yellow}  - "${skillName}" is already configured — skipping (non-interactive mode).${colors.reset}`);
      return;
    }
    const confirmed = await askConfirmation(`  ${colors.yellow}"${skillName}" is already configured. Update to latest version? [y/N] ${colors.reset}`);
    if (!confirmed) {
      console.log(`${colors.gray}  - Skipped.${colors.reset}`);
      return;
    }
    // Re-install with force
    const externalSkillsDir = getExternalSkillsDir(targetDir);
    ensureExternalSkillsDir(targetDir);
    const auditData = await fetchAuditData(ownerRepo, [skillName]);
    const existingBranch = existing.branch || branch;
    const result = await installSingleSkill(
      externalSkillsDir,
      ownerRepo,
      skillName,
      `skills/${skillName}`,
      existingBranch,
      true,
      auditData,
    );
    if (result === 'installed') linkExternalSkills(targetDir);
    return;
  }

  if (existing) {
    existing.skills.push(skillName);
  } else {
    config.externalSkills.push({
      source: ownerRepo,
      skills: [skillName],
      branch,
      category,
    });
  }

  // Write updated config
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, {recursive: true});
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`${colors.green}  + Added "${skillName}" from "${ownerRepo}" to opencode-project.json${colors.reset}`);

  // Install immediately
  const externalSkillsDir = getExternalSkillsDir(targetDir);
  ensureExternalSkillsDir(targetDir);

  const skillPath = `skills/${skillName}`;
  const auditData = await fetchAuditData(ownerRepo, [skillName]);

  const result = await installSingleSkill(
    externalSkillsDir,
    ownerRepo,
    skillName,
    skillPath,
    branch,
    force,
    auditData,
  );

  if (result === 'installed') {
    linkExternalSkills(targetDir);
  } else if (result === 'aborted' || result === 'failed') {
    // Roll back config change on abort or failure
    if (existing) {
      existing.skills = existing.skills.filter((s) => s !== skillName);
      if (existing.skills.length === 0) {
        config.externalSkills = config.externalSkills.filter((e) => e.source !== ownerRepo);
      }
    } else {
      config.externalSkills = config.externalSkills.filter((e) => e.source !== ownerRepo);
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log(`${colors.yellow}  ~ Reverted opencode-project.json (${result}).${colors.reset}`);
    process.exit(1);
  }
}

/**
 * @typedef {{
 *   source: string,
 *   skills?: string[],
 *   category?: string,
 *   branch?: string
 * }} ExternalSkillConfig
 *
 * @typedef {{
 *   name: string,
 *   source: string,
 *   skillPath: string,
 *   branch: string,
 *   sha: string,
 *   downloadedAt: string,
 *   security: import('./skills-registry.js').AuditResponse|null
 * }} ExternalSkillMeta
 */
