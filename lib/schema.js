/**
 * Schema Generation Module
 * 
 * Generates combined JSON schema for opencode-project.json from all linked plugins.
 */

import fs from 'fs';
import path from 'path';

/**
 * Generates a combined schema from all plugin schemas.
 * 
 * @param {Map<string, PluginDescriptor>} plugins - Linked plugin descriptors
 * @param {string} targetDir - Target directory (.opencode)
 * @returns {boolean} True if schema was generated successfully
 */
export function generateCombinedSchema(plugins, targetDir) {
  const schemaRefs = [];
  
  // Collect plugin schemas
  for (const descriptor of plugins.values()) {
    if (descriptor.configSchema) {
      const schemaPath = path.join(descriptor.rootDir, descriptor.configSchema);
      if (fs.existsSync(schemaPath)) {
        // Use file:// URL for local references
        schemaRefs.push({ 
          "$ref": "file://" + schemaPath,
          "_plugin": descriptor.pluginName // For documentation
        });
      }
    }
  }
  
  // If no schemas found, skip generation
  if (schemaRefs.length === 0) {
    return false;
  }
  
  const combinedSchema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "OpenCode Project Configuration (Generated)",
    "description": `Automatically generated from installed plugins: ${Array.from(plugins.keys()).join(', ')}`,
    "properties": {
      "externalSkills": buildExternalSkillsSchema()
    },
    "allOf": schemaRefs.map(ref => ({ "$ref": ref["$ref"] }))
  };
  
  // Ensure schemas directory exists
  const schemasDir = path.join(targetDir, 'schemas');
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }
  
  // Write schema
  const schemaPath = path.join(schemasDir, 'opencode-project.schema.json');
  fs.writeFileSync(schemaPath, JSON.stringify(combinedSchema, null, 2) + '\n');
  
  return true;
}

/**
 * Ensures opencode-project.json has correct schema reference.
 * 
 * @param {string} targetDir - Target directory (.opencode)
 */
export function ensureProjectConfigSchema(targetDir) {
  const configPath = path.join(targetDir, 'opencode-project.json');
  const schemaPath = './schemas/opencode-project.schema.json';
  
  if (!fs.existsSync(configPath)) {
    // Create new config with schema reference
    const defaultConfig = {
      "$schema": schemaPath,
      "version": "2.0.0"
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n');
    return;
  }
  
  // Update existing config to reference generated schema
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config["$schema"] !== schemaPath) {
      config["$schema"] = schemaPath;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    }
  } catch {
    // Ignore parse errors
  }
}

/**
 * Returns the JSON Schema definition for the externalSkills property.
 * Defined inline (not via $ref) since it is part of the core schema.
 *
 * @returns {object}
 */
export function buildExternalSkillsSchema() {
  return {
    "type": "array",
    "description": "External skills from skills.sh to include in this project",
    "items": {
      "type": "object",
      "required": ["source"],
      "properties": {
        "source": {
          "type": "string",
          "description": "GitHub owner/repo (e.g. 'vercel-labs/agent-skills')"
        },
        "skills": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Skill names to install. Omit to install all skills in the repo."
        },
        "category": {
          "type": "string",
          "enum": ["standard", "optional"],
          "default": "optional"
        },
        "branch": {
          "type": "string",
          "default": "main",
          "description": "Git branch to download from"
        }
      }
    }
  };
}
