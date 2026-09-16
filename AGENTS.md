# Project instructions

## Mission

Build the smallest coherent product that proves the hackathon idea. Prefer a working end-to-end slice over speculative infrastructure or polish.

## Before changing code

- Inspect the existing project structure, package scripts, dependencies, and nearby patterns first.
- Reuse an existing framework, component, utility, or service before adding a new dependency.
- Keep the request flow clear: UI/client → API or transport → application logic → data or integration boundary.
- Call out assumptions when the product requirement is still unclear.

## Change discipline

- Do not reinvent the wheel: use the platform and libraries already present when they meet the requirement.
- Keep changes small and easy to review. Avoid unrelated refactors and premature abstractions.
- Treat external input and third-party responses as untrusted; validate at boundaries.
- Never commit credentials, API keys, tokens, personal data, or local machine configuration.

## Verification

- Run the narrowest relevant checks after each meaningful change, then the project’s documented test, lint, typecheck, and build commands when they exist.
- Verify the actual user path and important failure states, not only that the app compiles.
- Review the diff before committing.

## UI

- Reuse the project’s existing design system and components.
- Preserve keyboard access, visible focus, readable contrast, responsive layout, and useful loading, empty, and error states.
- Avoid decorative complexity that does not help the demo or the user.

## Collaboration

- Keep setup instructions and required environment variables in `README.md`.
- Put secrets in a local `.env` file and document only placeholder names in `.env.example`.
- Make commits focused and describe the user-visible outcome.
