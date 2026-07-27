# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Payment category notifications: after SMS auto-import, Spentd guesses the category and shows a local notification with **Yes** (confirm / learn) or **Select the right one** (opens the expense in edit mode)

### Changed
- Removed optional cloud API from this monorepo (now a separate project: `spentd-api`)
- Docs: README / CONTRIBUTING describe local-first layout only

## [1.2.1] - 2026-07-25

### Added
- Expense list search (merchant, notes, amount, UPI ref) plus category, source, direction, and date filters
- Merchant → category learning: edits teach future SMS / screenshot / manual entries
- Settings: forget learned categories; footer shows git-tag version and credit

### Improved
- Shared pure search + merchant normalization helpers with tests
- SQLite schema v2 for on-device learned mappings (hashed merchant keys)

## [1.2.0] - 2026-07-23

### Added
- Local-first polish and release packaging for Android APK builds

### Improved
- README rewritten for end users and contributors (privacy-first, no cloud required)

## [1.1.6] - 2026-07-23

### Added
- SMS import review screen with scanned / ready / not-imported counts
- Per-message skip reasons and force-import for skipped payment SMS
- Stronger SMS balance footer parsing and cross-SMS (bank + UPI app) dedupe

### Improved
- Auto-import keeps amount + ref/balance payments even when merchant is weak
- Soft dedupe within ±5 minutes for twin PhonePe/GPay + bank alerts

## [1.0.0] - 2026-07-20

### Added
- Android expense tracker (Spentd) with Expo
- PhonePe / GPay screenshot OCR import
- SMS inbox import for bank/UPI messages
- Username + 6-digit passcode auth (Argon2id + JWT)
- Cloud sync API (Hono + Drizzle + Postgres)
- Local SQLite cache, budgets, cash tracking
- Dark private-banking UI
