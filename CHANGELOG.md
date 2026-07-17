# Changelog

All notable changes to SampleBuddy are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-17

### Added
- Chop Sample mode: open a single file, mark up to 8 regions on its waveform with lettered A/B..O/P start/end markers, audition them on toggleable sampler pads (mouse or number keys 1-8), and export each region through the same per-device conversion/naming pipeline the batch flow uses.
- Akai MPC Sample device profile (USB-C / microSD, exFAT, files land in the `MPC-Sample/Samples` folder the device creates on first use).

### Changed
- Switched app typography to Rubik Mono One / Space Mono, matching the ShinTech site.

### Fixed
- Drive filesystem compliance check is now case-insensitive.
- Waveform marker flags no longer blend into the waveform's own stroke color.

## [0.2.0] - 2026-07-13

### Added
- Community health files: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- GitHub Actions release workflow that builds and publishes the Windows installer to GitHub Releases on tagged pushes (`vX.Y.Z`).
- README installation instructions pointing users at the prebuilt installer instead of a from-source build.

## [0.1.0] - 2026-07-13

### Added
- Initial scaffold, device profiles, and conversion pipeline for turning a folder of samples into a format a given hardware sampler will accept (bit depth, sample rate, filename sanitization).
- Support for Yamaha SEQTRAK (staging folder), Alesis Strike Multipad (USB drive), and Roland SP-404 MKII (USB drive / SD card).
- Drive upload workflow: detects connected removable drives, checks each against the device profile's requirements (filesystem, capacity, folder layout), and requires explicit confirmation before writing.
- Optional named subfolder for SP-404 MKII `IMPORT` uploads.
- Safe drive eject, using the same mechanism as Windows' own eject, deferring to Windows' "device is busy" protection.
- Public-facing README with screenshots of the scan, format, and upload flow.
