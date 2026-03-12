# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-03-12

### Added
- **skills.sh Integration**: New CLI tools for managing external skills from the skills.sh database
  - `opencode-link external-skills:find [query]` - Search the skills.sh database for available skills
  - `opencode-link external-skills:add <owner/repo> <skill-name>` - Add skill to config and install
  - `opencode-link external-skills:install` - Install/update external skills
  - `opencode-link external-skills:update` - Update external skills to latest version
  - `opencode-link external-skills:list` - Show installed external skills
- New modules:
  - `lib/external-skills.js` - Core logic for external skills management
  - `lib/skills-registry.js` - Skills registry management and search functionality
- JSON schema generation for external skills validation

### Changed
- `bin/opencode-link.js` - Extended with new CLI commands for skills.sh integration
- `README.md` - Updated documentation with new functions
- `package.json` - Updated dependencies and version

### Details
This release introduces full integration with the skills.sh database, enabling users to discover, install, and manage custom skills. The implementation provides seamless interoperability with the OpenCode plugin system.

## [0.2.0] - 2026-03-04

### Added
- GitHub Actions workflow for automatic npm publishing on version tags
- `files` array in package.json for explicit publish contents
- npm provenance support for supply chain security

## [0.1.0] - 2026-02-01

### Added
- User config directory support (`~/.config/opencode/node_modules/`)
- Direct linking to `~/.config/opencode` when running from user config directory
- Skip `opencode.json` creation in user config directory (uses `config.json`)

### Fixed
- Singlerepo plugin source directory detection (use `descriptor.type` instead of `isUnified`)

### Changed
- Removed npm global prefix lookup - plugins are now discovered from user config and local only
