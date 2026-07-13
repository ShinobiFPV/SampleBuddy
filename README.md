# SampleBuddy

*ShinTech Electronics*

SampleBuddy converts and organizes audio samples for specific hardware samplers, then helps you upload them to a correctly formatted removable drive. Point it at a folder of samples, pick your hardware, and it flags what's already compliant, converts what isn't, and sanitizes filenames to match the device's rules — all without touching your originals.

## Supported hardware

| Device | Transfer method | Target format | Notes |
| --- | --- | --- | --- |
| Yamaha SEQTRAK | Staging folder | WAV, 16-bit, 44.1kHz | Import the staging folder with the Yamaha SEQTRAK desktop app — no direct drive transfer. |
| Alesis Strike Multipad | USB drive (FAT32, ≤32GB) | WAV, 16-bit, 44.1kHz | Files go directly in the drive root — no subfolders. |
| Roland SP-404 MKII | USB drive / SD card (FAT32) | WAV, 16-bit, 48kHz | Card must be formatted by the SP-404 MKII itself; files go in the `IMPORT` folder. |

## Dev commands

```
npm install
npm run dev       # launch in dev mode
npm run build     # production build
npm run pack      # unpacked electron-builder output
npm run release   # NSIS installer (unpublished)
```

Windows only, for now.
