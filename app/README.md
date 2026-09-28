# IT Ticket Board — Source

The React + TypeScript source for IT Ticket Board. Builds into a single self-contained HTML file for offline use or team collaboration.

## Quick Start

```bash
npm ci
npm run dev        # Start dev server with hot reload
npm run lint       # Check code quality with oxlint
npm run build      # Compile to dist/
npm run build:page # Build into ../index.html (main page)
```

## Architecture

Built with **React 19**, **TypeScript**, and **Vite**. Uses:
- **Radix UI** primitives for accessible components
- **TailwindCSS** for styling
- **React Hook Form** + Zod for form validation
- **Supabase.js** for optional database integration
- **Embla Carousel** for carousels
- **Sonner** for toast notifications
- **date-fns** for date utilities

## Pages

Each page is a React component, hash-routed from `App.tsx`:

| Path | Component | Purpose |
|------|-----------|---------|
| `#/home` | `HomePopouts.tsx`, `HomeInsights.tsx` | Ticket overview, KPI cards, operations dashboard |
| `#/tickets` | `App.tsx` | Kanban, list, split, and other ticket views |
| `#/search` | `SearchPage.tsx` | Full-text search and filtering |
| `#/inventory` | `InventoryPage.tsx` | Assets, stock, device health |
| `#/explore/:queue/:id` | `ExplorePage.tsx` | Detailed ticket view |
| `#/new` | `NewTicketDialog.tsx` | Create ticket |
| `#/signin` | `SignInPage.tsx` | Supabase authentication |

## State Management

- **Local data**: Stored in `localStorage` with keys prefixed by page (e.g., `tickets`, `assets`, `settings`)
- **Supabase integration**: Optional; when connected, syncs to a PostgreSQL database
- **Persistence**: `backup.ts` handles download/restore of all data as JSON

## Styling

Each component has its own `.css` file when it needs scoped styles. Inline styles are used sparingly for one-off adjustments. All colors use CSS variables from `:root` with dark/light theme support via `@media (prefers-color-scheme: dark)`.

## Linting

Oxlint (Rust-based) checks code quality. Rules are in `.oxlintrc.json`. Run before commit:

```bash
npm run lint
```

## Building for Distribution

The `build:page` script compiles the React app and inlines all CSS/JS into a single `index.html`:

```bash
npm run build:page
```

This creates `../index.html` (one level up from `app/`), which is the file that ships.
