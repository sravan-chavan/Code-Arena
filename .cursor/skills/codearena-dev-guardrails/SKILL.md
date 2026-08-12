---
name: codearena-dev-guardrails
description: Enforces CodeArena development constraints for Docker, Makefile, RabbitMQ, Judge0, service separation, and testing. Use when implementing features, fixing bugs, adding dependencies, modifying architecture, or reviewing changes in CodeArena.
---

# CodeArena Development Guardrails

Apply these rules on every CodeArena task unless the user explicitly overrides them.

## DO NOT

- create additional README files
- introduce technologies without approval
- modify architecture without approval
- create duplicate services
- install dependencies unnecessarily
- execute user code inside Express
- bypass RabbitMQ for contest submissions
- bypass Docker/Judge0
- put secrets into Git
- create random utility folders
- rewrite unrelated files

## ALWAYS

- use Docker
- use Makefile commands
- preserve existing architecture
- write tests for business logic
- keep services separated
- use environment variables
- update root README when developer workflow changes
- explain changed files
- run relevant tests
- verify Docker builds

## Workflow

When completing a change:

1. **Scope** — Touch only files required for the task. Ask before adding tech, changing architecture, or new services.
2. **Implement** — Route contest submissions through RabbitMQ; run user code via Docker/Judge0, not Express. Read secrets from environment variables.
3. **Test** — Add or update tests for business logic. Run relevant tests via Makefile.
4. **Verify** — Confirm Docker builds succeed via Makefile.
5. **Document** — Update the root README only when developer workflow changes. Summarize changed files in the response.

## Approval gates

Stop and ask the user before:

- Introducing a new technology or dependency
- Changing system architecture
- Creating a new service that may duplicate an existing one
