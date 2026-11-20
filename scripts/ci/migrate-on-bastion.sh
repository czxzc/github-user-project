#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "$(id -u)" != 0 ]]; then
  echo 'Run this script through SSM Run Command as root.' >&2
  exit 1
fi

source_dir="$(cd "${1:?Pass the extracted repository directory}" && pwd)"
config_file=/etc/github-user-project/migration.json
state_dir=/var/lib/github-user-project-migrations
mkdir -p "$state_dir"
chmod 700 "$state_dir"

# Keep an earlier command alive safely if a workflow is cancelled or retried.
exec 9>"$state_dir/migration.lock"
flock -w 600 9

if [[ ! -f "$config_file" ]]; then
  echo 'Initialize /etc/github-user-project/migration.json using setup-bastion-migration.sh.' >&2
  exit 1
fi
if [[ "$(stat -c '%u:%a' "$config_file")" != 0:600 ]]; then
  echo 'Migration configuration must be owned by root with mode 600.' >&2
  exit 1
fi

# SSM runs outside the interactive shell, so it gets its own pinned toolchain.
node_version=24.22.3
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64) node_arch=arm64 ;;
  *) echo 'Unsupported bastion CPU architecture.' >&2; exit 1 ;;
esac
node_distribution="node-v${node_version}-linux-${node_arch}"
node_dir="$state_dir/$node_distribution"
if [[ ! -x "$node_dir/bin/node" ]]; then
  download_dir="$(mktemp -d "$state_dir/node-download.XXXXXX")"
  trap 'rm -rf "$download_dir"' EXIT
  node_archive="$node_distribution.tar.xz"
  node_url="https://nodejs.org/dist/v${node_version}"
  curl -fsSL --retry 3 --connect-timeout 10 --max-time 180 "$node_url/$node_archive" -o "$download_dir/$node_archive"
  curl -fsSL --retry 3 --connect-timeout 10 --max-time 60 "$node_url/SHASUMS256.txt" -o "$download_dir/SHASUMS256.txt"
  (
    cd "$download_dir"
    awk -v archive="$node_archive" '$2 == archive { print }' SHASUMS256.txt > expected.sha256
    test -s expected.sha256
    sha256sum -c expected.sha256
    tar -xJf "$node_archive"
  )
  mv "$download_dir/$node_distribution" "$node_dir"
  rm -rf "$download_dir"
  trap - EXIT
fi
export PATH="$node_dir/bin:$PATH"

pnpm_dir="$state_dir/pnpm-12.18.0"
if [[ ! -x "$pnpm_dir/node_modules/.bin/pnpm" ]]; then
  npm install --prefix "$pnpm_dir" --no-audit --no-fund pnpm@12.18.0
fi
export PATH="$pnpm_dir/node_modules/.bin:$PATH"
cd "$source_dir"
CI=true pnpm install --frozen-lockfile --prod=false

certificate_file="$state_dir/global-bundle.pem"
curl -fsSL --retry 3 --connect-timeout 10 --max-time 60 \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o "$certificate_file"

echo 'Running database migration for this deployment.'
MIGRATION_CONFIG_PATH="$config_file" RDS_CA_BUNDLE="$certificate_file" \
  pnpm --filter @github-user-project/db run db:migrate:ci
