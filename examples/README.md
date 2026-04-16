# Examples

This directory contains manually runnable examples used by the validation repo.

They are kept separate from the automated `test/` fixtures so they can be explored without changing the aggregate runtime comparison suite.

Current contents:

- `custom-app`: application example used to validate custom task and middleware integration
- `library-workspace`: application and library workspace example used to validate cross-project resolution
- `sample.ts.app`: generated OpenUI5 TypeScript application used to validate a realistic app build and serve scenario with the sibling Bun fork and sibling CLI fork
- `self-contained-bundler-spike`: narrow HTML+ESM comparison app for the `npm run spike:self-contained-bundler` experiment
