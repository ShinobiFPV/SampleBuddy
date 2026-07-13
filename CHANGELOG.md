# Changelog

All notable changes to SampleBuddy are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Community health files: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.

## [0.1.0] - 2026-07-13

### Added
- Initial scaffold, device profiles, and conversion pipeline for turning a folder of samples into a format a given hardware sampler will accept (bit depth, sample rate, filename sanitization).
- Support for Yamaha SEQTRAK (staging folder), Alesis Strike Multipad (USB drive), and Roland SP-404 MKII (USB drive / SD card).
- Drive upload workflow: detects connected removable drives, checks each against the device profile's requirements (filesystem, capacity, folder layout), and requires explicit confirmation before writing.
- Optional named subfolder for SP-404 MKII `IMPORT` uploads.
- Safe drive eject, using the same mechanism as Windows' own eject, deferring to Windows' "device is busy" protection.
- Public-facing README with screenshots of the scan, format, and upload flow.
