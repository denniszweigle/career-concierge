"""
PreToolUse hook — snapshot function signatures before a Write/Edit/MultiEdit.

Reads the target .py file (if it exists) using ast, serialises all function
signatures to a temp-dir JSON cache.  The companion post_sig_hook.py reads
that cache to detect what changed after the edit completes.

Exit codes
  0 — always (never block; this hook is read-only)
"""

import ast
import hashlib
import json
import sys
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Signature extraction
# ---------------------------------------------------------------------------

def extract_signatures(source: str) -> dict:
    """
    Parse *source* and return a dict mapping every function/method name to its
    parameter list.

    Each parameter is stored as:
      {"name": str, "kind": "posonly"|"regular"|"vararg"|"kwonly"|"kwarg",
       "has_default": bool}
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}

    sigs: dict = {}

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        args = node.args
        params: list = []

        # Positional-only  (def f(a, b, /, c))
        posonly_defaults_start = len(args.posonlyargs) - len(args.defaults)
        for i, arg in enumerate(args.posonlyargs):
            params.append({
                "name": arg.arg,
                "kind": "posonly",
                "has_default": i >= posonly_defaults_start,
            })

        # Regular positional  (def f(a, b=1))
        regular_defaults_start = len(args.args) - len(args.defaults)
        for i, arg in enumerate(args.args):
            params.append({
                "name": arg.arg,
                "kind": "regular",
                "has_default": i >= regular_defaults_start,
            })

        # *args
        if args.vararg:
            params.append({"name": args.vararg.arg, "kind": "vararg",
                           "has_default": False})

        # Keyword-only  (def f(*, a, b=1))
        for i, arg in enumerate(args.kwonlyargs):
            params.append({
                "name": arg.arg,
                "kind": "kwonly",
                "has_default": args.kw_defaults[i] is not None,
            })

        # **kwargs
        if args.kwarg:
            params.append({"name": args.kwarg.arg, "kind": "kwarg",
                           "has_default": False})

        sigs[node.name] = {"params": params, "lineno": node.lineno}

    return sigs


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def cache_path(abs_file: str) -> Path:
    h = hashlib.md5(abs_file.encode()).hexdigest()[:12]
    return Path(tempfile.gettempdir()) / f"cc_sig_{h}.json"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        sys.exit(0)

    tool_input = payload.get("tool_input", {})
    file_path = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or ""
    )

    if not file_path or not file_path.endswith(".py"):
        sys.exit(0)

    abs_path = str(Path(file_path).resolve())

    source = ""
    try:
        source = Path(abs_path).read_text(encoding="utf-8")
    except FileNotFoundError:
        pass  # Brand-new file — empty snapshot is correct

    sigs = extract_signatures(source)
    cache_path(abs_path).write_text(
        json.dumps({"file": abs_path, "sigs": sigs}),
        encoding="utf-8",
    )

    sys.exit(0)


if __name__ == "__main__":
    main()
