"""
tasks.py – Hintergrund-Task-Queue für gestreamte Subprozesse
"""
import os
import queue
import subprocess
import threading
import uuid
from datetime import datetime
from pathlib import Path

from config import _SCRIPT_DIR, BASE_DIR

_tasks: dict[str, dict] = {}
_tasks_lock = threading.Lock()


def _save_log(task_id: str, lines: list[str], label: str = "") -> None:
    try:
        log_dir = BASE_DIR / "logs"
        log_dir.mkdir(exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        name = label or task_id
        log_file = log_dir / f"{ts}_{name}.txt"
        log_file.write_text("\n".join(lines), encoding="utf-8")
    except Exception:
        pass


def _run_task(task_id: str, cmd: list[str], env: dict | None = None,
              pre_cmds: list[list[str]] | None = None,
              post_cmds: list[list[str]] | None = None,
              log_label: str = "") -> None:
    q = _tasks[task_id]["queue"]
    all_lines: list[str] = []

    def emit(line: str) -> None:
        q.put(line)
        all_lines.append(line)

    try:
        proc_env = os.environ.copy()
        if env:
            proc_env.update(env)

        for pre in (pre_cmds or []):
            result = subprocess.run(
                pre, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=str(_SCRIPT_DIR), env=proc_env,
            )
            for line in result.stdout.splitlines():
                emit(line)
            if result.returncode != 0:
                emit("⚠️  Vorschritt mit Warnungen abgeschlossen — Monatslauf wird fortgesetzt.")
            emit("")

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            cwd=str(_SCRIPT_DIR),
            env=proc_env,
        )
        for line in proc.stdout:
            emit(line.rstrip("\n"))
        proc.wait()
        _tasks[task_id]["returncode"] = proc.returncode

        for post in (post_cmds or []):
            emit("")
            emit("─" * 60)
            result = subprocess.run(
                post, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, cwd=str(_SCRIPT_DIR), env=proc_env,
            )
            for line in result.stdout.splitlines():
                emit(line)
            if result.returncode != 0 and _tasks[task_id]["returncode"] == 0:
                _tasks[task_id]["returncode"] = result.returncode

    except Exception as exc:
        emit(f"FEHLER: {exc}")
        _tasks[task_id]["returncode"] = -1
    finally:
        _tasks[task_id]["done"] = True
        _tasks[task_id]["lines"] = all_lines
        _save_log(task_id, all_lines, log_label)


def start_task(cmd: list[str], env: dict | None = None,
               pre_cmds: list[list[str]] | None = None,
               post_cmds: list[list[str]] | None = None,
               log_label: str = "") -> str:
    task_id = uuid.uuid4().hex[:8]
    with _tasks_lock:
        _tasks[task_id] = {"queue": queue.Queue(), "done": False, "returncode": None, "lines": []}
    threading.Thread(
        target=_run_task,
        args=(task_id, cmd, env, pre_cmds, post_cmds, log_label),
        daemon=True,
    ).start()
    return task_id
