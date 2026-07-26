# Contributing to SampleBuddy

Thanks for taking an interest in SampleBuddy. It's a small, focused tool, so contributions that fit its scope — device profiles, format handling, bug fixes — are especially welcome.

## Getting set up

```
npm install
npm run dev       # launch in dev mode
```

Windows only, for now — see the README for why.

### Build prerequisites for ASIO support

`npm install` compiles [`audify`](https://www.npmjs.com/package/audify) (RtAudio bindings, used for the Record mode's ASIO input capture) from source — `.npmrc` forces this so the build picks up ASIO support, which the package's prebuilt binaries don't include (Steinberg's SDK license means the maintainers can't ship ASIO-enabled binaries publicly; a local build picks up RtAudio's own vendored ASIO host-glue code automatically, no manual SDK download needed). This requires:

- **CMake** — either install it standalone, or use the copy bundled with Visual Studio Build Tools' "C++ CMake tools for Windows" component (typically at `...\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin`, which may need adding to `PATH` if `cmake --version` doesn't already resolve).
- **Visual Studio Build Tools**, "Desktop development with C++" workload (provides the MSVC compiler).

No `electron-rebuild`/`install-app-deps` step is needed or run — `audify` targets N-API, which is ABI-stable across Node and Electron, so the module builds once against the host Node and loads fine in Electron as-is. (`electron-builder install-app-deps` used to be wired as a `postinstall` step here; it was removed because its native-module rebuild path assumes `node-gyp`/`binding.gyp`, and audify uses `cmake-js`/`CMakeLists.txt` instead — running it corrupts the working build rather than helping.)

### `native/vst-host/` — VST3 instrument hosting (Instrument page)

`native/vst-host/` is a standalone CMake/JUCE project, not part of the npm/electron-builder build (it's compiled separately and spawned as a child process — see `src/main/audio/instrumentHost.ts`). It backs the Instrument page: loading a VST3 (NI Kontakt is the one that matters, but any `.vst3` works), showing its native editor window, driving it with MIDI from any connected input, and capturing its output as a sample. It needs the same CMake + Visual Studio Build Tools prerequisites as `audify` above, plus:

- **Internet access on first configure** — `cmake -S . -B build` FetchContents the [JUCE](https://github.com/juce-framework/JUCE) framework (pinned tag, ~1-2GB) automatically; no manual JUCE install needed. JUCE also vendors the small ASIO SDK header subset it needs directly (Steinberg re-licensed those as GPLv3/MIT-dual in 2025) — no separate ASIO SDK download either.

Build with `cmake -S . -B build -G "Visual Studio 17 2022" -A x64` then `cmake --build build --config Release --target VstHost`. Since a VST3 plugin's editor is a native window, Electron can't embed it directly — the host always shows the plugin's GUI as its own separate floating OS window, driven out-of-process via a simple stdin protocol (see `Source/Main.cpp` and `scripts/spawn-test.mjs`).

**Licensing**: `native/vst-host/` links JUCE's ASIO support, which pulls in Steinberg's GPLv3-licensed ASIO headers — so this component is GPLv3 (`native/vst-host/LICENSE`), separate from the rest of SampleBuddy (MIT). It stays a genuinely separate process, talking to SampleBuddy only over stdin/stdout/exit-code and never linked into SampleBuddy's own binary — the same "separate program invoked as a subprocess" pattern already used for `ffmpeg`. See `native/vst-host/README.md` for the full rationale.

## Making changes

1. Fork the repo and create a branch off `master`.
2. Make your changes. There's no linter or test suite configured yet, so validate by running the app (`npm run dev`) and exercising the flow you touched — scan, convert, and (if relevant) drive upload.
3. Keep commits focused; a short, descriptive commit message is enough.
4. Open a pull request describing what changed and why, and what you tested.

## Adding a new device profile

Most contributions will be new hardware sampler support. A device profile defines things like target format (bit depth, sample rate), transfer method (staging folder vs. USB drive), filename rules, and any drive-layout requirements (filesystem, folder structure). Look at the existing profiles for the SEQTRAK, Strike Multipad, and SP-404 MKII as the pattern to follow, and include the specific quirks your device needs (e.g. required folder names, filesystem/capacity limits) — that's the whole point of the tool.

If you don't have hardware to test against but know the spec, say so in the PR — it's still useful, just flag it so it gets extra scrutiny before merge.

## Reporting bugs

Open an issue with:
- What device/profile you were using
- What you expected vs. what happened
- Sample files or filenames that triggered it, if relevant (redact anything sensitive)

## Code of conduct

By participating, you're expected to uphold the [Code of Conduct](CODE_OF_CONDUCT.md). This is a hobby-scale project maintained in spare time — patience with response times is appreciated.
