# Repository instructions

Before changing this repository, read `HANDOFF.md` completely and follow it as the controlling project handoff.

Non-negotiable rules:

- Preserve the product boundary: historical data reference only; no price prediction or trading instruction.
- Never modify a quality score without the evidence required by `docs/quality-standard-95.md`.
- Never touch, stage, delete, or commit the user-owned untracked files `wechat-ai-transition-article.html` and `worker.js`.
- Never use `git add .`, force-push, `git reset --hard`, or weaken tests/budgets to obtain a pass.
- Work on one bounded task at a time. Run the required tests, push, wait for CI, and verify production before claiming completion.
- Do not perform the high-judgment tasks listed in `HANDOFF.md` section 8 without new user authorization.
