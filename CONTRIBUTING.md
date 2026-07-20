# Contributing to Ledger

Thanks for your interest! Here's how to get started.

## Development setup

```bash
git clone https://github.com/srineshr1/Paymenttracker.git
cd Paymenttracker
cp .env.example apps/api/.env
docker compose up -d
npm install
npm run build -w @paymenttracker/shared
npm run db:migrate
npm run db:seed
```

## Project structure

```
apps/
├── api/     — Hono + Drizzle + Postgres backend
└── mobile/  — Expo (React Native) Android app
packages/
└── shared/  — Zod schemas, UPI OCR parsers, shared types
```

## Making changes

1. Create a branch: `git checkout -b feat/my-feature` or `fix/my-bug`
2. Make your changes
3. Run quality checks:
   ```bash
   npm run typecheck
   npm test
   npm run lint
   ```
4. Push and open a pull request

## Code style

- TypeScript with strict mode
- 2-space indentation
- Biome handles formatting and linting
- Imports are automatically organized

## Commit messages

Use conventional commits:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` code restructuring
- `ci:` CI/CD changes
- `docs:` documentation

## Pull request process

1. Link any related issues
2. Add a clear description of the change
3. Ensure CI passes
4. Request a review from a maintainer

## Questions?

Open a [discussion](https://github.com/srineshr1/Paymenttracker/discussions) or ask in the PR.
