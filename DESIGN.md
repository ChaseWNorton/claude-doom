# Design

Preserve Freedoom's original low-resolution framebuffer, textures, weapon sprites, and status bar. The requested original game is the visual authority; the surrounding Claude terminal chrome stays native.

The pane contains the running game, a short focusable keyboard strip, and pause/restart/close controls. Fit the entire frame without cutting off the status bar. Render terminal pixels using paired half blocks with 24-bit color. The local diagnostic browser uses the same native engine's frames, nearest-neighbor scaling, a black background, and a visible keyboard-focus treatment.

Keep the game out of the model transcript. Show actionable startup errors in the pane/command response. Escape returns control to Claude; M opens Doom's menu. The initial adapter is silent and labels this in the documentation.
