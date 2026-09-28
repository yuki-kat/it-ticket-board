# Contributing

Thanks for considering a contribution! This project is open to improvements, bug fixes, and feature suggestions.

## How to Contribute

### Report a Bug

1. Check [existing issues](https://github.com/yuki-kat/it-ticket-board/issues) to avoid duplicates
2. Open a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs. actual behavior
   - Browser/OS if relevant

### Suggest a Feature

1. Check [existing issues](https://github.com/yuki-kat/it-ticket-board/issues) first
2. Open an issue with the **feature request** label
3. Describe the use case and expected behavior

### Submit Code

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** in `app/src/`
4. **Test locally:**
   ```bash
   cd app
   npm ci
   npm run dev        # Try it live
   npm run lint       # Check code quality
   npm run build      # Build for production
   ```
5. **Run tests:**
   ```bash
   cd ../tests
   npm ci
   npm test
   ```
6. **Rebuild the page:**
   ```bash
   cd ../app
   npm run build:page  # This updates index.html
   ```
7. **Commit both source and built files:**
   ```bash
   git add app/src/ app/dist/ index.html
   git commit -m "Clear description of your change"
   ```
8. **Push and open a pull request** to `main`

## Development Setup

### Requirements

- **Node.js 22+** (or check `app/package.json` for pinned version)
- **Chrome** (for browser tests)
- **Git**

### Project Structure

```
app/                    # React + TypeScript source
├── src/
│   ├── App.tsx         # Main component & ticket views
│   ├── InventoryPage.tsx  # Asset & stock inventory
│   ├── HomePopouts.tsx # Dashboard widgets
│   └── ...other pages
├── dist/               # Built app (output)
└── package.json        # Dependencies & scripts

tests/                  # Browser automation (Playwright)
├── home.test.ts        # Home page tests
├── tickets.test.ts     # Ticket board tests
└── ...other tests

index.html              # Built single-file output (don't edit)
```

### Code Standards

- **TypeScript** — All source uses strict type checking
- **React** — Functional components, hooks, no class components
- **Styling** — CSS modules per component when needed; inline for small fixes
- **Naming** — camelCase for variables/functions, PascalCase for components
- **Linting** — Run `npm run lint` before committing (uses oxlint)

### What Gets Tested

The test suite checks:
- Home page totals, KPI cards, and queue navigation
- All dialog popups (open, close, keyboard use)
- Ticket views (Kanban, list, split, etc.)
- Page navigation (Back, Forward, URL changes)
- Inventory and asset tracking
- Exports (CSV, Excel)
- Data persistence (local storage)

**Run tests:** `cd tests && npm test`  
**View in browser:** `cd tests && npm run test:headed`

## PR Guidelines

- **Clear title:** What does this change do?
- **Description:** Why is this change needed? What problem does it solve?
- **Small PRs** — Easier to review and merge. Break large features into stages.
- **Tests pass** — GitHub runs tests on every PR. Ensure ✅ **Browser tests** are green.
- **One concern per PR** — Don't mix refactoring with new features.

## Code Review

PRs are reviewed for:
- **Correctness** — Does it work? Are there edge cases?
- **Style** — Does it match project conventions?
- **Performance** — Any unnecessary re-renders or loops?
- **Accessibility** — Are ARIA labels correct? Does keyboard nav work?
- **Tests** — Are all new features tested?

## Questions?

- Open an **issue** for questions about the codebase
- Check **existing issues** for common questions
- Review the **README** for architecture details

## License

By contributing, you agree your work will be licensed under the MIT License (see LICENSE file).

---

**Thanks for helping make IT Ticket Board better!** 🎉
