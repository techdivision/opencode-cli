/**
 * Skills Registry Module
 *
 * Handles all communication with skills.sh and the GitHub API.
 * No external dependencies — Node.js built-ins only (fetch, https).
 */

const SKILLS_API_BASE = 'https://skills.sh/api';
const AUDIT_API_BASE = 'https://add-skill.vercel.sh'; // This is an undocumented API endpoint. It may change.
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

/**
 * Returns headers for GitHub API requests.
 * Includes Authorization header if GITHUB_TOKEN env var is set.
 *
 * @returns {Record<string, string>}
 */
function getGitHubHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'opencode-link',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Performs a fetch with an optional timeout.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Searches skills.sh for matching skills.
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{name: string, slug: string, source: string, installs: number}>>}
 */
export async function searchSkills(query, limit = 10) {
  const url = `${SKILLS_API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  try {
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return [];
    const data = await res.json();
    const skills = data.skills || [];
    return skills.map((s) => ({
      name: s.name || s.id || '',
      slug: s.id || s.name || '',
      source: s.source || '',
      installs: s.installs || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetches security audit data from add-skill.vercel.sh.
 * Returns null on any error — never blocks installation.
 *
 * @param {string} ownerRepo  e.g. "vercel-labs/agent-skills"
 * @param {string[]} skillNames
 * @param {number} timeoutMs
 * @returns {Promise<AuditResponse|null>}
 */
export async function fetchAuditData(ownerRepo, skillNames, timeoutMs = 3000) {
  if (!skillNames || skillNames.length === 0) return null;
  const url = `${AUDIT_API_BASE}/audit?source=${encodeURIComponent(ownerRepo)}&skills=${skillNames.map(encodeURIComponent).join(',')}`;
  try {
    const res = await fetchWithTimeout(url, {}, timeoutMs);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Lists available skills in a GitHub repo via GitHub Contents API.
 * Checks for /skills/ subdirectory; falls back to root SKILL.md.
 *
 * @param {string} ownerRepo  e.g. "vercel-labs/agent-skills"
 * @param {string} branch     default "main"
 * @returns {Promise<string[]>}  skill directory names (or [''] for root SKILL.md)
 */
export async function listRepoSkills(ownerRepo, branch = 'main') {
  // Try /skills/ subdirectory first
  const skillsDirUrl = `${GITHUB_API_BASE}/repos/${ownerRepo}/contents/skills?ref=${encodeURIComponent(branch)}`;
  try {
    const res = await fetchWithTimeout(skillsDirUrl, {headers: getGitHubHeaders()}, 10000);
    if (res.ok) {
      const entries = await res.json();
      if (Array.isArray(entries)) {
        return entries
          .filter((e) => e.type === 'dir')
          .map((e) => e.name);
      }
    }
  } catch {
    // fall through
  }

  // Fallback: check if root has SKILL.md
  const rootSkillUrl = `${GITHUB_API_BASE}/repos/${ownerRepo}/contents/SKILL.md?ref=${encodeURIComponent(branch)}`;
  try {
    const res = await fetchWithTimeout(rootSkillUrl, {headers: getGitHubHeaders()}, 10000);
    if (res.ok) {
      return [''];  // Root-level SKILL.md — skillPath is repo root
    }
  } catch {
    // fall through
  }

  return [];
}

/**
 * Downloads a SKILL.md from GitHub and returns content + SHA.
 *
 * @param {string} ownerRepo
 * @param {string} skillPath  path within repo, e.g. "skills/vercel-react-best-practices"
 * @param {string} branch
 * @returns {Promise<{content: string, sha: string}|null>}
 */
export async function downloadSkillFile(ownerRepo, skillPath, branch = 'main') {
  // Build the raw URL for file content
  const filePath = skillPath ? `${skillPath}/SKILL.md` : 'SKILL.md';
  const rawUrl = `${GITHUB_RAW_BASE}/${ownerRepo}/${branch}/${filePath}`;

  // Fetch SHA via GitHub API
  const sha = await getSkillSha(ownerRepo, skillPath, branch);

  try {
    const res = await fetchWithTimeout(rawUrl, {}, 15000);
    if (!res.ok) return null;
    const content = await res.text();
    return {content, sha: sha || ''};
  } catch {
    return null;
  }
}

/**
 * Fetches the current SHA of a skill directory/file from GitHub API.
 * Used to detect if an installed skill needs updating.
 *
 * @param {string} ownerRepo
 * @param {string} skillPath  path within repo
 * @param {string} branch
 * @returns {Promise<string|null>}
 */
export async function getSkillSha(ownerRepo, skillPath, branch = 'main') {
  const filePath = skillPath ? `${skillPath}/SKILL.md` : 'SKILL.md';
  const url = `${GITHUB_API_BASE}/repos/${ownerRepo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
  try {
    const res = await fetchWithTimeout(url, {headers: getGitHubHeaders()}, 10000);
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha || null;
  } catch {
    return null;
  }
}

/**
 * Formats an installs count as a human-readable string (e.g. 194.8K).
 *
 * @param {number} installs
 * @returns {string}
 */
export function formatInstalls(installs) {
  if (installs >= 1_000_000) return `${(installs / 1_000_000).toFixed(1)}M`;
  if (installs >= 1_000) return `${(installs / 1_000).toFixed(1)}K`;
  return String(installs);
}

/**
 * Determines the highest risk level across all audit partners.
 *
 * @param {SkillAuditData|null|undefined} auditData
 * @returns {'safe'|'low'|'medium'|'high'|'critical'|null}
 */
export function getHighestRisk(auditData) {
  if (!auditData) return null;

  const RISK_ORDER = ['safe', 'low', 'medium', 'high', 'critical'];
  let highest = -1;

  for (const partner of ['ath', 'socket', 'snyk']) {
    const partnerData = auditData[partner];
    if (partnerData && partnerData.risk) {
      const idx = RISK_ORDER.indexOf(partnerData.risk);
      if (idx > highest) highest = idx;
    }
  }

  return highest >= 0 ? RISK_ORDER[highest] : null;
}

// ANSI colors for risk levels
const RESET = '\x1b[0m';
const RISK_COLORS = {
  safe: '\x1b[32m',  // green
  low: '\x1b[32m',  // green
  medium: '\x1b[33m',  // yellow
  high: '\x1b[31m',  // red
  critical: '\x1b[31m',  // red
};

/**
 * Formats audit data for display in the console.
 * Returns a short string like "Gen ✓ Safe · Socket ✓ 0 alerts · Snyk ✓ Low"
 * Risk levels are color-coded: green (safe/low), yellow (medium), red (high/critical).
 *
 * @param {SkillAuditData|null|undefined} auditData
 * @returns {string}
 */
export function formatAuditDisplay(auditData) {
  if (!auditData) return '\x1b[90m(security unavailable)\x1b[0m';

  const parts = [];

  if (auditData.ath) {
    const risk = auditData.ath.risk || 'unknown';
    parts.push(`${RESET}Gen ${RISK_COLORS[risk] || '\x1b[90m'}[${risk}]${RESET}`);
  }
  if (auditData.socket) {
    const risk = auditData.socket.risk || 'unknown';
    const alerts = auditData.socket.alerts != null
      ? `${RISK_COLORS[risk] || '\x1b[90m'}[${auditData.socket.alerts} alerts]${RESET}`
      : `${RISK_COLORS[risk] || '\x1b[90m'}${risk}${RESET}`;
    parts.push(`Socket ${alerts}`);
  }
  if (auditData.snyk) {
    const risk = auditData.snyk.risk || 'unknown';
    parts.push(`Snyk ${RISK_COLORS[risk] || '\x1b[90m'}[${risk}]${RESET}`);
  }

  return parts.length > 0 ? parts.join(' · ') : '\x1b[90m(no audit data)\x1b[0m';
}

/**
 * @typedef {{ risk: 'safe'|'low'|'medium'|'high'|'critical', alerts?: number, analyzedAt: string }} PartnerAudit
 * @typedef {{ ath?: PartnerAudit, socket?: PartnerAudit, snyk?: PartnerAudit }} SkillAuditData
 * @typedef {Record<string, SkillAuditData>} AuditResponse
 */
