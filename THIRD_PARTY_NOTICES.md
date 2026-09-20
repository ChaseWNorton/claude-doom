# Third-party notices

## Doom / doomgeneric

Source: https://github.com/ozkl/doomgeneric

Pinned revision: `dcb7a8dbc7a16ce3dda29382ac9aae9d77d21284`.

The original Doom source and the doomgeneric port retain their original notices in `vendor/doomgeneric`. The GNU General Public License is reproduced in `LICENSE` and `vendor/doomgeneric/LICENSE`.

## Freedoom

Source: https://github.com/freedoom/freedoom/releases/tag/v0.13.0

Copyright 2001–2024 Contributors to the Freedoom project. All rights reserved.

The complete license is included in `assets/COPYING.txt`; contributors and music credits are in `assets/CREDITS.txt` and `assets/CREDITS-MUSIC.txt`. The original release documentation is in `assets/README.html`.

## Claude Code

The project-local runtime is installed separately from `@anthropic-ai/claude-code@2.1.278` and retains its upstream license in `.runtime/node_modules/@anthropic-ai/claude-code/LICENSE.md`. It is not covered by this project's GPL license.

The Claude runtime and API declarations are not redistributed in this repository or its release ZIP. `npm run setup:dev` downloads the published Claude Code 2.1.277 declaration snapshot from https://github.com/anthropics/claude-code/tree/a92ea1cdb11ad21f9d583fad2db181dfdac918a6/mods and verifies its SHA-256. Its upstream notices and terms apply. It is used only for development and type checking; the mod imports no runtime code from it.
