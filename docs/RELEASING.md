# Release procedure

The alpha ships Mac Apple Silicon only, built for macOS 14 or newer. Node.js 22+ and a Claude login are required to play. Keep the tested Claude version in `scripts/runtime.mjs` and `scripts/play.sh` aligned; changing it requires the official Mod tests and a real terminal smoke test.

1. Set the same new version in `package.json` and `.claude-plugin/plugin.json`. Update the archive URL in `.claude-plugin/marketplace.json` and install links in the README.
2. Run `npm run setup:dev`, `npm run build`, `npm test`, `npm run typecheck`, and the official Claude plugin validator/test runner.
3. Run `npm run package` and `npm run test:package`. The latter extracts into a temporary directory, verifies every checksum and executable permission, then exercises the actual packaged native engine.
4. Commit and run the Mac verification workflow. Download and test the CI artifact before publishing it. Create a prerelease tag with the ZIP and matching SHA-256 file; retain the complete corresponding source and license files in the ZIP.
5. In a fresh `CLAUDE_CONFIG_DIR`, add the public GitHub marketplace and install `doom@faros-labs`. Verify the installed cached plugin, then smoke-test its game pane with a logged-in Claude session.

Never include `.runtime`, `types/claude-code.d.ts`, local settings, raw terminal recordings, logs, credentials, or game saves in release archives. The package script uses an explicit file list. Claude Code and its declaration file are obtained separately from Anthropic.

The GIF in this repository is rendered from captured terminal output during real gameplay; it is not a desktop screen recording. Release notes must distinguish native/Mod CI tests, local interactive proof, and user acceptance. Audio and persistent saves are not implemented in this alpha.
