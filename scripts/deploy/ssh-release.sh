#!/usr/bin/env bash
set -euo pipefail

action="${1:-}"
release_id="${2:-}"
host="${DEPLOY_SSH_HOST:-}"
port="${DEPLOY_SSH_PORT:-}"
user="${DEPLOY_SSH_USER:-}"
root="${DEPLOY_ROOT:-}"
document_root="${DEPLOY_DOCUMENT_ROOT:-}"
mode="${DEPLOY_MODE:-}"
fingerprint="${DEPLOY_SSH_HOSTKEY_SHA256:-}"

fail() {
  printf 'Deployment abgebrochen: %s\n' "$*" >&2
  exit 1
}

[[ "$action" =~ ^(preflight|publish|rollback)$ ]] || fail "Aktion muss preflight, publish oder rollback sein."
[[ "$host" =~ ^[A-Za-z0-9.-]+$ ]] || fail "DEPLOY_SSH_HOST fehlt oder ist ungültig."
[[ "$port" =~ ^[0-9]{1,5}$ ]] && (( port > 0 && port < 65536 )) || fail "DEPLOY_SSH_PORT ist ungültig."
[[ "$user" =~ ^[A-Za-z0-9._-]+$ ]] || fail "DEPLOY_SSH_USER fehlt oder ist ungültig."
[[ "$root" =~ ^/[A-Za-z0-9._/-]+$ && "$root" != "/" && "$root" != */ && "$root" != *".."* && "$root" != *"//"* && "$root" != *"/./"* && "$root" != */. ]] || fail "DEPLOY_ROOT fehlt oder ist ungültig."
[[ "$document_root" =~ ^/[A-Za-z0-9._/-]+$ && "$document_root" != "/" && "$document_root" != */ && "$document_root" != *".."* && "$document_root" != *"//"* && "$document_root" != *"/./"* && "$document_root" != */. ]] || fail "DEPLOY_DOCUMENT_ROOT fehlt oder ist ungültig."
[[ "$mode" == "symlink" || "$mode" == "directory-swap" ]] || fail "DEPLOY_MODE muss nach Hosting-Prüfung gesetzt sein."
[[ "$fingerprint" =~ ^SHA256:[A-Za-z0-9+/=]+$ ]] || fail "DEPLOY_SSH_HOSTKEY_SHA256 fehlt oder ist ungültig."
if [[ "$action" != "preflight" ]]; then
  [[ "${DEPLOY_CAPABILITIES_VERIFIED:-false}" == "true" ]] || fail "Serverfähigkeiten sind nicht bestätigt; Veröffentlichung gesperrt."
fi
if [[ "$action" == "rollback" ]]; then
  [[ "$release_id" =~ ^(legacy-)?[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || fail "Release-ID ist ungültig."
fi

if [[ "$mode" == "symlink" && "$document_root" != "$root/current" ]]; then
  fail "Im Symlink-Modus muss DEPLOY_DOCUMENT_ROOT exakt DEPLOY_ROOT/current sein."
fi
if [[ "$mode" == "directory-swap" && ( "$document_root" == "$root" || "$document_root" == "$root"/* || "$root" == "$document_root"/* ) ]]; then
  fail "Im directory-swap-Modus dürfen Release-Pfad und DocumentRoot nicht gleich oder ineinander verschachtelt sein."
fi

command -v ssh >/dev/null || fail "SSH-Client fehlt."
command -v ssh-keyscan >/dev/null || fail "ssh-keyscan fehlt."
command -v ssh-keygen >/dev/null || fail "ssh-keygen fehlt."
[[ -f "$HOME/.ssh/id_ed25519" ]] || fail "Der private Deploy-Schlüssel fehlt in ~/.ssh/id_ed25519."
if [[ "$action" == "publish" ]]; then
  [[ -d dist && -f dist/index.html ]] || fail "Geprüfter Build dist/ fehlt."
fi

ssh_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/welli-deploy-ssh"
mkdir -p "$ssh_dir"
chmod 700 "$ssh_dir"
known_hosts="$ssh_dir/known_hosts"
ssh-keyscan -p "$port" -H "$host" > "$known_hosts" 2>/dev/null || fail "Host-Key konnte nicht gelesen werden."
actual_fingerprints="$(ssh-keygen -lf "$known_hosts" -E sha256 | awk '{print $2}' | sort -u)"
grep -Fxq "$fingerprint" <<< "$actual_fingerprints" || fail "Host-Key-Fingerprint stimmt nicht mit der vertrauenswürdigen Vorgabe überein."
chmod 600 "$known_hosts"
ssh_options=(-p "$port" -i "$HOME/.ssh/id_ed25519" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$known_hosts" -o ConnectTimeout=15)
target="$user@$host"

remote() {
  ssh "${ssh_options[@]}" "$target" bash -s -- "$@"
}

preflight() {
  local_rsync=0
  if command -v rsync >/dev/null; then local_rsync=1; fi
  transport="$(remote "$action" "$local_rsync" "$mode" "$root" "$document_root" <<'REMOTE'
set -eu
action="$1"
local_rsync="$2"
mode="$3"
root="$4"
document_root="$5"
fail() { printf '%s\n' "$*" >&2; exit 1; }
command -v bash >/dev/null || fail "bash fehlt"
command -v mkdir >/dev/null || fail "mkdir fehlt"
command -v mv >/dev/null || fail "mv fehlt"
command -v df >/dev/null || fail "df fehlt"
command -v awk >/dev/null || fail "awk fehlt"
test -d "$root" && test -w "$root" || fail "DEPLOY_ROOT muss existieren und beschreibbar sein"
transport=tar
if [ "$action" = rollback ]; then
  transport=none
elif [ "$local_rsync" = 1 ] && command -v rsync >/dev/null; then
  transport=rsync
else
  command -v tar >/dev/null || fail "Weder rsync auf beiden Systemen noch tar auf dem Server verfügbar"
fi
if [ -e "$root/releases" ]; then
  test -d "$root/releases" && test -w "$root/releases" || fail "Release-Verzeichnis ist nicht beschreibbar"
fi
if [ -e "$root/rollbacks" ]; then
  test -d "$root/rollbacks" && test -w "$root/rollbacks" || fail "Rollback-Verzeichnis ist nicht beschreibbar"
fi
if [ "$mode" = symlink ]; then
  command -v ln >/dev/null || fail "ln fehlt"
  mv -T --help >/dev/null 2>&1 || fail "Symlink-Aktivierung benötigt mv -T"
  if [ -e "$document_root" ] && [ ! -L "$document_root" ]; then
    fail "Der Symlink-DocumentRoot existiert, ist aber kein Symlink"
  fi
  if [ -L "$document_root" ] && [ ! -w "$root" ]; then
    fail "DEPLOY_ROOT ist nicht beschreibbar"
  fi
  if [ ! -L "$document_root" ]; then
    fail "Symlink-Modus erfordert ein vorhandenes current-Symlink auf die zu erhaltende Vorversion"
  fi
  current_target=$(readlink "$document_root")
  case "$current_target" in releases/*) current_id=${current_target#releases/} ;; *) fail "current-Symlink zeigt nicht auf DEPLOY_ROOT/releases" ;; esac
  [[ "$current_id" =~ ^(legacy-)?[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || fail "Release-ID des aktuellen Symlinks ist ungültig"
  test -f "$root/releases/$current_id/index.html" && test -f "$root/releases/$current_id/manifest.webmanifest" && test -f "$root/releases/$current_id/sw.js" || fail "Aktuelle Version ist nicht als vollständiges Rollback-Release erhalten"
else
  command -v cp >/dev/null || fail "cp fehlt"
  test -d "$document_root" && test ! -L "$document_root" || fail "Fallback benötigt einen vorhandenen physischen DocumentRoot"
  resolved_root=$(cd "$root" && pwd -P) || fail "DEPLOY_ROOT konnte nicht aufgelöst werden"
  resolved_document_root=$(cd "$document_root" && pwd -P) || fail "DocumentRoot konnte nicht aufgelöst werden"
  case "$resolved_root/" in "$resolved_document_root/"*) fail "Release-Pfad liegt innerhalb des DocumentRoots" ;; esac
  case "$resolved_document_root/" in "$resolved_root/"*) fail "DocumentRoot liegt innerhalb des Release-Pfads" ;; esac
  parent=$(dirname "$document_root")
  test -w "$parent" && test -w "$root" || fail "DocumentRoot-Elternordner und DEPLOY_ROOT müssen beschreibbar sein"
  root_device=$(stat -c %d "$root") || fail "Dateisystem für DEPLOY_ROOT konnte nicht geprüft werden"
  parent_device=$(stat -c %d "$parent") || fail "Dateisystem des DocumentRoot-Elternordners konnte nicht geprüft werden"
  [ "$root_device" = "$parent_device" ] || fail "Directory-Swap erfordert dasselbe Dateisystem"
fi
printf '%s\n' "$transport"
REMOTE
)"
  if [[ "$transport" == "tar" ]]; then
    command -v tar >/dev/null || fail "Lokales tar fehlt; auf dem Server nicht verfügbarer rsync kann nicht ersetzt werden."
  fi
  printf '%s\n' "$transport"
}

case "$action" in
  preflight)
    preflight
    ;;
  publish)
    [[ "${GITHUB_SHA:-}" =~ ^[a-f0-9]{7,40}$ ]] || fail "GITHUB_SHA fehlt oder ist ungültig."
    release_id="$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_SHA:0:12}"
    transport="$(preflight)"
    release_path="$root/releases/$release_id"
    required_kb="$(du -sk dist | awk '{print $1}')"
    if [[ "$mode" == "directory-swap" ]]; then
      required_kb=$((required_kb * 2))
    fi
    available_kb="$(remote "$root" <<'REMOTE'
set -eu
df -Pk "$1" | awk 'END {print $4}'
REMOTE
)"
    [[ "$available_kb" =~ ^[0-9]+$ ]] || fail "Freier Speicherplatz konnte nicht geprüft werden."
    (( available_kb >= required_kb )) || fail "Zu wenig freier Speicherplatz; benötigte mindestens ${required_kb} KiB, verfügbar ${available_kb} KiB."
    remote "$root" "$release_id" <<'REMOTE'
set -eu
root="$1"
release_id="$2"
release="$root/releases/$release_id"
mkdir -p "$root/releases" "$root/rollbacks"
if [ -e "$release" ]; then
  printf 'Release-Verzeichnis existiert bereits: %s\n' "$release" >&2
  exit 1
fi
mkdir -m 755 "$release"
REMOTE
    if [[ "$transport" == "rsync" ]]; then
      rsync -a -e "ssh ${ssh_options[*]}" -- dist/ "$target:$release_path/"
    else
      tar -C dist -cf - . | ssh "${ssh_options[@]}" "$target" "mkdir -p '$release_path' && tar -C '$release_path' -xf -"
    fi
    previous_id="$(remote "$mode" "$root" "$document_root" "$release_id" <<'REMOTE'
set -eu
mode="$1"
root="$2"
document_root="$3"
release_id="$4"
release="$root/releases/$release_id"
test -f "$release/index.html" && test -f "$release/manifest.webmanifest" && test -f "$release/sw.js"
if [ "$mode" = symlink ]; then
  current="$root/current"
  previous_id=""
  if [ -L "$current" ]; then
    old_target=$(readlink "$current")
    case "$old_target" in releases/*) previous_id=${old_target#releases/} ;; *) printf 'Aktiver Symlink zeigt nicht auf ein Release.\n' >&2; exit 1 ;; esac
    [[ "$previous_id" =~ ^(legacy-)?[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || { printf 'Aktive Release-ID ist ungültig.\n' >&2; exit 1; }
    test -d "$root/releases/$previous_id" || { printf 'Vorheriges Release fehlt.\n' >&2; exit 1; }
  fi
  ln -s "releases/$release_id" "$root/.current-$release_id"
  mv -Tf "$root/.current-$release_id" "$current"
else
  previous_id=""
  if [ -f "$root/.active-release" ]; then
    previous_id=$(cat "$root/.active-release")
    [[ "$previous_id" =~ ^(legacy-)?[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || { printf 'Aktive Release-ID ist ungültig.\n' >&2; exit 1; }
    test -d "$root/releases/$previous_id" || { printf 'Vorheriges Release fehlt.\n' >&2; exit 1; }
  fi
  temp="${document_root}.new-$release_id"
  backup="$root/rollbacks/$release_id.previous"
  if [ -z "$previous_id" ]; then
    previous_id="legacy-$release_id"
    backup="$root/releases/$previous_id"
  fi
  [ ! -e "$temp" ] && [ ! -e "$backup" ] || { printf 'Temporäre oder Backup-Version existiert bereits.\n' >&2; exit 1; }
  cp -a "$release" "$temp"
  mv "$document_root" "$backup"
  if ! mv "$temp" "$document_root"; then
    mv "$backup" "$document_root"
    exit 1
  fi
  marker="$root/.active-$release_id"
  printf '%s\n' "$release_id" > "$marker"
  mv -f "$marker" "$root/.active-release"
fi
printf '%s' "$previous_id"
REMOTE
    )"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      printf 'release_id=%s\nprevious_release_id=%s\n' "$release_id" "$previous_id" >> "$GITHUB_OUTPUT"
    fi
    printf 'Release %s wurde aktiviert (vorheriges Release: %s).\n' "$release_id" "${previous_id:-keines}"
    ;;
  rollback)
    preflight >/dev/null
    remote "$mode" "$root" "$document_root" "$release_id" <<'REMOTE'
set -eu
mode="$1"
root="$2"
document_root="$3"
release_id="$4"
release="$root/releases/$release_id"
test -d "$release" && test -f "$release/index.html" && test -f "$release/manifest.webmanifest" && test -f "$release/sw.js" || {
  printf 'Kompatibles Release nicht vollständig vorhanden: %s\n' "$release_id" >&2
  exit 1
}
if [ "$mode" = symlink ]; then
  temp="$root/.rollback-$release_id-$$"
  ln -s "releases/$release_id" "$temp"
  mv -Tf "$temp" "$root/current"
else
  temp="${document_root}.rollback-$release_id-$$"
  backup="$root/rollbacks/rollback-$release_id-$$.previous"
  cp -a "$release" "$temp"
  mv "$document_root" "$backup"
  if ! mv "$temp" "$document_root"; then
    mv "$backup" "$document_root"
    exit 1
  fi
  marker="$root/.active-rollback-$$"
  printf '%s\n' "$release_id" > "$marker"
  mv -f "$marker" "$root/.active-release"
fi
REMOTE
    printf 'Rollback auf Release %s abgeschlossen.\n' "$release_id"
    ;;
esac
