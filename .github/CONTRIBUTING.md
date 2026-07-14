# Contributing to GuildNet

Thank you for your interest in contributing to GuildNet! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 20+
- Rust nightly (2025-02-01) with wasm32-unknown-unknown target
- Casper Testnet account with CSPR tokens

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/The3Guild/GuildNet.git
   cd GuildNet
   ```

2. **Smart Contracts**
   ```bash
   cd smart-contract
   cp .env.sample .env
   # Fill in your CSPR.cloud credentials
   cargo build --target wasm32-unknown-unknown --release
   cargo test
   ```

3. **Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Fill in required environment variables
   npm install
   npm test
   ```

4. **Frontend**
   ```bash
   cd frontend
   cp .env.example .env.local
   # Fill in required environment variables
   npm install
   npm run dev
   ```

## Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure nothing is broken
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Code Standards

### TypeScript (Backend/Frontend)
- Use TypeScript strict mode
- Follow ESLint configuration
- Write tests for new features

### Rust (Smart Contracts)
- Follow Rust standard naming conventions
- Use Odra framework patterns
- Write unit tests with MockVM

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- Specify which component is affected (smart contract, backend, frontend)

## License

By contributing, you agree that your contributions will be licensed under the project license.
