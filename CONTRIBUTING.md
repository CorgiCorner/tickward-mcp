# Contributing to Tickward MCP

Thank you for helping improve the Tickward MCP Worker.

## Development setup

Use the Node.js and npm versions declared in `.nvmrc` and `devEngines`.

```sh
nvm use
npm ci
npm run check
```

`npm run check` verifies the development runtime, formatting, types, tests,
public-snapshot boundaries, and the Cloudflare Worker dry run. Run it before
opening a pull request.

## Pull requests

- Keep changes focused and include tests for behavior changes.
- Update the README when configuration or public behavior changes.
- Use English for code, documentation, commit messages, and pull requests.
- Do not include credentials, production data, or private infrastructure names.
- Add a changelog entry for user-visible changes.

By contributing, you agree that your contribution is licensed under the
GNU Affero General Public License v3.0 only.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.
