#!/usr/bin/env python3
"""Install MD-OS into the current user's PATH and interactive shell profile."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from typing import NoReturn


PROJECT_ROOT = Path(__file__).resolve().parent
BIN_DIR = PROJECT_ROOT / "bin"
ENGINE_PATH = BIN_DIR / "mdos-console"
LAUNCHER_PATH = BIN_DIR / "mdos"
SHELL_DIR = PROJECT_ROOT / "adapters"
# Stable managed markers preserve idempotent upgrades from the earlier name.
BLOCK_START = "# >>> MD-OS semantic shell >>>"
BLOCK_END = "# <<< MD-OS semantic shell <<<"
SUPPORTED_SHELLS = ("auto", "bash", "zsh", "fish", "powershell", "none")


@dataclass(frozen=True)
class ShellTarget:
    name: str
    config_path: Path | None
    adapter_path: Path | None


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Install MD-OS for the current user without copying files outside "
            "the cloned project."
        )
    )
    parser.add_argument(
        "--shell",
        choices=SUPPORTED_SHELLS,
        default="auto",
        help="interactive shell to configure (default: detect automatically)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="show the selected paths and changes without writing them",
    )
    return parser.parse_args()


def fail(message: str, status: int = 1) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(status)


def validate_project() -> None:
    if sys.version_info < (3, 10):
        fail("MD-OS requires Python 3.10 or newer", 69)
    required = (
        LAUNCHER_PATH,
        BIN_DIR / "mdos.cmd",
        ENGINE_PATH,
        PROJECT_ROOT / "mdos-console.json",
        PROJECT_ROOT / "MDOS_SHELL.md",
        PROJECT_ROOT / "programs" / "orchestrator.json",
        PROJECT_ROOT / "programs" / "os.json",
        PROJECT_ROOT / "programs" / "code.json",
    )
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        fail("incomplete MD-OS checkout; missing: " + ", ".join(missing), 66)


def detect_shell(requested: str) -> str:
    if requested != "auto":
        return requested
    if os.name == "nt":
        return "powershell"
    shell_name = Path(os.environ.get("SHELL", "")).name.casefold()
    if shell_name in {"bash", "zsh", "fish"}:
        return shell_name
    if platform.system() == "Darwin":
        return "zsh"
    return "bash"


def discover_powershell_profile() -> Path:
    executable = shutil.which("pwsh") or shutil.which("powershell")
    if executable:
        try:
            result = subprocess.run(
                [executable, "-NoProfile", "-Command", "$PROFILE"],
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
        except (OSError, subprocess.TimeoutExpired):
            result = None
        if result and result.returncode == 0 and result.stdout.strip():
            return Path(result.stdout.strip()).expanduser()
    folder = "PowerShell" if shutil.which("pwsh") else "WindowsPowerShell"
    return Path.home() / "Documents" / folder / "Microsoft.PowerShell_profile.ps1"


def select_target(shell_name: str) -> ShellTarget:
    home = Path.home()
    if shell_name == "bash":
        return ShellTarget("bash", home / ".bashrc", SHELL_DIR / "mdos-console.bash")
    if shell_name == "zsh":
        return ShellTarget("zsh", home / ".zshrc", SHELL_DIR / "mdos-console.zsh")
    if shell_name == "fish":
        return ShellTarget(
            "fish",
            home / ".config" / "fish" / "config.fish",
            SHELL_DIR / "mdos-console.fish",
        )
    if shell_name == "powershell":
        return ShellTarget(
            "powershell",
            discover_powershell_profile(),
            SHELL_DIR / "mdos-console.ps1",
        )
    return ShellTarget("none", None, None)


def posix_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def shell_block(target: ShellTarget) -> str:
    if target.adapter_path is None:
        return ""
    bin_path = str(BIN_DIR)
    adapter_path = str(target.adapter_path)
    if target.name in {"bash", "zsh"}:
        quoted_bin = posix_quote(bin_path)
        quoted_adapter = posix_quote(adapter_path)
        body = "\n".join(
            [
                "case :\"$PATH\": in",
                f"  *:{quoted_bin}:*) ;;",
                f"  *) export PATH={quoted_bin}:\"$PATH\" ;;",
                "esac",
                f"if [ -r {quoted_adapter} ]; then",
                f"  . {quoted_adapter}",
                "fi",
            ]
        )
    elif target.name == "fish":
        quoted_bin = posix_quote(bin_path)
        quoted_adapter = posix_quote(adapter_path)
        body = "\n".join(
            [
                f"if not contains -- {quoted_bin} $PATH",
                f"    set -gx PATH {quoted_bin} $PATH",
                "end",
                f"if test -r {quoted_adapter}",
                f"    source {quoted_adapter}",
                "end",
            ]
        )
    else:
        quoted_adapter = powershell_quote(adapter_path)
        body = "\n".join(
            [
                f"if (Test-Path -LiteralPath {quoted_adapter}) {{",
                f"    . {quoted_adapter}",
                "}",
            ]
        )
    return f"{BLOCK_START}\n{body}\n{BLOCK_END}"


def merge_managed_block(original: str, block: str) -> tuple[str, str]:
    start = original.find(BLOCK_START)
    end = original.find(BLOCK_END)
    if start >= 0 and end >= start:
        end += len(BLOCK_END)
        merged = original[:start] + block + original[end:]
        return merged, "updated"
    if str(BIN_DIR) in original and str(SHELL_DIR) in original:
        return original, "already configured"
    separator = "" if not original or original.endswith("\n") else "\n"
    return f"{original}{separator}\n{block}\n", "installed"


def backup_file(path: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = path.with_name(f"{path.name}.mdos-console-{timestamp}.bak")
    shutil.copy2(path, backup)
    return backup


def configure_shell(target: ShellTarget, dry_run: bool) -> None:
    if target.name == "none" or target.config_path is None:
        print("shell_profile=not_configured")
        return
    if target.adapter_path is None or not target.adapter_path.is_file():
        fail(f"missing {target.name} adapter: {target.adapter_path}", 66)
    path = target.config_path
    try:
        original = path.read_text(encoding="utf-8") if path.exists() else ""
    except (OSError, UnicodeError) as error:
        fail(f"cannot read shell profile {path}: {error}", 66)
    merged, action = merge_managed_block(original, shell_block(target))
    print(f"shell={target.name}")
    print(f"shell_profile={path}")
    print(f"shell_profile_action={action}")
    if dry_run or merged == original:
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            print(f"shell_profile_backup={backup_file(path)}")
        path.write_text(merged, encoding="utf-8")
    except OSError as error:
        fail(f"cannot update shell profile {path}: {error}", 73)


def update_windows_user_path(dry_run: bool) -> None:
    if os.name != "nt":
        return
    try:
        import winreg
    except ImportError:
        fail("Python winreg support is unavailable", 69)
    bin_path = str(BIN_DIR)
    if dry_run:
        print(f"windows_user_path_add={bin_path}")
        return
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, "Environment")
        try:
            current, value_type = winreg.QueryValueEx(key, "Path")
        except FileNotFoundError:
            current, value_type = "", winreg.REG_EXPAND_SZ
        entries = [entry for entry in current.split(";") if entry]
        normalized = {os.path.normcase(os.path.normpath(entry)) for entry in entries}
        candidate = os.path.normcase(os.path.normpath(bin_path))
        if candidate not in normalized:
            entries.insert(0, bin_path)
            winreg.SetValueEx(key, "Path", 0, value_type, ";".join(entries))
            print("windows_user_path_action=installed")
            try:
                import ctypes

                result = ctypes.c_size_t()
                ctypes.windll.user32.SendMessageTimeoutW(
                    0xFFFF,
                    0x001A,
                    0,
                    "Environment",
                    0x0002,
                    5000,
                    ctypes.byref(result),
                )
            except (AttributeError, OSError):
                print("windows_environment_broadcast=unavailable")
        else:
            print("windows_user_path_action=already configured")
        winreg.CloseKey(key)
    except OSError as error:
        fail(f"cannot update the Windows user PATH: {error}", 73)


def make_posix_launchers_executable(dry_run: bool) -> None:
    if os.name == "nt":
        return
    for path in (LAUNCHER_PATH, ENGINE_PATH):
        current_mode = path.stat().st_mode
        desired_mode = current_mode | 0o111
        if desired_mode == current_mode:
            print(f"launcher_executable={path.name}:already configured")
            continue
        print(f"launcher_executable={path.name}:install")
        if not dry_run:
            path.chmod(desired_mode)


def main() -> int:
    arguments = parse_arguments()
    validate_project()
    shell_name = detect_shell(arguments.shell)
    target = select_target(shell_name)
    print(f"project_root={PROJECT_ROOT}")
    print(f"platform={platform.system() or os.name}")
    print(f"bin_directory={BIN_DIR}")
    print(f"dry_run={'yes' if arguments.dry_run else 'no'}")
    make_posix_launchers_executable(arguments.dry_run)
    update_windows_user_path(arguments.dry_run)
    configure_shell(target, arguments.dry_run)
    print("installation_status=ready")
    print("next_step=open a new terminal or reload the configured shell profile")
    print("universal_command=mdos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
