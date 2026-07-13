# Contributing to SampleBuddy

Thanks for taking an interest in SampleBuddy. It's a small, focused tool, so contributions that fit its scope — device profiles, format handling, bug fixes — are especially welcome.

## Getting set up

```
npm install
npm run dev       # launch in dev mode
```

Windows only, for now — see the README for why.

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
