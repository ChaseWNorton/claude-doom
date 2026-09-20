# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The primary surface is Claude Code's terminal Mods UI; a local browser view is a diagnostic companion.

## Users

Chase wants to play the original Doom engine inside a Claude Code mod.

## Product Purpose

Run the original Doom engine via doomgeneric, with Freedoom Phase 1 game data, in a live Claude Code pane opened with `/doom`.

## Capabilities and Constraints

The user explicitly selected the original engine with freely licensed assets. Preserve original gameplay and artwork. The mod must accept movement, firing, interaction, menu, and weapon input. Game execution is local and requires no model calls. Claude Mods is early access; use a project-local pinned Claude Code for testing. The native platform adapter initially targets macOS and Linux. Audio is not implemented in the initial adapter.

## Brand Commitments

Original Doom gameplay and Freedoom visuals are authoritative. No invented Doom-like engine or replacement artwork.

## Evidence on Hand

Pinned doomgeneric source under `vendor/doomgeneric`, Freedoom assets and license under `assets`, upstream provenance under `vendor/provenance.json`.

## Product Principles

- The actual running game dominates the pane.
- Keep controls and the return to Claude obvious.
- Scope game processes and storage to this plugin; clean them up when it closes.
