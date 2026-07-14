#!/usr/bin/env bash
#
# generate-sample-txn.sh — Generate a real Casper Testnet transaction for the README
#
# This script:
#   1. Generates a fresh ed25519 keypair
#   2. Prints instructions to fund via the web faucet
#   3. Submits a simple transfer to the testnet
#   4. Prints the deploy hash for use in the README
#
# Prerequisites:
#   - casper-client installed (https://docs.casper.network/developers/prerequisites)
#
# Usage:
#   bash scripts/generate-sample-txn.sh

set -euo pipefail

KEY_DIR="/tmp/guildnet-sample-txn"
NODE="https://node.testnet.casper.network/rpc"
CHAIN="casper-test"

echo "═══════════════════════════════════════════════════════════"
echo " GuildNet — Sample Testnet Transaction Generator"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Generate keypair
mkdir -p "$KEY_DIR"
if [ ! -f "$KEY_DIR/secret_key.pem" ]; then
    echo "[1/4] Generating fresh ed25519 keypair..."
    casper-client keygen "$KEY_DIR/" 2>/dev/null
    echo "      Keys written to $KEY_DIR/"
else
    echo "[1/4] Using existing keypair in $KEY_DIR/"
fi

PUBLIC_KEY_HEX=$(cat "$KEY_DIR/public_key_hex")
echo "      Public key: $PUBLIC_KEY_HEX"
echo ""

# Step 2: Show faucet instructions
echo "[2/4] Fund your account:"
echo "      1. Open https://testnet.cspr.live/tools/faucet"
echo "      2. Paste this public key:"
echo "         $PUBLIC_KEY_HEX"
echo "      3. Click 'Request tokens' (5,000 CSPR — one-time only)"
echo "      4. Wait ~15 seconds for confirmation"
echo ""
read -p "      Press ENTER after your account is funded..."

# Step 3: Submit a transfer deploy
TARGET_ACCOUNT="0000000000000000000000000000000000000000000000000000000000000000"

echo "[3/4] Submitting 1 CSPR transfer..."
OUTPUT=$(casper-client put-deploy \
    --node-address "$NODE" \
    --chain-name "$CHAIN" \
    --secret-key "$KEY_DIR/secret_key.pem" \
    --transfer-amount 1000000000 \
    --target-account "$TARGET_ACCOUNT" \
    --payment-amount 100000000 \
    --ttl "30m" 2>&1)

DEPLOY_HASH=$(echo "$OUTPUT" | grep -oP '"deploy_hash"\s*:\s*"\K[^"]+' || true)

if [ -z "$DEPLOY_HASH" ]; then
    echo "      Failed to capture deploy hash. Full output:"
    echo "$OUTPUT"
    exit 1
fi

echo "      Deploy submitted!"
echo ""

# Step 4: Print results
echo "[4/4] Done! Copy this into the README:"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Deploy hash:  $DEPLOY_HASH"
echo " Explorer:     https://testnet.cspr.live/deploy/$DEPLOY_HASH"
echo " Account:      $PUBLIC_KEY_HEX"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Add this to the README.md 'Sample Testnet Transactions' table:"
echo ""
echo "| Sample Transfer | $DEPLOY_HASH | 1 CSPR transfer to zero account |"
echo ""
echo "Note: Wait ~30 seconds, then visit the explorer link to confirm"
echo "the deploy was finalized."
