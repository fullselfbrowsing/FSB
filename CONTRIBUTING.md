# Contributing to FSB

Thank you for contributing to FSB.

## Start With an Issue

Open a GitHub Issue before beginning a substantial feature, behavior change, or architectural change. This lets maintainers confirm the direction and avoid duplicate work.

Small documentation corrections and focused fixes can be submitted directly as a pull request.

## Set Up Locally

Follow the Local Development Setup section in the README. It covers prerequisites, installation, and how to run FSB during development.

## Before Opening a Pull Request

1. Keep changes focused and explain the user visible impact.
2. Update relevant documentation when behavior or configuration changes.
3. Run the checks that cover the change. For general changes, run:

```sh
npm run validate:extension
npm test
npm run test:mcp-smoke
```

4. Link the related Issue and describe what you tested in the pull request.

## Design Changes

Anything people see follows [DESIGN.md](DESIGN.md) and the design system in [design-system/](design-system/README.md): the palettes, tokens, type, motion, icons and copy rules, plus one page per surface. Run `npm run test:design` (part of `npm test`) before opening a pull request that changes a stylesheet, a token or the design docs. If a change alters a rule that several surfaces follow, update the matching page and add a decision record in `design-system/decisions/`.

## Security

Do not report security vulnerabilities in public Issues or pull requests. Contact a maintainer privately through GitHub so that responsible disclosure can be arranged.
