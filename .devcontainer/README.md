# Gabetype Development Container

This devcontainer configuration provides a complete development environment for Gabetype with all necessary dependencies pre-installed.

## Features

- Node.js 20 (latest LTS)
- pnpm package manager
- Docker-in-Docker support
- Git with proper configuration
- VS Code extensions for TypeScript, ESLint, Prettier, and Vitest

## Getting Started

1. Open this repository in GitHub Codespaces or VS Code with the Dev Containers extension
2. The container will automatically install dependencies using `pnpm install`
3. Start the development server with `pnpm run dev-fe`

## Available Ports

- **3000**: Frontend development server
- **8080**: Backend development server (when available)
- **5000**: Frontend build preview

## Package Manager

This project uses pnpm as the package manager. The devcontainer automatically installs pnpm v9.6.0 globally.

Common commands:
- `pnpm install` - Install dependencies
- `pnpm run dev-fe` - Start frontend development server
- `pnpm run build-fe` - Build frontend for production
- `pnpm run lint-fe` - Lint frontend code
- `pnpm run test-fe` - Run frontend tests