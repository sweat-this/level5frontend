#!/usr/bin/env bash
# Pins contracts/level5-v2.openapi.json to a specific Backend V2 revision, read from a local
# clone of sweat-this/Level5Backend - never from the network, and never from a moving branch
# implicitly. This is the only supported way to update the frontend's contract snapshot; normal
# frontend build/test/CI never runs this and never reaches out to the Backend repository.
#
# Usage:
#   scripts/contracts/pull-backend-contract.sh --backend-repo <path-to-Level5Backend-checkout> [--ref <git-ref>]
#
# --ref defaults to HEAD (i.e. whatever the given checkout currently has checked out). Pass a
# branch, tag, or commit SHA to pin to something else without changing that checkout's working
# tree - the file is read via `git show`, not from the working directory.
#
# After running this, also regenerate the generated TypeScript:
#   npm run contracts:generate
set -euo pipefail

canonical_path="v2/openapi/level5-v2.openapi.json"
ref="HEAD"
backend_repo=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-repo)
      backend_repo="$2"
      shift 2
      ;;
    --ref)
      ref="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${backend_repo}" ]]; then
  echo "Usage: $0 --backend-repo <path-to-Level5Backend-checkout> [--ref <git-ref>]" >&2
  exit 1
fi

if [[ ! -d "${backend_repo}/.git" ]]; then
  echo "Not a git repository: ${backend_repo}" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
frontend_root="$(cd "${script_dir}/../.." && pwd)"

commit_sha="$(git -C "${backend_repo}" rev-parse "${ref}")"
remote_url="$(git -C "${backend_repo}" remote get-url origin 2>/dev/null || echo "")"
# Normalizes any of the common origin URL forms (https, https-with-.git, ssh) down to
# "owner/repo", since that's the stable, host-agnostic identifier worth pinning - the transport
# (https vs ssh) a given developer's clone happens to use isn't part of the contract's identity.
backend_repository="$(echo "${remote_url}" | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
if [[ -z "${backend_repository}" ]]; then
  backend_repository="sweat-this/Level5Backend"
fi

# Warn (not fail) if nobody else could actually fetch this commit - e.g. it only exists on an
# unpushed local branch. source.json's whole purpose is letting someone else reproduce/debug the
# snapshot from it later, which silently stops being true if the pin points at local-only work
# (issue #4 review Problem 3).
if [[ -z "$(git -C "${backend_repo}" branch -r --contains "${commit_sha}" 2>/dev/null)" ]]; then
  echo "Warning: ${commit_sha} is not reachable from any remote-tracking branch in ${backend_repo}." >&2
  echo "         Push it first, or this pin won't be reproducible from source.json alone." >&2
fi

git -C "${backend_repo}" show "${commit_sha}:${canonical_path}" > "${frontend_root}/contracts/level5-v2.openapi.json"

cat > "${frontend_root}/contracts/level5-v2.source.json" <<EOF
{
  "backendRepository": "${backend_repository}",
  "backendRef": "${ref}",
  "backendCommit": "${commit_sha}",
  "canonicalPath": "${canonical_path}"
}
EOF

echo "Pinned contracts/level5-v2.openapi.json to ${backend_repository}@${commit_sha} (${ref})."
echo "Next: npm run contracts:generate"
