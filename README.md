# SampleBuddy

*by ShinTech Electronics*

Every hardware sampler has opinions. This one wants 16-bit, that one wants 48kHz, this other one will silently choke on a filename with an apostrophe in it, and the one after that insists its SD card be formatted by the device itself or it sulks. Nobody has time to memorize all of that per device before every session.

SampleBuddy does. Point it at a folder of samples, tell it what hardware you're loading up, and it does the boring part: flags what's already good to go, converts what isn't, truncates or skips anything that's the wrong length, and sanitizes filenames so your sampler doesn't reject a kick drum sample on a technicality. Your original files never get touched — everything lands in its own tidy workspace, ready to go.

Think of it as a bouncer for your sample folder. It checks IDs at the door so your hardware doesn't have to.

## Supported hardware

| Device | Transfer method | Target format | Notes |
| --- | --- | --- | --- |
| Yamaha SEQTRAK | Staging folder | WAV, 16-bit, 44.1kHz | Import the staging folder with the Yamaha SEQTRAK desktop app — no direct drive transfer. |
| Alesis Strike Multipad | USB drive (FAT32, ≤32GB) | WAV, 16-bit, 44.1kHz | Files go directly in the drive root — no subfolders. |
| Roland SP-404 MKII | USB drive / SD card (FAT32) | WAV, 16-bit, 48kHz | Card must be formatted by the SP-404 MKII itself; files go in the `IMPORT` folder. |

More devices are on the way. If your sampler has a weird, specific rule about file naming, it will feel right at home here.

## How it works

1. **Pick your hardware.** The dropdown tells you its quirks so you don't have to remember them.
2. **Point it at a folder.** SampleBuddy scans everything and tells you, file by file, what's compliant and what isn't — and why.
3. **Hit FORMAT NOW.** Anything that needs converting gets converted; anything too long gets a truncate-or-skip choice; filenames get sanitized to match the device's rules.
4. **Grab your files.** They're sitting in a clean output folder, untouched originals still safe and sound right where you left them.

Drive/card upload management is coming in Phase 2 — for now, formatted files land in a local workspace folder you can copy over yourself.

## Dev commands

```
npm install
npm run dev       # launch in dev mode
npm run build     # production build
npm run pack      # unpacked electron-builder output
npm run release   # NSIS installer (unpublished)
```

Windows only, for now — your sampler probably doesn't care what OS made its WAV files, but Explorer-drive integration does.
