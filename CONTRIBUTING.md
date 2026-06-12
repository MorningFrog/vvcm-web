# Developer Guide

## Commit Message Convention

This repository requires all commit messages to follow the **Conventional Commits** specification.

The commit message format is:

```text
<type>(<scope>): <description>
```

Where:

* `type`: the type of change, required
* `scope`: the affected area, optional
* `description`: a short description of the change, required

Examples:

```text
feat(algorithm): add VVCM forward kinematics implementation
fix(python): correct example script for Python bindings
docs: update README
refactor: simplify VVCM stability filtering logic
```

Common commit types:

| Type       | Description                                           |
| ---------- | ----------------------------------------------------- |
| `feat`     | A new feature                                         |
| `fix`      | A bug fix                                             |
| `docs`     | Documentation changes                                 |
| `style`    | Code style changes that do not affect logic           |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `perf`     | Performance improvements                              |
| `test`     | Adding or updating tests                              |
| `build`    | Build system or dependency changes                    |
| `ci`       | CI/CD configuration changes                           |
| `chore`    | Other maintenance changes                             |
| `revert`   | Reverting a previous commit                           |

For breaking changes, mark them clearly:

```text
feat(api)!: remove deprecated method
```

## Local Development

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <repository-name>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

This will start the development server and please open the application in your browser. The server will automatically reload when you make changes to the code.
