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
    # Check for execution_result
    local error_msg
    error_msg=$(echo "$result" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    r = d.get('result', {})
    ei = r.get('execution_info', {})
    er = ei.get('execution_result', {})
    v2 = er.get('Version2', {})
    msg = v2.get('error_message')
    # Casper 2.0: null/None/empty means success
    if msg is None or msg == '' or msg == 'null':
        print('SUCCESS')
    else:
        print(msg)
except:
    print('')
" 2>/dev/null)
    if [ "$error_msg" = "SUCCESS" ]; then
      ok "$label succeeded"
      return 0
    elif [ -n "$error_msg" ] && [ "$error_msg" != "" ]; then
      echo "  Error: $error_msg"
      fail "$label FAILED: $error_msg"
    fi
  done
  fail "$label timed out after 240s"
}

deploy_contract() {
  local name="$1"
  local key_name="$2"
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
    --session-args-json "[{\"name\":\"odra_cfg_package_hash_key_name\",\"type\":\"String\",\"value\":\"$key_name\"},{\"name\":\"odra_cfg_allow_key_override\",\"type\":\"Bool\",\"value\":false},{\"name\":\"odra_cfg_is_upgradable\",\"type\":\"Bool\",\"value\":true},{\"name\":\"odra_cfg_is_upgrade\",\"type\":\"Bool\",\"value\":false}]" \
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
REGISTRY_TXN=$(deploy_contract "AgentRegistry" "agent_registry_package_hash")
echo "      tx: $REGISTRY_TXN"
echo "      🔗 https://testnet.cspr.live/deploy/$REGISTRY_TXN"

# ── 2. Deploy AgentReputation ─────────────────────────────────────────────────
echo ""
echo "[2/6] Deploying AgentReputation…"
REPUTATION_TXN=$(deploy_contract "AgentReputation" "agent_reputation_package_hash")
echo "      tx: $REPUTATION_TXN"
echo "      🔗 https://testnet.cspr.live/deploy/$REPUTATION_TXN"

# ── 3. Deploy TaskCoordinator ─────────────────────────────────────────────────
echo ""
echo "[3/6] Deploying TaskCoordinator…"
COORDINATOR_TXN=$(deploy_contract "TaskCoordinator" "task_coordinator_package_hash")
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
echo "   4. Wire contracts together:"
echo "      reputation.configure(coordinator_addr, registry_addr)"
echo "      registry.set_reputation_contract(reputation_addr)"
echo "      See deploy.rs for the Odra-based approach, or use"
echo "      casper-client to call each entry point with package hashes."
echo "═══════════════════════════════════════════════════════════"
