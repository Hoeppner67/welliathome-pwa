#!/usr/bin/env bash
set -euo pipefail

host="${DEPLOY_SSH_HOST:-welliathome.lima-ssh.de}"
port="${DEPLOY_SSH_PORT:-22}"
user="${DEPLOY_SSH_USER:-welliathome}"
web_dir="${DEPLOY_WEB_DIR:-welli-app}"
fingerprint="${DEPLOY_SSH_HOSTKEY_SHA256:-}"

fail() {
  printf 'Serverprüfung abgebrochen: %s\n' "$*" >&2
  exit 1
}

[[ "$host" == "welliathome.lima-ssh.de" ]] || fail "Unerwarteter SSH-Host."
[[ "$port" == "22" ]] || fail "Unerwarteter SSH-Port."
[[ "$user" == "welliathome" ]] || fail "Unerwarteter SSH-Benutzer."
[[ "$web_dir" == "welli-app" ]] || fail "Das relative Webverzeichnis muss welli-app sein."
[[ "$fingerprint" =~ ^SHA256:[A-Za-z0-9+/=]+$ ]] || fail "Der vertrauenswürdige Host-Key-Fingerprint fehlt."
[[ -f "$HOME/.ssh/id_ed25519" ]] || fail "Der private Deploy-Schlüssel fehlt in ~/.ssh/id_ed25519."

for tool in ssh ssh-keyscan ssh-keygen curl sha256sum awk grep sort; do
  command -v "$tool" >/dev/null || fail "Lokales Prüfprogramm fehlt: $tool."
done

ssh_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/welli-deploy-ssh"
mkdir -p "$ssh_dir"
chmod 700 "$ssh_dir"
known_hosts="$ssh_dir/known_hosts"
ssh-keyscan -p "$port" -H "$host" > "$known_hosts" 2>/dev/null || fail "SSH-Host-Key konnte nicht gelesen werden."
actual_fingerprints="$(ssh-keygen -lf "$known_hosts" -E sha256 | awk '{print $2}' | sort -u)"
grep -Fxq "$fingerprint" <<< "$actual_fingerprints" || fail "Host-Key-Fingerprint stimmt nicht mit der vertrauenswürdigen Vorgabe überein."
chmod 600 "$known_hosts"
ssh_options=(-p "$port" -i "$HOME/.ssh/id_ed25519" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known_hosts" -o ConnectTimeout=15)
target="$user@$host"

remote_result="$(ssh "${ssh_options[@]}" "$target" bash -s -- "$web_dir" <<'REMOTE'
set -eu
web_dir="$1"
fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v bash >/dev/null || fail "bash fehlt"
command -v sha256sum >/dev/null || fail "sha256sum fehlt"
command -v awk >/dev/null || fail "awk fehlt"
command -v df >/dev/null || fail "df fehlt"
web_path="$HOME/$web_dir"
test -d "$web_path" || fail "Webverzeichnis $web_path ist nicht vorhanden"
resolved_path=$(cd "$web_path" && pwd -P)
test -r "$resolved_path/index.html" || fail "index.html ist nicht lesbar"
test -r "$resolved_path/manifest.webmanifest" || fail "PWA-Manifest ist nicht lesbar"
test -r "$resolved_path/sw.js" || fail "Service Worker ist nicht lesbar"
index_hash=$(sha256sum "$resolved_path/index.html" | awk '{print $1}')
test -n "$index_hash" || fail "Hash des Web-Index konnte nicht ermittelt werden"
test -w "$resolved_path" && web_writable=yes || web_writable=no
test -w "$HOME" && home_writable=yes || home_writable=no
if command -v rsync >/dev/null; then
  transport=rsync
else
  command -v tar >/dev/null || fail "Weder rsync noch tar ist auf dem Hosting verfügbar."
  transport=tar
fi
command -v ln >/dev/null && mv -T --help >/dev/null 2>&1 && symlink_tools=yes || symlink_tools=no
if [ -L "$web_path" ]; then
  web_link=$(readlink "$web_path")
else
  web_link=not-a-symlink
fi
available_kb=$(df -Pk "$resolved_path" | awk 'END {print $4}')
printf 'ABSOLUTE_WEB_PATH=%s\n' "$resolved_path"
printf 'INDEX_SHA256=%s\n' "$index_hash"
printf 'WEB_DIRECTORY_WRITABLE=%s\n' "$web_writable"
printf 'HOME_WRITABLE=%s\n' "$home_writable"
printf 'RSYNC=%s\n' "$transport"
printf 'SYMLINK_TOOLS=%s\n' "$symlink_tools"
printf 'WEB_DIRECTORY_LINK=%s\n' "$web_link"
printf 'AVAILABLE_KIB=%s\n' "$available_kb"
REMOTE
)" || fail "SSH-Authentifizierung oder lesende Serverprüfung fehlgeschlagen."

printf '%s\n' "$remote_result"
remote_path="$(awk -F= '$1 == "ABSOLUTE_WEB_PATH" { print substr($0, index($0, "=") + 1) }' <<< "$remote_result")"
remote_hash="$(awk -F= '$1 == "INDEX_SHA256" { print $2 }' <<< "$remote_result")"
[[ "$remote_path" == /* && -n "$remote_hash" ]] || fail "Serverantwort ist unvollständig."
[[ "$remote_hash" =~ ^[a-f0-9]{64}$ ]] || fail "Der serverseitige Index-Hash ist ungültig."
available_kb="$(awk -F= '$1 == "AVAILABLE_KIB" { print $2 }' <<< "$remote_result")"
[[ "$available_kb" =~ ^[0-9]+$ ]] || fail "Der freie Speicherplatz konnte nicht gelesen werden."

live_url="$(curl --fail --silent --show-error --compressed --location --max-time 20 --output "$ssh_dir/live-index.html" --write-out '%{url_effective}' https://app.welliathome.de/)" || fail "Produktive HTTPS-Startseite konnte nicht gelesen werden."
case "$live_url" in
  https://app.welliathome.de/*) ;;
  *) fail "Die HTTPS-Startseite wurde auf eine unerwartete Origin umgeleitet." ;;
esac
live_hash="$(sha256sum "$ssh_dir/live-index.html" | awk '{print $1}')"
if [[ "$remote_hash" != "$live_hash" ]]; then
  fail "welli-app/index.html stimmt nicht mit der von app.welliathome.de ausgelieferten Startseite überein; DocumentRoot nicht bestätigt."
fi

printf 'DocumentRoot-Kandidat bestätigt: %s (HTTPS-Inhalt stimmt überein).\n' "$remote_path"
