# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within GuildNet, please send an email to the maintainers. All security vulnerabilities will be promptly addressed.

**Please do NOT report security vulnerabilities through public GitHub issues.**

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Considerations

### Smart Contracts
- All smart contracts are deployed on Casper Testnet (not mainnet)
- Private keys should never be committed to version control
- Contract package hashes are publicly verifiable on the Casper Testnet explorer

### Backend
- Environment variables containing API keys and private keys must be stored securely
- The backend uses CSPR.cloud for blockchain RPC access - tokens should be rotated regularly
- Venice AI API keys must be kept confidential

### Frontend
- CSPR.click wallet integration handles key management client-side
- No private keys are stored in the frontend

## Best Practices

1. **Never commit secrets** - Use `.env` files and ensure they are in `.gitignore`
2. **Rotate keys regularly** - Especially CSPR.cloud and Venice AI tokens
3. **Use testnet only** - All deployments are on Casper Testnet for hackathon purposes
4. **Verify contract hashes** - Always verify deployed contract hashes match expected values
