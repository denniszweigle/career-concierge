"""
PostToolUse hook — run TypeScript type checking after every .ts / .tsx edit.

Runs `pnpm check` (tsc --noEmit) in the project root whenever Claude edits a
TypeScript file.  Any type errors are printed to stdout (exit 0) so Claude can
fix them in a follow-up edit.  The edit is never blocked — only informed.

Skips:
  • non-TypeScript files
  • files inside node_modules/, dist/, .venv/
"""

import json
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", "dist", ".venv", "venv", "__pycache__"}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        sys.exit(0)

    tool_input = payload.get("tool_input", {})
    file_path = tool_input.get("file_path") or tool_input.get("path") or ""

    if not file_path:
        sys.exit(0)

    # Only run for TypeScript files
    if not (file_path.endswith(".ts") or file_path.endswith(".tsx")):
        sys.exit(0)

    path = Path(file_path).resolve()

    # Skip build output and dependencies
    if any(part in SKIP_DIRS for part in path.parts):
        sys.exit(0)

    # Run pnpm check from the project root
    project_root = Path.cwd()
    try:
        result = subprocess.run(
            ["pnpm", "check"],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        print("[ts-check] pnpm check timed out after 60s — skipping")
        sys.exit(0)
    except FileNotFoundError:
        print("[ts-check] pnpm not found — skipping type check")
        sys.exit(0)

    if result.returncode == 0:
        sys.exit(0)

    # Report errors back to Claude
    output = (result.stdout + result.stderr).strip()
    if output:
        print(f"[ts-check] Type errors detected after editing {path.name}:")
        print(output)

    sys.exit(0)  # exit 0 — inform Claude but never block the edit


if __name__ == "__main__":
    main()
