import errno
import json
import os
from pathlib import Path
import pty
import select
import shlex
import signal
import stat
import sys
import tempfile
import time
import unittest
from urllib.parse import unquote, urlparse


SETUP_SCRIPT = Path(__file__).with_name('setup-bastion-migration.sh')


def run_setup(target, answers):
    source = SETUP_SCRIPT.read_text().split("python3 - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
    source = source.replace(
        "target = '/etc/github-user-project/migration.json'",
        f'target = {str(target)!r}',
    )
    # Keep stdin occupied by the heredoc, just as it is in the real shell script.
    command = f"{shlex.quote(sys.executable)} - <<'PY'\n{source}\nPY\n"
    child, terminal = pty.fork()
    if child == 0:
        os.execl('/bin/bash', 'bash', '-c', command)

    output = b''
    next_answer = 0
    deadline = time.monotonic() + 10
    status = None
    try:
        while time.monotonic() < deadline:
            readable, _, _ = select.select([terminal], [], [], 0.1)
            if readable:
                try:
                    data = os.read(terminal, 4096)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
                    _, status = os.waitpid(child, 0)
                    break
                if not data:
                    _, status = os.waitpid(child, 0)
                    break
                output += data
                if next_answer < len(answers):
                    prompt, value = answers[next_answer]
                    if prompt.encode() in output:
                        os.write(terminal, (value + '\n').encode())
                        next_answer += 1
            pid, child_status = os.waitpid(child, os.WNOHANG)
            if pid:
                status = child_status
                break
        if status is None:
            pid, child_status = os.waitpid(child, os.WNOHANG)
            if not pid:
                raise AssertionError('Setup did not finish in the pseudo-terminal')
            status = child_status
        return os.waitstatus_to_exitcode(status), output.decode(errors='replace')
    finally:
        os.close(terminal)
        if status is None:
            os.kill(child, signal.SIGKILL)
            os.waitpid(child, 0)


def connection_answers(password):
    return [
        ('Aurora writer hostname: ', 'database.example.com'),
        ('Database port [5432]: ', ''),
        ('Database name [github_users_app]: ', ''),
        ('Migration database user [postgres]: ', ''),
        ('Database password (input is hidden): ', password),
    ]


class SetupTerminalTests(unittest.TestCase):
    def test_initial_setup_with_hidden_password_and_heredoc_stdin(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'migration.json'
            password = 'test-only-@:/?#%密钥'
            code, output = run_setup(target, connection_answers(password))

            self.assertEqual(code, 0, output)
            self.assertNotIn(password, output)
            self.assertNotIn('Traceback', output)
            connection = urlparse(json.loads(target.read_text())['databaseUrl'])
            self.assertEqual(unquote(connection.password), password)
            self.assertEqual(connection.hostname, 'database.example.com')
            self.assertEqual(connection.path, '/github_users_app')
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_existing_configuration_can_be_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'migration.json'
            target.write_text('{"databaseUrl":"old"}')
            code, output = run_setup(target, [
                ('Replace the existing migration configuration? y/N [N]: ', 'y'),
                *connection_answers('new-test-password'),
            ])

            self.assertEqual(code, 0, output)
            self.assertIn('database.example.com', target.read_text())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)

    def test_declining_replacement_preserves_existing_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'migration.json'
            original = '{"databaseUrl":"existing-test-configuration"}'
            target.write_text(original)
            code, output = run_setup(target, [
                ('Replace the existing migration configuration? y/N [N]: ', ''),
            ])

            self.assertEqual(code, 1, output)
            self.assertIn('Existing configuration kept.', output)
            self.assertEqual(target.read_text(), original)


if __name__ == '__main__':
    unittest.main()
