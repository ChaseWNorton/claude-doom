/* SPDX-License-Identifier: GPL-2.0-or-later */
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>
#include "doomgeneric.h"
#include "doomstat.h"

static struct timespec started;
static unsigned char pending;
static int has_pending;

void DG_Init(void) {
    clock_gettime(CLOCK_MONOTONIC, &started);
    fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
    signal(SIGPIPE, SIG_DFL);
}

static void write_all(const void *data, size_t left) {
    const unsigned char *p = data;
    while (left) {
        ssize_t n = write(3, p, left);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) _exit(0);
        p += n;
        left -= (size_t)n;
    }
}

/* fd 3: ten native little-endian u32s, then 320x200 BGRA pixels.
 * The small state header lets integration tests verify actual gameplay. */
void DG_DrawFrame(void) {
    static uint32_t sequence;
    player_t *p = &players[consoleplayer];
    uint32_t h[10] = {0x444f4f4d, ++sequence, 0, 0, 0, 0, 0,
                      (uint32_t)leveltime, (uint32_t)gamestate, 0};
    if (gamestate == GS_LEVEL && p->mo) {
        h[2] = (uint32_t)p->mo->x;
        h[3] = (uint32_t)p->mo->y;
        h[4] = p->mo->angle;
        h[5] = (uint32_t)p->health;
        h[6] = (uint32_t)p->ammo[am_clip];
    }
    write_all(h, sizeof h);
    write_all(DG_ScreenBuffer, DOOMGENERIC_RESX * DOOMGENERIC_RESY * 4);
}

void DG_SleepMs(uint32_t ms) {
    struct timespec wait = {ms / 1000, (long)(ms % 1000) * 1000000};
    while (nanosleep(&wait, &wait) != 0 && errno == EINTR) {}
}

uint32_t DG_GetTicksMs(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (uint32_t)((now.tv_sec - started.tv_sec) * 1000
                     + (now.tv_nsec - started.tv_nsec) / 1000000);
}

/* Stdin records are [pressed, Doom key]. Handle split pipe reads. */
int DG_GetKey(int *pressed, unsigned char *key) {
    if (!has_pending) {
        ssize_t n = read(STDIN_FILENO, &pending, 1);
        if (n == 0) _exit(0);
        if (n != 1) return 0;
        has_pending = 1;
    }
    if (read(STDIN_FILENO, key, 1) != 1) return 0;
    *pressed = pending != 0;
    has_pending = 0;
    return 1;
}

void DG_SetWindowTitle(const char *title) { (void)title; }

int main(int argc, char **argv) {
    doomgeneric_Create(argc, argv);
    for (;;) doomgeneric_Tick();
}
