#!/usr/bin/env bash
# Fenrir first-time setup: asks for your domain and a few details, then writes deploy/.env with fresh secrets, the
# HTTPS proxy configuration and the release-signing key, and can build and start Fenrir.
#
#   deploy/setup.sh                 ask everything
#   deploy/setup.sh --domain rmm.example.org --email you@example.org --name "Example IT" --yes
#
# Options: --domain, --email, --name, --feed URL (optional signature feed), --no-certificate (unsigned Windows
# agents, lab profile), --yes (no questions; needs --domain and --email), --no-start.
# It never overwrites an existing deploy/.env: an existing installation keeps its secrets (see README "Updates").
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${FENRIR_SETUP_DOMAIN:-}"; EMAIL="${FENRIR_SETUP_EMAIL:-}"; NAME="${FENRIR_SETUP_NAME:-}"; FEED=""
CERT=""; YES=false; START=ask
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --feed) FEED="$2"; shift 2 ;;
    --no-certificate) CERT=no; shift ;;
    --yes|-y) YES=true; shift ;;
    --no-start) START=no; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
die() { printf 'Setup stopped: %s\n' "$*" >&2; exit 1; }
ask() {  # ask VAR "Question" [default]
  local var="$1" question="$2" default="${3:-}" answer
  if $YES; then printf -v "$var" '%s' "${!var:-$default}"; return; fi
  if [ -n "${!var:-}" ]; then return; fi
  read -r -p "$question${default:+ [$default]}: " answer
  printf -v "$var" '%s' "${answer:-$default}"
}

[ -f deploy/.env.example ] || die "run this from a Fenrir checkout (deploy/.env.example is missing)."
if [ -f deploy/.env ]; then
  die "deploy/.env already exists. This is for new installations; an existing server keeps its secrets. To start over
on a server with no data you want to keep, move deploy/.env aside and run setup again."
fi
command -v openssl >/dev/null || die "openssl is required (sudo apt-get install -y openssl)."

say "Fenrir setup"
say "Fenrir is reached at one domain name (for example rmm.yourcompany.com) that points at this server."
say ""

# Domain: a hostname only, which you control and which points at this server.
while :; do
  ask DOMAIN "Domain name for this Fenrir server"
  DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%%/*}"; DOMAIN="$(printf '%s' "$DOMAIN" | tr 'A-Z' 'a-z')"
  if ! printf '%s' "$DOMAIN" | grep -Eq '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'; then
    say "  \"$DOMAIN\" is not a domain name (expected something like rmm.yourcompany.com)."
  elif printf '%s' "$DOMAIN" | grep -Eq '(^|\.)example\.(com|org|net)$'; then
    say "  example.com is a placeholder; use a domain you own."
  else
    break
  fi
  $YES && die "--domain is not a usable domain name."
  DOMAIN=""
done

while :; do
  ask EMAIL "Administrator email (your first sign-in, and the certificate contact)"
  if printf '%s' "$EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then break; fi
  $YES && die "--email is not an email address."
  say "  That is not an email address."; EMAIL=""
done

ask NAME "Your organisation's name (shown in the console; change it later in Settings)" "My MSP"

if [ -z "$CERT" ] && ! $YES; then
  read -r -p "Do you have a Windows code-signing certificate (.pfx)? [y/N]: " answer
  case "$answer" in y|Y|yes|YES) CERT=yes ;; *) CERT=no ;; esac
fi
CERT="${CERT:-no}"

if [ -z "$FEED" ] && ! $YES; then
  read -r -p "Signature feed URL (optional; press Enter to skip): " FEED
fi

# Where the domain points now (informational: certificates fail until DNS reaches this server).
resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$resolved" ]; then say "  $DOMAIN points at $resolved."; else say "  $DOMAIN does not resolve yet: add a DNS A record for it pointing at this server before starting."; fi

hex() { openssl rand -hex "$1"; }
admin_password="$(hex 12)"

(
  umask 077
  mkdir -p deploy/signing deploy/releases
  chmod 700 deploy/signing
  sed \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(hex 32)|" \
    -e "s|^FENRIR_SECRET_KEY=.*|FENRIR_SECRET_KEY=$(hex 32)|" \
    -e "s|^FENRIR_PUBLIC_URL=.*|FENRIR_PUBLIC_URL=https://$DOMAIN|" \
    -e "s|^FENRIR_DOMAIN=.*|FENRIR_DOMAIN=$DOMAIN|" \
    -e "s|^FENRIR_ADMIN_EMAIL=.*|FENRIR_ADMIN_EMAIL=$EMAIL|" \
    -e "s|^FENRIR_ADMIN_PASSWORD=.*|FENRIR_ADMIN_PASSWORD=$admin_password|" \
    -e "s|^FENRIR_VAULT_KEY=.*|FENRIR_VAULT_KEY=$(openssl rand -base64 32)|" \
    -e "s|^FENRIR_VAULT_ALLOW_DERIVED_LEGACY=.*|FENRIR_VAULT_ALLOW_DERIVED_LEGACY=false|" \
    -e "s|^FENRIR_SMTP_FROM=.*|FENRIR_SMTP_FROM=fenrir@$DOMAIN|" \
    -e "s|^FENRIR_BUILD_PROFILE=.*|FENRIR_BUILD_PROFILE=$([ "$CERT" = yes ] && echo production || echo lab)|" \
    deploy/.env.example > deploy/.env
  # The organisation name may contain spaces and symbols: written on its own line in single quotes, which Docker
  # Compose takes literally (no $ expansion). A single quote in the name becomes a typographic apostrophe.
  sed -i '/^FENRIR_MSP_NAME=/d' deploy/.env
  printf "FENRIR_MSP_NAME='%s'\n" "${NAME//\'/’}" >> deploy/.env
  {
    echo ""
    echo "# Signature feed (optional): the server pulls indicators and rules from it when set."
    echo "FENRIR_FEED_URL=$FEED"
    echo "FENRIR_FEED_SYNC=$([ -n "$FEED" ] && echo true || echo false)"
  } >> deploy/.env
  chmod 600 deploy/.env
  test -s deploy/signing/release-ed25519.pem || openssl genpkey -algorithm ed25519 -out deploy/signing/release-ed25519.pem 2>/dev/null
  chmod 600 deploy/signing/release-ed25519.pem
)
[ -f deploy/docker-compose.https.yml ] || cp deploy/docker-compose.https.example.yml deploy/docker-compose.https.yml
[ -f deploy/Caddyfile ] || cp deploy/Caddyfile.example deploy/Caddyfile

compose_files="-f deploy/docker-compose.yml -f deploy/docker-compose.https.yml"
[ "$CERT" = yes ] || compose_files="$compose_files -f deploy/docker-compose.lab.yml"
printf '%s\n' "$compose_files" > deploy/.compose-files

say ""
say "Written: deploy/.env (fresh secrets), deploy/docker-compose.https.yml, deploy/Caddyfile, deploy/signing/release-ed25519.pem."
say "Keep a copy of deploy/.env and deploy/signing/ somewhere safe: without them stored secrets and agent updates cannot be recovered."
say ""
say "First sign-in:  https://$DOMAIN"
say "  Email:        $EMAIL"
say "  Password:     $admin_password   (shown once; change it after signing in)"
say ""
if [ "$CERT" = yes ]; then
  say "Put your certificate in place before the first build:"
  say "  deploy/signing/codesign.pfx and its password in deploy/signing/codesign.password (see docs/CODE_SIGNING.md)."
else
  say "No code-signing certificate: Windows agents are built unsigned (Windows SmartScreen warns when they run)."
  say "Add a certificate later and switch FENRIR_BUILD_PROFILE to production (docs/CODE_SIGNING.md)."
fi
say ""
say "Commands from now on (from $(pwd)):"
say "  sudo docker compose $compose_files --env-file deploy/.env up -d --build"

start_now=$START
if [ "$start_now" = ask ]; then
  if $YES || [ "$CERT" = yes ]; then start_now=no; else read -r -p "Build and start Fenrir now? This takes a while the first time. [Y/n]: " answer
    case "$answer" in n|N|no|NO) start_now=no ;; *) start_now=yes ;; esac; fi
fi
if [ "$start_now" = yes ]; then
  command -v docker >/dev/null || die "Docker is not installed (see README: Prepare the server)."
  # shellcheck disable=SC2086
  sudo env COMPOSE_BAKE=false docker compose $compose_files --env-file deploy/.env up -d --build
  say ""
  say "Started. Open https://$DOMAIN once the certificate is issued (a minute after DNS reaches this server)."
fi
