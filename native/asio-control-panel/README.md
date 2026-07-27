# SampleBuddy ASIO Control Panel

A tiny standalone helper that opens an ASIO driver's own settings dialog (e.g. ASIO4ALL's input/channel configuration). Built as a separate executable — not a library or Node addon — and spawned as a one-shot child process by SampleBuddy (`src/main/audio/capture.ts`), the same way SampleBuddy already spawns `ffmpeg` and the VST host sidecar.

## Why this exists

ASIO has no standalone "settings app" — a driver's control-panel UI can only be shown by an ASIO host calling `IASIO::controlPanel()` after loading the driver via COM and calling `init()`. `audify` (the ASIO library SampleBuddy uses for recording, via RtAudio) doesn't expose that call anywhere in its public API or native bindings, so there's no way to trigger it from the Node/Electron side directly. This helper is a minimal from-scratch ASIO host that does only that: load the named driver, initialize it, show its control panel, then exit.

## License

This component is **GPLv3** (see `LICENSE`), separate from the rest of SampleBuddy (MIT). It needs Steinberg's ASIO SDK host-loader code (`Source/asio-sdk/`, copied from the same vendored subset RtAudio bundles for `audify` at `node_modules/audify/vendor/rtaudio/include/` — `asio.{h,cpp}`, `asiosys.h`, `iasiodrv.h`, `asiolist.{h,cpp}`, `asiodrivers.{h,cpp}`, `ginclude.h`). That's the same arrangement `native/vst-host` already uses for the same reason (see its `README.md`) — keeping this as a genuinely separate process, communicating with SampleBuddy only via process exit code, keeps SampleBuddy itself under its own MIT license.

## Building

See the repo's `CONTRIBUTING.md` for prerequisites (CMake, MSVC). From this directory:

```
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --target AsioControlPanel
```

## Usage

```
SampleBuddy ASIO Control Panel.exe "<ASIO driver name>"
```

The driver name must match one registered under `HKEY_LOCAL_MACHINE\SOFTWARE\ASIO\` (the same names `audify`'s `getDevices()` reports, e.g. `"ASIO4ALL v2"`). Loads the driver, calls `init()` then `controlPanel()` (which blocks until the user closes the dialog), then releases the driver and exits. Exits non-zero with a message on stderr if the driver can't be found or `init()` fails — which happens if another host (including SampleBuddy's own recording session) already has it open, since ASIO drivers only allow one exclusive host at a time.
