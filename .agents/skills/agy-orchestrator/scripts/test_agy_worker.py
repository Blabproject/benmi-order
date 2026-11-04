#!/usr/bin/env python3
"""Local protocol and process tests; no real model calls."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('agy_worker.py')
spec = importlib.util.spec_from_file_location('agy_worker', SCRIPT)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

FAKE_CLI = '''#!/usr/bin/env python3
import json,sys,time,uuid
args=sys.argv[1:]
prompt=args[args.index('--print')+1]
request=json.loads(prompt)
cid=args[args.index('--conversation')+1] if '--conversation' in args else str(uuid.uuid4())
def emit(event): print(json.dumps(event),flush=True)
emit({'event':'init','conversation_id':cid,'init':{'permission_mode':'configured-default'}})
emit({'event':'test_arguments','arguments':args})
if '--mode' in args and args[args.index('--mode')+1]=='auto':
 print('warning: --mode auto unavailable; continuing in default mode',file=sys.stderr)
time.sleep(request.get('delay',0))
if request.get('case')=='missing':sys.exit(0)
result={'conversation_id':cid,'status':'SUCCESS','response':'done'}
if request.get('case')=='timeout':result['finished_reason']='print_timeout'
if request.get('case')=='empty':result['response']=''
if request.get('case')=='failure':result['status']='ERROR'
emit({'event':'result','result':result})
'''


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='agy-helper-tests-')
        self.root = Path(self.temp.name)
        self.workspace = self.root / 'workspace with spaces'
        self.workspace.mkdir()
        binary = self.root / 'bin'
        binary.mkdir()
        fake = binary / 'agy'
        fake.write_text(FAKE_CLI)
        fake.chmod(0o700)
        self.env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ.get('PATH', ''))

    def tearDown(self):
        self.temp.cleanup()

    def command(self, name, request=None, extra=()):
        prompt = self.root / (name + '-prompt.json')
        prompt.write_text(json.dumps(request or {}))
        directory = self.root / name
        command = [sys.executable, str(SCRIPT), 'run', '--cwd', str(self.workspace),
                   '--run-dir', str(directory), '--prompt-file', str(prompt), *extra]
        return command, directory, prompt

    def invoke(self, name, request=None, extra=()):
        command, directory, prompt = self.command(name, request, extra)
        result = subprocess.run(command, env=self.env, capture_output=True, text=True, timeout=10)
        state = json.loads((directory / 'state.json').read_text())
        return result, state, directory, prompt

    def test_prompt_literal_and_configured_defaults(self):
        sentinel = self.root / 'must-not-exist'
        value = f'Line one\n$(touch {sentinel}) `touch {sentinel}` $HOME'
        result, state, directory, prompt = self.invoke('literal', {'literal': value})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(sentinel.exists())
        self.assertEqual(state['status'], 'worker_reported_success')
        events = [json.loads(line) for line in (directory / 'stdout.ndjson').read_text().splitlines()]
        arguments = next(e['arguments'] for e in events if e['event'] == 'test_arguments')
        self.assertEqual(arguments[arguments.index('--print') + 1], prompt.read_text())
        self.assertNotIn('--model', arguments)
        self.assertNotIn('--mode', arguments)
        self.assertIn('0s', arguments)

    def test_resume_uses_exact_id_and_records_mode_warning(self):
        first, original, _, _ = self.invoke('first')
        self.assertEqual(first.returncode, 0)
        result, resumed, directory, _ = self.invoke('resume', extra=(
            '--conversation', original['conversation_id'], '--mode', 'auto', '--model', 'chosen-model'))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(resumed['conversation_id'], original['conversation_id'])
        self.assertEqual(resumed['requested_model'], 'chosen-model')
        self.assertEqual(resumed['effective_permission_mode'], 'configured-default')
        self.assertIn('auto unavailable', resumed['stderr_tail'])
        self.assertEqual((directory / 'response.txt').read_text(), 'done')

    def test_incomplete_success_is_not_accepted(self):
        for case in ['timeout', 'missing', 'empty']:
            with self.subTest(case=case):
                result, state, _, _ = self.invoke(case, {'case': case})
                self.assertEqual(result.returncode, 2)
                self.assertEqual(state['status'], 'incomplete')

    def test_error_response_fails_even_with_zero_cli_exit(self):
        result, state, _, _ = self.invoke('failed', {'case': 'failure'})
        self.assertEqual(result.returncode, 1)
        self.assertEqual(state['exit_code'], 0)
        self.assertEqual(state['status'], 'failed')

    def test_status_is_read_only(self):
        _, _, directory, _ = self.invoke('read-status')
        before = {p.name: p.read_bytes() for p in directory.iterdir()}
        result = subprocess.run([sys.executable, str(SCRIPT), 'status', '--run-dir', str(directory)],
                                env=dict(self.env, PATH=''), capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)['status'], 'worker_reported_success')
        self.assertEqual(before, {p.name: p.read_bytes() for p in directory.iterdir()})

    def test_two_workers_can_run_independently(self):
        commands = [self.command(name, {'delay': 0.2}) for name in ['worker-a', 'worker-b']]
        processes = [subprocess.Popen(c, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                     for c, _, _ in commands]
        for process in processes:
            output, error = process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0, output + error)
        states = [json.loads((d / 'state.json').read_text()) for _, d, _ in commands]
        self.assertNotEqual(states[0]['conversation_id'], states[1]['conversation_id'])

    def test_same_conversation_cannot_overlap(self):
        cid = 'overlap-' + self.root.name
        command, directory, _ = self.command('holding', {'delay': 1}, ('--conversation', cid))
        process = subprocess.Popen(command, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                if (directory / 'state.json').exists():
                    state = json.loads((directory / 'state.json').read_text())
                    if state.get('status') == 'running':
                        break
                time.sleep(0.01)
            else:
                self.fail('First worker did not start')
            result, state, _, _ = self.invoke('overlapping', extra=('--conversation', cid))
            self.assertEqual(result.returncode, 1)
            self.assertIn('already has an active', state['error'])
            process.communicate(timeout=10)
            self.assertEqual(process.returncode, 0)
        finally:
            if process.poll() is None:
                process.terminate()
                process.communicate(timeout=5)


if __name__ == '__main__':
    unittest.main()
