# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-03-13

### Fixed
- Corrected default instructions path in opencode.json to `.opencode/guidelines/*.md`
- Updated `opencode-link.js` for improved CLI tool compatibility

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
- `README.md` - Updated documentation of new features
- `package.json` - Updated dependencies and version

### Details
This release introduces comprehensive integration with the skills.sh database, enabling users to discover, install, and manage custom skills. The implementation provides seamless interoperability with the OpenCode plugin system.
