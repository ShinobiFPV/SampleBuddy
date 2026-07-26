# SampleBuddy VST Host

A standalone JUCE app that loads one VST3 plugin, shows its native editor window, and drives it with MIDI over a stdin protocol. Built as a separate executable — not a library or Node addon — and spawned as a child process by SampleBuddy (`src/main/audio/instrumentHost.ts`), the same way SampleBuddy already spawns `ffmpeg` for format conversion.

## License

This component is **GPLv3** (see `LICENSE`), separate from the rest of SampleBuddy (MIT). It links JUCE's ASIO support (`JUCE_ASIO=1`), which requires Steinberg's ASIO SDK headers — JUCE itself vendors the exact GPLv3-licensed subset it needs (`modules/juce_audio_devices/native/asio/{asio.h,asiosys.h,iasiodrv.h}`, with Steinberg's own license notice alongside them), fetched automatically via the `FetchContent` declaration in `CMakeLists.txt`. No separate SDK download or vendoring is needed to build this project.

Keeping this as a genuinely separate process — communicating with SampleBuddy only via stdin/stdout and process exit, never linked into SampleBuddy's own binary — keeps SampleBuddy itself under its own MIT license, consistent with how bundling `ffmpeg` (a separate executable, its own license) already works elsewhere in this repo.

## Building

See the repo's `CONTRIBUTING.md` for prerequisites (CMake, MSVC). From this directory:

```
cmake -S . -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release --target VstHost
```

## Protocol

Launch with `--plugin <path-to-vst3>` and `--device <asio-device-name>` (one of the names `--list-devices` prints — omitting it falls back to whatever ASIO's own default-device logic picks, which is not guaranteed to be audible on every machine). Add `--list-devices` on its own to print available ASIO device names as JSON lines and exit, without loading a plugin.

Once running, commands are read one per line from stdin:

- `midi <note> <velocity> <on|off>` — deliver a MIDI note to the loaded plugin.
- `capture start <path>` / `capture stop` — write the plugin's output to a WAV file; prints `CAPTURE_DONE <path>` on stop.
- `panic` — all-notes-off, in case a session ends mid-performance.
- `quit` — shut down cleanly.

Status lines on stdout: `READY`, `ERROR <message>`, `OK ...` (command acknowledgements), `CAPTURE_DONE <path>`.
