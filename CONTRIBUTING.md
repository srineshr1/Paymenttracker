# Contributing to Spentd

Thanks for your interest! Here's how to get started.

## Development setup

```bash
git clone https://github.com/srineshr1/Paymenttracker.git
cd Paymenttracker
npm install
npm run build -w @paymenttracker/shared
npm run mobile
```

For a full Android build (SMS + ML Kit OCR):

```bash
npm run mobile:android
```

## Project structure

```
apps/mobile       — Expo / React Native app (local-first)
packages/shared   — Zod schemas, UPI / SMS parsers, shared types
```

The optional cloud API is **not** in this repo. It lives at `~/Projects/spentd-api` if you have that checkout.

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
