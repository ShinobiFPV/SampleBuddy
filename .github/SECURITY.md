# Security Policy

## Supported versions

SampleBuddy is pre-1.0 and under active development. Only the latest release on `master` is supported — please update before reporting an issue.

## Reporting a vulnerability

If you find a security issue (e.g. something that could let a malicious sample file, filename, or drive trigger unintended file writes, path traversal, or code execution), please report it privately rather than opening a public issue.

Email **shinobifpv@gmail.com** with:
- A description of the issue and its impact
- Steps to reproduce, including a minimal sample/filename if relevant
- Any suggested fix, if you have one

You should get an acknowledgement within a few days. This is a hobby-scale project maintained in spare time, so please be patient — but security reports will be prioritized over other issues.

Please don't publicly disclose the issue until it's been addressed.

## Scope

SampleBuddy runs locally on Windows and reads/writes files on your machine and removable drives — it doesn't have a network-facing component. Reports involving local file handling (path traversal, filename sanitization bypass, unsafe writes to drives) are in scope.
