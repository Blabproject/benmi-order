#!/usr/bin/env python3
"""Run one agy turn with durable logs; report transport state, not acceptance."""

import argparse
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def now():
    return datetime.now(timezone.utc).isoformat()


def write_state(directory, state):
    temporary = directory / 'state.json.tmp'
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(directory / 'state.json')


@contextmanager
def conversation_lock(conversation_id):
    """Locks helper invocations only; leave lock files in place to avoid races."""
    directory = Path(tempfile.gettempdir()) / f'agy-orchestrator-locks-{os.getuid()}'
    directory.mkdir(mode=0o700, exist_ok=True)
    name = hashlib.sha256(conversation_id.encode()).hexdigest() + '.lock'
    with (directory / name).open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError('This conversation already has an active helper turn') from exc
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def classify(exit_code, result, protocol_errors):
    if exit_code != 0 or protocol_errors:
        return 'failed'
    if not isinstance(result, dict):
        return 'incomplete'
    if result.get('finished_reason') in {'print_timeout', 'timeout', 'cancelled', 'interrupted'}:
        return 'incomplete'
    if result.get('status') != 'SUCCESS':
        return 'failed'
    if not isinstance(result.get('response'), str) or not result['response'].strip():
        return 'incomplete'
    return 'worker_reported_success'


def run(args):
    executable = shutil.which('agy')
    if executable is None:
        raise RuntimeError('agy is not installed or not on PATH')
    workspace = args.cwd.expanduser().resolve(strict=True)
    if not workspace.is_dir():
        raise RuntimeError('--cwd must be a directory')
    prompt = args.prompt_file.expanduser().read_text()
    if not prompt.strip():
        raise RuntimeError('The prompt file is empty')
    directory = args.run_dir.expanduser().resolve()
    directory.mkdir(parents=True, mode=0o700, exist_ok=False)
    (directory / 'prompt.txt').write_text(prompt)
    command = [executable, '--output-format', 'stream-json', '--print-timeout', '0s']
    for key in ('conversation', 'mode', 'model', 'effort', 'agent'):
        value = getattr(args, key)
        if value:
            command.extend(['--' + key, value])
    if args.sandbox:
        command.append('--sandbox')
    command.extend(['--print', prompt])
    state = {
        'status': 'starting', 'started_at': now(), 'workspace': str(workspace),
        'runner_pid': os.getpid(), 'conversation_id': args.conversation,
        'requested_model': args.model, 'requested_mode': args.mode,
        'requested_effort': args.effort, 'requested_agent': args.agent,
        'run_directory': str(directory), 'event_count': 0,
        'unparsed_lines': 0, 'protocol_errors': [],
    }
    write_state(directory, state)
    result = None
    process = None
    discovered_lock = None
    starting_lock = conversation_lock(args.conversation) if args.conversation else nullcontext()
    try:
        with starting_lock:
            with (directory / 'stdout.ndjson').open('w') as log, (directory / 'stderr.log').open('w') as err:
                process = subprocess.Popen(command, cwd=workspace, stdout=subprocess.PIPE,
                                           stderr=err, text=True, encoding='utf-8', errors='replace')
                state.update(status='running', agy_pid=process.pid)
                write_state(directory, state)
                print(json.dumps({'event': 'worker_started', 'run_directory': str(directory),
                                  'agy_pid': process.pid}), flush=True)
                for line in process.stdout:
                    log.write(line)
                    log.flush()
                    try:
                        event = json.loads(line)
                        if not isinstance(event, dict):
                            raise ValueError('Non-object NDJSON')
                    except (ValueError, json.JSONDecodeError):
                        state['unparsed_lines'] += 1
                        write_state(directory, state)
                        continue
                    state['event_count'] += 1
                    state['last_event_at'] = now()
                    cid = event.get('conversation_id')
                    if event.get('event') == 'result':
                        result = event.get('result')
                        if isinstance(result, dict):
                            cid = cid or result.get('conversation_id')
                    if cid:
                        if state['conversation_id'] and cid != state['conversation_id']:
                            state['protocol_errors'].append('Conversation ID changed unexpectedly')
                        elif not state['conversation_id']:
                            discovered_lock = conversation_lock(cid)
                            discovered_lock.__enter__()
                            state['conversation_id'] = cid
                            print(json.dumps({'event': 'conversation', 'conversation_id': cid}), flush=True)
                    if event.get('event') == 'init':
                        state['effective_permission_mode'] = event.get('init', {}).get('permission_mode')
                    update = event.get('step_update', {})
                    if update:
                        state['last_step'] = {k: update[k] for k in
                                              ('step_index', 'state', 'step_type', 'tool_name') if k in update}
                    write_state(directory, state)
                process.wait()
                process.stdout.close()
    except (Exception, KeyboardInterrupt) as exc:
        state['error'] = str(exc) or type(exc).__name__
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        state['protocol_errors'].append('Runner interrupted; inspect remote/background tools before retrying')
    finally:
        if discovered_lock:
            discovered_lock.__exit__(None, None, None)
    exit_code = process.returncode if process else 1
    state.update(status=classify(exit_code, result, state['protocol_errors']),
                 finished_at=now(), exit_code=exit_code)
    if result is not None:
        (directory / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        if isinstance(result, dict):
            state['result_status'] = result.get('status')
            state['finished_reason'] = result.get('finished_reason')
            state['usage'] = result.get('usage')
            response = result.get('response', '')
            if isinstance(response, str):
                (directory / 'response.txt').write_text(response)
    state['stderr_tail'] = (directory / 'stderr.log').read_text()[-2000:] if (directory / 'stderr.log').exists() else ''
    write_state(directory, state)
    print(json.dumps(state, ensure_ascii=False), flush=True)
    return {'worker_reported_success': 0, 'incomplete': 2}.get(state['status'], 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    launch = commands.add_parser('run', help='Run one turn; each turn needs a fresh run directory')
    launch.add_argument('--cwd', type=Path, required=True)
    launch.add_argument('--run-dir', type=Path, required=True)
    launch.add_argument('--prompt-file', type=Path, required=True)
    launch.add_argument('--conversation')
    launch.add_argument('--model')
    launch.add_argument('--effort', choices=['low', 'medium', 'high', 'xhigh', 'max'])
    launch.add_argument('--agent')
    launch.add_argument('--mode', choices=['accept-edits', 'auto', 'plan'])
    launch.add_argument('--sandbox', action='store_true')
    inspect = commands.add_parser('status', help='Read recorded progress without calling agy')
    inspect.add_argument('--run-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == 'status':
            print((args.run_dir.expanduser() / 'state.json').read_text(), end='')
            return 0
        return run(args)
    except (OSError, ValueError, RuntimeError) as exc:
        print(json.dumps({'status': 'failed', 'error': str(exc)}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
