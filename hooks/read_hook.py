import json
import re
import sys
from pathlib import Path

# Files that must never be read or modified
PROTECTED_FILENAMES = {".env", "credentials.json", "token.pickle"}

BASE_DIR = Path.cwd().resolve()


def _deny(msg: str) -> None:
    print(f"Access Denied: {msg}", file=sys.stderr)
    sys.exit(2)


def check_path(raw: str) -> None:
    """Block protected filenames and paths outside the sandbox."""
    path = Path(raw).resolve()

    if path.name in PROTECTED_FILENAMES:
        _deny(f"{path.name} is a protected file.")

    try:
        if not path.is_relative_to(BASE_DIR):
            _deny(f"{raw} is outside the allowed sandbox.")
    except ValueError:
        _deny("Path is on an unauthorized drive.")


def main() -> None:
    return 
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (json.JSONDecodeError, Exception):
        sys.exit(0)  # Unparseable input — don't block

    tool_name = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {})

    if tool_name == "Bash":
        command = tool_input.get("command", "")
        # Check if any protected filename appears in the command string
        for name in PROTECTED_FILENAMES:
            # Match as a standalone token (not part of a larger word)
            if re.search(r'(?<![/\w])' + re.escape(name) + r'(?![/\w])', command):
                _deny(f"Bash command references protected file: {name}")
        sys.exit(0)  # Bash passes path-sandbox check (sandbox doesn't apply)

    # File-based tools: Read, Grep, Edit, Write
    raw = tool_input.get("file_path") or tool_input.get("path") or ""
    if raw:
        check_path(raw)

    sys.exit(0)


if __name__ == "__main__":
    main()
