#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "$(id -u)" != 0 ]]; then
  echo 'Run sudo bash scripts/ci/setup-bastion-migration.sh from the bastion checkout.' >&2
  exit 1
fi

install -d -m 700 /etc/github-user-project
python3 - <<'PY'
import getpass
import json
import os
import re
import tempfile
from urllib.parse import quote

target = '/etc/github-user-project/migration.json'

with open('/dev/tty', 'r') as terminal_input, open('/dev/tty', 'w') as terminal_output:
    def ask(prompt, default=None):
        suffix = f' [{default}]' if default is not None else ''
        terminal_output.write(f'{prompt}{suffix}: ')
        terminal_output.flush()
        value = terminal_input.readline()
        if not value:
            raise SystemExit('Interactive input ended; configuration was not saved.')
        return value.strip() or default

    if os.path.exists(target) and ask('Replace the existing migration configuration? y/N', 'N').lower() != 'y':
        raise SystemExit('Existing configuration kept.')

    hostname = ask('Aurora writer hostname')
    port = ask('Database port', '5432')
    database = ask('Database name', 'github_users_app')
    username = ask('Migration database user', 'postgres')
    password = getpass.getpass('Database password (input is hidden): ', stream=terminal_output)

if not hostname or not re.fullmatch(r'[A-Za-z0-9.-]+', hostname):
    raise SystemExit('Enter only the Aurora writer hostname, without a URL prefix or port.')
if not port.isdigit() or not 1 <= int(port) <= 65535:
    raise SystemExit('Invalid database port.')
if not password:
    raise SystemExit('Database password is required.')
connection = (f'postgresql://{quote(username, safe="")}:{quote(password, safe="")}@'
              f'{hostname}:{port}/{quote(database, safe="")}')

descriptor, temporary = tempfile.mkstemp(dir=os.path.dirname(target), prefix='.migration-')
try:
    with os.fdopen(descriptor, 'w') as output:
        json.dump({'databaseUrl': connection}, output)
        output.write('\n')
    os.chmod(temporary, 0o600)
    os.replace(temporary, target)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print('Migration connection saved with root-only permissions.')
PY
