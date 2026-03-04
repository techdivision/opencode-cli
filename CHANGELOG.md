# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-03-04

### Added
- User config directory support (`~/.config/opencode/node_modules/`)
- Direct linking to `~/.config/opencode` when running from user config directory
- Skip `opencode.json` creation in user config directory (uses `config.json`)

### Fixed
- Singlerepo plugin source directory detection (use `descriptor.type` instead of `isUnified`)

### Changed
- Removed npm global prefix lookup - plugins are now discovered from user config and local only
