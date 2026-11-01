# Contributing to Generations

Thank you for your interest in contributing. This guide explains how to propose
changes.

## Ground rules

- Be respectful. All participation follows our [Code of Conduct](CODE_OF_CONDUCT.md).
- Discuss larger changes in an issue before writing code.
- Never commit secrets, service-account keys, `.env` files or personal data.
- Report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Branching model

- `main` is the production branch. It only contains reviewed, approved releases.
- `development` is the default branch and is deployed to UAT.
- Work happens on feature branches created from `development`. Name them after
  the change, for example `feature/user-invites` or `fix/login-error-message`.
- Feature branches run no CI. Run `npm run lint` and `npm test` locally before
  opening a pull request.
- Changes reach `development` through a reviewed pull request with passing CI.
  Releases reach `main` through a pull request from `development`.

## Development workflow

1. Fork the repository (external contributors) or create a branch.
2. Install dependencies: `npm ci`.
3. Make your change. Keep it focused on one logical task.
4. Run the checks locally:

   ```bash
   npm run lint
   npm run test:unit
   npm run build
   ```

5. Update documentation (`README.md`, `docs/`) when behavior, configuration or
   architecture changes.
6. Open a pull request with a clear description of what changed and why.

## Coding guidelines

- Use Ionic components wherever possible and keep custom styling minimal.
- Avoid new dependencies. If one is truly needed, explain why in the pull request.
- Use the modular Firebase JS SDK directly.
- Authorization must be enforced by Firestore Security Rules, never only in the UI.
- Stay within the Firebase Spark (free) plan unless a maintainer agrees otherwise.
- Formatting is handled by Prettier and linting by ESLint (`npm run lint:fix`).

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/), for example
`feat: add registration page` or `fix: handle expired reset link`.

Pull requests are squash-merged, so the **pull request title** becomes the
commit message on `development` and must follow the same format. Release Please
reads these titles to choose the next version (`fix:` → patch, `feat:` → minor,
`feat!:` or `BREAKING CHANGE:` → major) and to write `CHANGELOG.md`. Titles
like `docs:`, `ci:` or `chore:` do not change the version.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
