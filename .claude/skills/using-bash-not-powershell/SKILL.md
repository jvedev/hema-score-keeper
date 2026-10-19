---
name: using-bash-not-powershell
description: Use when about to run any shell command in this repo on Windows — npm, node, git, ssh, scp, file operations — and especially commands for the IBM i (nova-ibmi, ci:ibmi, ci/setup), or when the PowerShell tool looks like the easier route.
---

# Bash, never PowerShell

## Overview

In this repo every command runs through the **Bash** tool (Git Bash). The **PowerShell tool is not used**, not even
for "just one command". Everything works from Bash, and PowerShell broke things here repeatedly.

## Why

| PowerShell (5.1) did this | Effect |
|---|---|
| `npm run …` → `npm.ps1` blocked by the execution policy | the command did not run at all |
| piping text to `ssh` added a UTF-8 BOM and CRLF | `.bashrc` on the IBM i got `$'\357\273\277#': command not found` |
| `"` inside arguments to native programs got mangled | `printf: usage` on the IBM i |
| an empty argument (`-N ""`) was dropped | `ssh-keygen: too many arguments` |

## Quick reference (Bash)

| Task | Command |
|---|---|
| CI on the IBM i | `cd ts && npm run ci:ibmi` |
| command on the IBM i | `/c/Windows/System32/OpenSSH/ssh.exe nova-ibmi '…'` |
| an ssh argument that starts with `/` | prefix `MSYS_NO_PATHCONV=1`, or Git Bash turns `/QOpenSys/…` into `C:/Program Files/Git/QOpenSys/…` |
| copy a file to the IBM i | `/c/Windows/System32/OpenSSH/scp.exe file nova-ibmi:path/` |
| a script for the IBM i | pipe it wrapped in `{ … }` (see `ci/lib/remote.mjs`), never unwrapped |

Use **Windows OpenSSH** (`/c/Windows/System32/OpenSSH/…`), never Git Bash's own `ssh`: Git Bash's `$HOME` is `H:\`,
so its `ssh` does not see the key and the `nova-ibmi` alias in `C:\Users\jve\.ssh`. Node scripts in `ci/` already
pick Windows OpenSSH through `ci/lib/remote.mjs`.

## Red flags — use Bash instead

| Thought | Reality |
|---|---|
| "This is a Windows thing, PowerShell is more natural" | Git Bash runs Windows programs fine, including `cmd`-only tools via their `.exe`. |
| "Node in Bash can't see `C:\Windows\System32\OpenSSH`" | It can (checked 06-10-2026). If it ever can't, report it; don't switch shells. |
| "It's only a quick check" | The quick checks were exactly what broke (BOM, quotes, `npm.ps1`). |
| "The user ran it in PowerShell" | That is their shell. Commands you run go through Bash. |
