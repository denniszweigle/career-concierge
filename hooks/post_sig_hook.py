"""
PostToolUse hook — enforce signature consistency after a Write/Edit/MultiEdit.

Steps
  1. Load the pre-edit snapshot written by pre_sig_hook.py.
  2. Extract new signatures from the just-modified file.
  3. Diff old vs new:
       • Function renamed with same params  → patch all call sites (name)
       • Parameter renamed at same position → patch keyword-arg call sites
       • New param with a default           → no action (call sites still work)
       • New required param (no default)    → BREAKING — report & exit 2
       • Parameter removed                  → BREAKING — report & exit 2
  4. For every auto-fixable change, rewrite affected .py files in the project.
  5. Run the project test suite (pytest preferred, unittest fallback).
  6. Exit 0 on success, exit 2 on breaking changes or test failure.

Communication with Claude Code
  stdout — informational summary (shown to Claude in tool result)
  stderr — errors/blocking messages (shown to user)
  exit 2  — block the tool call
"""

import ast
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Shared helpers (mirrors pre_sig_hook.py — kept here so the hook is self-contained)
# ---------------------------------------------------------------------------

def extract_signatures(source: str) -> dict:
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

        posonly_defaults_start = len(args.posonlyargs) - len(args.defaults)
        for i, arg in enumerate(args.posonlyargs):
            params.append({"name": arg.arg, "kind": "posonly",
                           "has_default": i >= posonly_defaults_start})

        regular_defaults_start = len(args.args) - len(args.defaults)
        for i, arg in enumerate(args.args):
            params.append({"name": arg.arg, "kind": "regular",
                           "has_default": i >= regular_defaults_start})

        if args.vararg:
            params.append({"name": args.vararg.arg, "kind": "vararg",
                           "has_default": False})

        for i, arg in enumerate(args.kwonlyargs):
            params.append({"name": arg.arg, "kind": "kwonly",
                           "has_default": args.kw_defaults[i] is not None})

        if args.kwarg:
            params.append({"name": args.kwarg.arg, "kind": "kwarg",
                           "has_default": False})

        sigs[node.name] = {"params": params, "lineno": node.lineno}

    return sigs


def cache_path(abs_file: str) -> Path:
    h = hashlib.md5(abs_file.encode()).hexdigest()[:12]
    return Path(tempfile.gettempdir()) / f"cc_sig_{h}.json"


# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------

def _param_names(params: list) -> list:
    """Return parameter names, skipping 'self' and 'cls'."""
    return [p["name"] for p in params if p["name"] not in ("self", "cls")]


def diff_signatures(old_sigs: dict, new_sigs: dict) -> dict:
    """
    Compare old and new signature dicts.

    Returns:
      {
        "func_renames":   [(old_name, new_name), ...],
        "param_renames":  [(func_name, old_param, new_param), ...],
        "breaking":       [(func_name, description), ...],
        "added_optional": [(func_name, param_name), ...],
      }
    """
    old_names = set(old_sigs)
    new_names = set(new_sigs)

    func_renames: list = []
    param_renames: list = []
    breaking: list = []
    added_optional: list = []

    # --- Match disappeared functions to appeared functions (renames) ----------
    disappeared = old_names - new_names
    appeared = new_names - old_names

    matched_old: set = set()
    matched_new: set = set()

    for old_fn in disappeared:
        old_p = _param_names(old_sigs[old_fn]["params"])
        for new_fn in appeared:
            if new_fn in matched_new:
                continue
            new_p = _param_names(new_sigs[new_fn]["params"])
            # Same param list (or same count with only minor diffs) → rename
            if old_p == new_p or len(old_p) == len(new_p):
                func_renames.append((old_fn, new_fn))
                matched_old.add(old_fn)
                matched_new.add(new_fn)
                break

    # --- Check params for functions present in both snapshots -----------------
    for fn in old_names & new_names:
        old_p = [p for p in old_sigs[fn]["params"]
                 if p["name"] not in ("self", "cls")]
        new_p = [p for p in new_sigs[fn]["params"]
                 if p["name"] not in ("self", "cls")]

        if len(old_p) == len(new_p):
            # Same count — look for positional renames
            for op, np_ in zip(old_p, new_p):
                if op["name"] != np_["name"] and op["kind"] == np_["kind"]:
                    param_renames.append((fn, op["name"], np_["name"]))
        else:
            # Different counts — additions or removals
            old_set = {p["name"] for p in old_p}
            new_set = {p["name"] for p in new_p}

            for added_name in new_set - old_set:
                param = next(p for p in new_p if p["name"] == added_name)
                if param["has_default"]:
                    added_optional.append((fn, added_name))
                else:
                    breaking.append(
                        (fn, f"new required parameter '{added_name}' has no default")
                    )

            for removed_name in old_set - new_set:
                breaking.append((fn, f"parameter '{removed_name}' was removed"))

    return {
        "func_renames": func_renames,
        "param_renames": param_renames,
        "breaking": breaking,
        "added_optional": added_optional,
    }


# ---------------------------------------------------------------------------
# AST-based call-site patching
# ---------------------------------------------------------------------------

def _apply_line_replacements(
    lines: list, replacements: list
) -> tuple:
    """
    Apply a list of (lineno, col_start, col_end, new_text) replacements to
    *lines* (1-indexed lineno).  Applies from bottom-right to top-left so
    earlier positions stay valid.

    Returns (new_lines, count).
    """
    replacements.sort(key=lambda r: (r[0], r[1]), reverse=True)
    for lineno, col_start, col_end, new_text in replacements:
        idx = lineno - 1
        if idx < 0 or idx >= len(lines):
            continue
        line = lines[idx]
        lines[idx] = line[:col_start] + new_text + line[col_end:]
    return lines, len(replacements)


def patch_function_renames(source: str, old_name: str, new_name: str) -> tuple:
    """
    Replace bare calls  old_name(…)  →  new_name(…)  in *source*.
    Does NOT touch  def old_name  (that lives in the edited file already).

    Returns (new_source, count_of_replacements).
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source, 0

    replacements = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id == old_name:
            replacements.append((
                func.lineno, func.col_offset,
                func.end_col_offset, new_name,
            ))
        # Also handle  module.old_name(…)  attribute access
        elif isinstance(func, ast.Attribute) and func.attr == old_name:
            replacements.append((
                func.end_lineno,
                func.end_col_offset - len(old_name),
                func.end_col_offset,
                new_name,
            ))

    if not replacements:
        return source, 0

    lines = source.splitlines(keepends=True)
    lines, count = _apply_line_replacements(lines, replacements)
    return "".join(lines), count


def patch_kwarg_renames(
    source: str, func_name: str, old_param: str, new_param: str
) -> tuple:
    """
    Rename keyword argument  old_param=…  →  new_param=…  inside calls to
    *func_name*.

    Returns (new_source, count_of_replacements).
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source, 0

    replacements = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        is_target = (
            (isinstance(func, ast.Name) and func.id == func_name)
            or (isinstance(func, ast.Attribute) and func.attr == func_name)
        )
        if not is_target:
            continue
        for kw in node.keywords:
            if kw.arg == old_param:
                replacements.append((
                    kw.lineno,
                    kw.col_offset,
                    kw.col_offset + len(old_param),
                    new_param,
                ))

    if not replacements:
        return source, 0

    lines = source.splitlines(keepends=True)
    lines, count = _apply_line_replacements(lines, replacements)
    return "".join(lines), count


# ---------------------------------------------------------------------------
# Project helpers
# ---------------------------------------------------------------------------

MARKERS = [
    "requirements.txt", "setup.py", "pyproject.toml",
    ".git", "pytest.ini", "setup.cfg",
]


def find_project_root(file_path: str) -> Path:
    path = Path(file_path).resolve().parent
    while path != path.parent:
        if any((path / m).exists() for m in MARKERS):
            return path
        path = path.parent
    return Path(file_path).resolve().parent


def python_files(root: Path) -> list:
    return [
        p for p in root.rglob("*.py")
        if ".venv" not in p.parts
        and "venv" not in p.parts
        and "__pycache__" not in p.parts
    ]


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

def run_tests(project_root: Path) -> tuple:
    """
    Run pytest if available, else unittest discover.

    Returns (passed: bool, output: str).
    """
    test_files = [
        p for p in list(project_root.rglob("test_*.py")) +
                   list(project_root.rglob("*_test.py"))
        if ".venv" not in p.parts and "venv" not in p.parts
           and "__pycache__" not in p.parts
    ]

    if not test_files:
        return True, "No test files found — skipping test run."

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", str(project_root),
             "-q", "--tb=short"],
            capture_output=True, text=True, timeout=120,
        )
        passed = result.returncode == 0
        output = (result.stdout + result.stderr).strip()
        return passed, output
    except FileNotFoundError:
        pass

    # Fallback: unittest discover
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "discover",
         "-s", str(project_root), "-q"],
        capture_output=True, text=True, timeout=120,
    )
    passed = result.returncode == 0
    output = (result.stdout + result.stderr).strip()
    return passed, output


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        sys.exit(0)

    # Resolve the edited file path (Write uses tool_response, Edit uses tool_input)
    tool_input = payload.get("tool_input", {})
    tool_response = payload.get("tool_response", {})
    file_path = (
        tool_input.get("file_path")
        or tool_input.get("path")
        or tool_response.get("filePath")
        or ""
    )

    if not file_path or not file_path.endswith(".py"):
        sys.exit(0)

    abs_path = str(Path(file_path).resolve())

    # ---- Load pre-edit snapshot -------------------------------------------
    cache = cache_path(abs_path)
    old_sigs: dict = {}
    if cache.exists():
        try:
            old_sigs = json.loads(cache.read_text(encoding="utf-8")).get("sigs", {})
        except Exception:
            pass

    # ---- Extract post-edit signatures ------------------------------------
    try:
        new_source = Path(abs_path).read_text(encoding="utf-8")
    except FileNotFoundError:
        sys.exit(0)

    new_sigs = extract_signatures(new_source)

    if not old_sigs and not new_sigs:
        sys.exit(0)

    # ---- Diff -----------------------------------------------------------
    changes = diff_signatures(old_sigs, new_sigs)

    project_root = find_project_root(abs_path)
    all_py = python_files(project_root)

    summary_lines: list = []
    error_lines: list = []

    # ---- Auto-fix: function renames --------------------------------------
    for old_fn, new_fn in changes["func_renames"]:
        total = 0
        for py_file in all_py:
            if str(py_file) == abs_path:
                continue  # definition file already updated by the edit
            try:
                src = py_file.read_text(encoding="utf-8")
            except Exception:
                continue
            new_src, count = patch_function_renames(src, old_fn, new_fn)
            if count:
                py_file.write_text(new_src, encoding="utf-8")
                total += count
        summary_lines.append(
            f"[sig-hook] Renamed '{old_fn}' → '{new_fn}': "
            f"updated {total} call site(s) across project."
        )

    # ---- Auto-fix: parameter renames (keyword args) ----------------------
    for fn, old_p, new_p in changes["param_renames"]:
        total = 0
        for py_file in all_py:
            if str(py_file) == abs_path:
                continue
            try:
                src = py_file.read_text(encoding="utf-8")
            except Exception:
                continue
            new_src, count = patch_kwarg_renames(src, fn, old_p, new_p)
            if count:
                py_file.write_text(new_src, encoding="utf-8")
                total += count
        summary_lines.append(
            f"[sig-hook] Param rename in '{fn}': "
            f"'{old_p}' → '{new_p}' — updated {total} keyword call site(s)."
        )

    # ---- Informational: optional params added ----------------------------
    for fn, pname in changes["added_optional"]:
        summary_lines.append(
            f"[sig-hook] '{fn}' gained optional param '{pname}' "
            f"(existing call sites unaffected)."
        )

    # ---- Breaking changes ------------------------------------------------
    for fn, desc in changes["breaking"]:
        # Find all call sites so the user knows what to fix
        sites: list = []
        for py_file in all_py:
            try:
                src = py_file.read_text(encoding="utf-8")
                tree = ast.parse(src)
            except Exception:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    func = node.func
                    name = (
                        func.id if isinstance(func, ast.Name)
                        else func.attr if isinstance(func, ast.Attribute)
                        else None
                    )
                    if name == fn:
                        sites.append(f"  {py_file}:{node.lineno}")

        site_list = "\n".join(sites) if sites else "  (no call sites found)"
        error_lines.append(
            f"[sig-hook] BREAKING — '{fn}': {desc}\n"
            f"  Call sites that need manual update:\n{site_list}"
        )

    # ---- Print summary to stdout (visible to Claude) --------------------
    if summary_lines:
        print("\n".join(summary_lines))

    # ---- Run tests -------------------------------------------------------
    tests_passed, test_output = run_tests(project_root)
    if test_output:
        if tests_passed:
            print(f"[sig-hook] Tests passed.\n{test_output}")
        else:
            error_lines.append(f"[sig-hook] Tests FAILED:\n{test_output}")

    # ---- Block if there are breaking changes or test failures ------------
    if error_lines:
        print("\n".join(error_lines), file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
