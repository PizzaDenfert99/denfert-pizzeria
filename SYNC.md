# SYNC.md — deprecated (kept for git history only)

This document described the previous **two-repo sync contract** between
`denfert-pizzeria` (customer app) and `pizza-denfert-loyalty` (backend +
loyalty app).

That contract is now **obsolete**. Starting 2026-07, `denfert-pizzeria`
is a **single-repo monorepo** that owns the backend, the customer app,
and the admin/kiosk web routes. `pizza-denfert-loyalty` is legacy and
will be archived. The future `tablet-qr-scanner` client will consume
this repo's backend over HTTPS — it will not host duplicated business
logic.

**Please read [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`DEPLOY.md`](./DEPLOY.md) instead.**
