# AGENTS.md

## Project Orientation

Before making changes to this repository, read `README.md` to understand the project overview, goals, structure, and usage patterns. Use it as the primary reference for how the repository is organized and how its components are expected to work together.

## Development Guidelines

Read `CONTRIBUTING.md` before starting development work. It contains important development information, including workflow expectations, coding standards, and Git commit message requirements such as the Conventional Commit format.

## Local Server Testing

After using a local development server for testing, stop it before finishing. The user will start any local server they need themselves.

## Screenshot-Based Visual Checks

When modifying UI, canvas, 3D visualization, layout, styling, or other user-visible behavior, use the screenshot workflow documented in the `README.md` Screenshot section. Prefer `npm run screenshot` for Codex visual checks because it starts a temporary Vite server, captures desktop and mobile screenshots, and shuts the server down automatically; inspect the generated screenshots before finishing. Keep screenshot command parameters documented in `README.md` only to avoid duplicate instructions.

## Documentation Updates

When modifying code, also review `README.md`, `AGENTS.md`, `CHANGELOG.md`, `TODO.md` and `CONTRIBUTING.md` to determine whether they need to be updated.

Update these files when changes affect:

* Project behavior, features, or usage
* Setup, build, test, or run instructions
* Repository structure or development workflow
* Git commit message rules or contribution requirements
* Any information that would help future contributors understand or maintain the project

Do not leave documentation outdated when code changes alter how the project is used, developed, or maintained.

## Markdown Formatting

When writing or editing Markdown files, keep normal prose and list items on a single line unless a hard line break is semantically required. In Markdown, a single newline usually renders like a space, so avoid inserting visual-wrap line breaks in paragraphs, bullets, or similar text. Preserve intentional structure such as blank lines between paragraphs, code blocks, tables, and explicit line breaks.
