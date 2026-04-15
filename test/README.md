# Test Apps

This directory contains copied UI5 application fixtures from the sibling UI5 CLI repository.

The layout is grouped by concern instead of by original CLI package path:

- `builder`
- `cli`
- `fs`
- `project`
- `server`
- `sourcemaps`

Run the aggregate fixture suite from the repository root with:

```sh
npm run test:fixtures
```

Run the same suite on Node with:

```sh
npm run test:fixtures:node
```

Compare both runtimes with:

```sh
npm run compare:fixtures
```

Profile a selected fixture repeatedly from a clean test state with:

```sh
npm run profile:fixture:bun -- --only project/application.h --repeat 3
```

For build fixtures, the profiler also reports the split between fixture preparation time and the actual `ui5 build` execution time.

Target a subset of fixture steps in either runtime suite with `--only`, for example:

```sh
npm run test:fixtures -- --only project/application.h
npm run test:fixtures:node -- --only parity:fs/glob
```

The suite builds the copied fixtures that are standalone UI5 projects, runs runtime-matched parity checks against the copied `cli`, `fs`, and `project` fixtures using the CLI fork modules directly, and serves the copied server fixture.

The `project/err.application.a` fixture is intentionally treated as an expected failure because it is an error-case fixture in the original CLI test set.
