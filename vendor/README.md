# Vendored source

`doomgeneric/` contains the source for [doomgeneric](https://github.com/ozkl/doomgeneric) at commit `dcb7a8dbc7a16ce3dda29382ac9aae9d77d21284`. Its 202 engine/platform source and build files are retained without changes, along with its license, original Doom readme, and project file. Our adapter is maintained separately in `native/doomgeneric_claude.c`.

The upstream screenshot directory and the README that embeds those screenshots are omitted because this release ships Freedoom game data only. The upstream `.gitignore` is omitted because its binary-name rule also ignores the vendored source directory named `doomgeneric`.

`provenance.json` records the original archive's hash and pinned revision, plus the official Freedoom release and its verified download hash. The release ZIP contains the complete source needed to rebuild the included executable with `node scripts/build.mjs`.
