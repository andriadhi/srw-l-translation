# SRW L Translation

English translation of **Super Robot Wars L** (Nintendo DS, Japanese release).

The patch is applied in the browser at
**[andriadhi.github.io/srw-l-translation](https://andriadhi.github.io/srw-l-translation/)**,
no downloads, no accounts, no ROM ever leaves the device it is opened on.

> **Status: in progress.** No patch has been released yet. The page is live and the
> translation progress is public; the patcher opens with the first release.

| | |
|---|---|
| Version | 0 |
| Released | Coming soon |
| Language | English |
| Platform | Nintendo DS |
| Patcher | In-browser, nothing uploaded |

---

## How it works

1. You pick your own clean Japanese ROM in the browser.
2. The page checks that it is the ROM this patch supports.
3. If it matches, the English ROM is assembled **on your device**.
4. You keep the file; nothing is sent anywhere.

Nothing is uploaded. There is no backend, there is no database, and there is no account.
How the patch data is protected is deliberately not described here, because explaining it
would only make it easier to work around.

## What's included

> The list below describes the work completed so far, not a release. No patch has been
> published yet; this section is finalized when the first build ships.

- Story dialogue: 26,737 inventoried records translated and injected (dialogue-dynamic-v1);
  display repair and full-campaign validation remain open.
- Unit names (608), character names (850), weapon & attack names (995 weapon records),
  mission conditions (120), chapter & route titles (59), terrain labels (247), BGM menu
  titles & options (39), pilot skills (28) and unit abilities (50): translated, in game.
- Initial UI packet (469 records): translated; 84.2% confirmed in game.
- Battle dialogue: 23,415 records translated; not yet delivered in game.
- Item names and image-based text: not yet fully counted.

## Translation progress

Counts are per named inventory and as of 2026-10-23. "Not counted" means the denominator
itself is not established yet — it is not zero. Numbers are never averaged across rows.

| Part | Translated | In game |
|---|---|---|
| UI elements (whole category) | not counted | not counted |
| Unit names | 100% | 100% |
| Character names | 100% | 100% |
| Skill & ability names | 100% | 100% |
| Item names | not counted | not counted |
| Story dialogue | 100% | 100% |
| Battle dialogue | 100% | 0% |
| Mission conditions | 100% | 100% |
| Image-based text | not counted | not counted |
| Weapon & attack names | 100% | 100% |
| Chapter & route titles | 100% | 100% |
| Skill/ability/effect help descriptions | 100% | 100% |
| Terrain labels | 100% | 100% |
| Music titles & BGM options | 100% | 100% |

## Installation

1. Back up your original Japanese `.nds` file, and your `.sav` if you have one.
2. Open **[andriadhi.github.io/srw-l-translation](https://andriadhi.github.io/srw-l-translation/)**
   in a browser on your computer.
3. Select your clean, unmodified Japanese Super Robot Wars L ROM.
4. Let the patcher build the English ROM.
5. Save the file it gives you and open it in your emulator or on your own hardware.

**Always start from the original Japanese ROM.** Do not patch a ROM that has already been
patched. Each build is cumulative.

To continue an existing save, keep a backup, and where your emulator or flashcart requires
it, give the `.nds` and `.sav` files the same base filename.

## Required ROM

The patcher expects the Japanese release of Super Robot Wars L, unmodified. If your file
does not match, it is rejected with a message naming what is wrong.

| Property | Value |
|---|---|
| Region | Japan |
| Game code | `BRWJ` |
| Size | 134,217,728 bytes (128 MB) |
| CRC32 | `82804748` |
| SHA-1 | `641da39fe56c8725610bab8b8cdfa8b7fb0caf67` |

A file of the right size with the wrong hash is a different revision, a trimmed dump, or a
ROM that has already been patched. Start from your original dump again.

To check a file on macOS or Linux:

```sh
shasum -a 1 "your-rom.nds"
```

Do not use `cksum` for the CRC32 column above. It uses a different polynomial and will give
the wrong value.

## Testing

Quick testing has been done across every chapter and every branch. A full real playtest
has not been done yet.

This means the translation is checked for crashes, missing text and overflow, but it is not
checked for pacing, tone or consistency across a complete playthrough. If something reads
wrong, that is worth reporting.

## Known limitations

An honest list here turns complaints into reports. What is still open, as of 2026-10-23:

- Battle dialogue is translated but not yet delivered in game (23,415 records).
- The complete visible-UI denominator has not been established; only the initial UI
  packet (469 records) has been counted so far.
- Item-name inventory is incomplete, and reward-item level-up fields remain Japanese.
- No translated graphic replacement has been recorded yet; the visible-text inventory
  for image-based text is incomplete.
- Text is machine-checked for length but not yet fully reviewed for pacing, tone and
  consistency across a complete playthrough. If something reads wrong, that is worth
  reporting.

## Reporting problems

Use the [issue forms](https://github.com/andriadhi/srw-l-translation/issues/new/choose).
There are four categories:

| Form | For |
|---|---|
| **Patcher error** | The process failed before producing a file. Needs the error code shown in "Technical details". |
| **In-game bug** | The patched ROM runs but something is wrong. Emulator and version are required, most "glitches" on DS turn out to be emulator-side. |
| **Mistranslation** | Text is wrong, awkward, or overflows. |
| **A copy found elsewhere** | Point to a copy hosted or offered somewhere other than this site. A link is enough. |

The last form is a pointer, not a complaint. It asks for a link and nothing else: no names, no
accusations, no discussion of what should happen to whoever posted it.

Please include the build version, your emulator or hardware, the chapter and route, and a
screenshot where you can. **Do not attach ROM files to an issue.**

## Credits

- **Translator** — andriadhi
- **Editor** — andriadhi
- **Tester** — andriadhi

## Terms of use

**Super Robot Wars L, English Translation. Terms of use, version 0, November 2026.**

### What this is

This is an English translation patch of Super Robot Wars L for the Nintendo DS.

The translation patch is mine. The game is not. You bring your own copy of the Japanese
game, and the page assembles an English version of it on your own device. Nothing is
uploaded and nothing is stored. There is no account to make and no file to download. It
doesn't give you the game, it just lets you read it in English.

### It's free

Using it costs nothing. There is nothing to buy, nothing to subscribe to, and nothing to
unlock.

### How I'd like you to use it

Come to this page, patch the game you own, and play it. That's the intended path, and it
keeps everything in one place where I can fix things and answer questions.

The patcher runs in your browser. When you close the tab, the file it made is gone. There
is no download on this page. No file the patcher produces leaves your browser, and none is
offered to anyone else.

### Sharing my translation

Please do tell people about this patch. A link to this GitHub page is the best way to share
it.

If you'd rather host it yourself, or build something of your own around it, you're welcome
to, as long as these conditions travel with every copy. They attach to what I made, the
English text, the graphics I redrew, the work I did:

- **Say who made it.** Credit the repository at
  https://github.com/andriadhi/srw-l-translation
- **Nothing here may be used to earn money.** That covers every form it takes: a paywall, a
  subscription, an ad-supported mirror, a "premium" download link, a paid bundle, hardware
  sold with the game on it.
- **Don't claim it.** Don't present my translation as your own work, and don't remove or
  alter the credit.

If you redistribute my translation in any form, these conditions travel with it. A copy
that has lost the name has lost the permission. If one turns up without the credit, I'll
ask for it to be fixed. Being relaxed about one copy is not permission for the next.

### About the patched game

A patched ROM is the game plus my translation. The game in it belongs to Bandai Namco; the
English translation is the part I made. I claim nothing in the game, and I don't host or
link to a patched ROM.

Sharing the finished file is the one thing this page can't help with. If a friend wants to
play in English, send them here and they make their own.

### Back up your copy

Patch a copy, not your only file, and back up your save before you start. If something goes
wrong, I can't recover a file I never had.

### No affiliation

This is an unofficial fan translation. It is not affiliated with, endorsed by, or sponsored
by Bandai Namco or anyone else who made or publishes Super Robot Wars L. Super Robot Wars
and all related names and characters are trademarks of their respective owners.

### Questions

If something here is unclear, or you want to do something these terms don't cover, open an
issue on the repository at https://github.com/andriadhi/srw-l-translation/issues before you
do it rather than after.

## Built with

These are the tools used to build the translation. They are **not** dependencies of
the website, and none of them run in the browser.

| Tool | Version | Used for |
|---|---|---|
| Python | 3.12.14 | Extraction, injection, repacking, verification scripts |
| ndspy | 4.2.0 | Nintendo DS ROM structure and BLZ compression |
| Capstone | 5.0.9 | ARM disassembly |
| Keystone Engine | 0.9.2 | ARM patch assembly |
| Unicorn Engine | 2.1.4 | Offline CPU instruction testing |
| Zig | 0.13.0 | Compiling C helpers for ARM |