# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
