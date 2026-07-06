#!/usr/bin/env bash
# ============================================================================
# GuildNet — Casper Testnet Deploy Script
# Uses casper-client directly (no cargo-odra livenet dependency).
#
# Prerequisites:
#   1. casper-client installed  (cargo install casper-client --locked)
#   2. Keys generated           (casper-client keygen ./keys)
#   3. Account funded           (https://testnet.cspr.live/tools/faucet)
#   4. Wasm files built         (cargo odra build OR already in wasm/)
#
# Usage:
#   cp .env.sample .env && nano .env
#   chmod +x deploy.sh && ./deploy.sh
# ============================================================================

set -euo pipefail

# ── Load config ──────────────────────────────────────────────────────────────
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

NODE="${CASPER_NODE_ADDRESS:-https://node.testnet.casper.network}"
CHAIN="${CASPER_CHAIN_NAME:-casper-test}"
SECRET_KEY="${CASPER_SECRET_KEY_PATH:-./keys/secret_key.pem}"
WASM_DIR="${WASM_DIR:-./wasm}"

# Gas amounts (motes). 1 CSPR = 1_000_000_000 motes
# install-upgrade category, large Wasm — 400 CSPR is conservative
DEPLOY_GAS="${DEPLOY_GAS:-400000000000}"
CALL_GAS="${CALL_GAS:-5000000000}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "  $*"; }
ok()   { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

wait_for_txn() {
  local hash="$1"
  local label="$2"
  log "Waiting for $label (hash: ${hash:0:16}…)"
  for i in $(seq 1 60); do
    sleep 4
    local result
    result=$(source $HOME/.cargo/env && casper-client get-txn \
      --node-address "$NODE" "$hash" 2>&1) || true
    if echo "$result" | grep -q '"Success"'; then
      ok "$label succeeded"
      echo "$result" | grep '"transaction_hash"' | head -1
      return 0
    elif echo "$result" | grep -q '"Failure"'; then
      echo "$result" | grep '"error_message"' | head -1
      fail "$label FAILED"
    fi
  done
  fail "$label timed out after 240s"
}

deploy_contract() {
  local name="$1"
  local wasm="$WASM_DIR/${name}.wasm"
  [ -f "$wasm" ] || fail "Wasm not found: $wasm"

  log "Deploying $name ($(du -h "$wasm" | cut -f1))…"
  local hash
  hash=$(source $HOME/.cargo/env && casper-client put-txn session \
    --node-address "$NODE" \
    --chain-name "$CHAIN" \
    --secret-key "$SECRET_KEY" \
    --wasm-path "$wasm" \
    --session-entry-point "call" \
    --install-upgrade \
    --payment-amount "$DEPLOY_GAS" \
    --transferred-value 0 \
    --gas-price-tolerance 1 \
    --standard-payment "true" \
    2>&1 | grep '"Version1"' | sed 's/.*"Version1": "\([a-f0-9]\{64\}\)".*/\1/')

  [ -n "$hash" ] || fail "No transaction hash returned for $name"
  wait_for_txn "$hash" "$name"
  echo "$hash"
}

call_entry_point() {
  local contract_hash="$1"
  local entry_point="$2"
  local label="$3"
  shift 3
  local args=("$@")

  log "Calling $label…"
  local hash
  hash=$(source $HOME/.cargo/env && casper-client put-txn call-package \
    --node-address "$NODE" \
    --chain-name "$CHAIN" \
    --secret-key "$SECRET_KEY" \
    --package-hash "package-${contract_hash}" \
    --entry-point "$entry_point" \
    --category "small" \
    --gas-price-tolerance 1 \
    --pricing-mode fixed \
    "${args[@]}" \
    2>&1 | grep '"Version1"' | sed 's/.*"\([a-f0-9]\{64\}\)".*/\1/')
  [ -n "$hash" ] || fail "No transaction hash returned for $label"
  wait_for_txn "$hash" "$label"
  echo "$hash"
}

get_named_key() {
  local account_hash="$1"
  local key_name="$2"
  source $HOME/.cargo/env && casper-client query-global-state \
    --node-address "$NODE" \
    --key "account-hash-${account_hash}" \
    --query-path "$key_name" \
    2>&1 | grep '"parsed"' | head -1 | sed 's/.*"parsed": "\(.*\)".*/\1/'
}

# ── Preflight ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " GuildNet — Casper Testnet Deploy"
echo "═══════════════════════════════════════════════════════════"
echo " Node     : $NODE"
echo " Chain    : $CHAIN"
echo " Key      : $SECRET_KEY"
echo " Wasm dir : $WASM_DIR"
echo "═══════════════════════════════════════════════════════════"
echo ""

[ -f "$SECRET_KEY" ] || fail "Secret key not found: $SECRET_KEY — run: casper-client keygen ./keys"

# Get deployer public key and account hash
source $HOME/.cargo/env
PUBKEY=$(casper-client keygen --help 2>/dev/null; cat "${SECRET_KEY%.pem}_public_key_hex" 2>/dev/null || \
         casper-client account-address --public-key "${SECRET_KEY/secret/public}" 2>/dev/null | grep "account-hash" | sed 's/.*account-hash-\([^ ]*\).*/\1/' || echo "")
log "Deployer public key: ${PUBKEY:0:20}…"

# ── 1. Deploy AgentRegistry ───────────────────────────────────────────────────
echo "[1/6] Deploying AgentRegistry…"
REGISTRY_TXN=$(deploy_contract "AgentRegistry")
echo "      tx: $REGISTRY_TXN"
echo "      🔗 https://testnet.cspr.live/deploy/$REGISTRY_TXN"

# ── 2. Deploy AgentReputation ─────────────────────────────────────────────────
echo ""
echo "[2/6] Deploying AgentReputation…"
REPUTATION_TXN=$(deploy_contract "AgentReputation")
echo "      tx: $REPUTATION_TXN"
echo "      🔗 https://testnet.cspr.live/deploy/$REPUTATION_TXN"

# ── 3. Deploy TaskCoordinator ─────────────────────────────────────────────────
echo ""
echo "[3/6] Deploying TaskCoordinator…"
COORDINATOR_TXN=$(deploy_contract "TaskCoordinator")
echo "      tx: $COORDINATOR_TXN"
echo "      🔗 https://testnet.cspr.live/deploy/$COORDINATOR_TXN"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Contracts deployed!"
echo " NOTE: Query contract hashes from testnet.cspr.live using"
echo " the transaction hashes above, then update DEPLOY.md."
echo ""
echo " Transaction hashes:"
echo "   AgentRegistry    : $REGISTRY_TXN"
echo "   AgentReputation  : $REPUTATION_TXN"
echo "   TaskCoordinator  : $COORDINATOR_TXN"
echo ""
echo " Explorer:"
echo "   https://testnet.cspr.live/deploy/$REGISTRY_TXN"
echo "   https://testnet.cspr.live/deploy/$REPUTATION_TXN"
echo "   https://testnet.cspr.live/deploy/$COORDINATOR_TXN"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo " NEXT STEPS:"
echo "   1. Open each explorer link above"
echo "   2. Copy the 'contract-package-hash' from each deploy"
echo "   3. Paste into .env and DEPLOY.md"
echo "   4. Run configure_contracts.sh to wire them together"
echo "═══════════════════════════════════════════════════════════"
