# General physics web simulations

Interactive 2D simulations following the chapters of Halliday & Resnick, *Fundamentals of Physics*.
Korean and English UI.

- Curriculum and per-chapter specs: [docs/curriculum.md](docs/curriculum.md)
- Shell, engines and scene contract: [docs/design.md](docs/design.md)

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics and core unit tests
npm run build      # static site in dist/
```

## Deploy

- GitHub Pages: pushing to `main` runs `.github/workflows/deploy.yml` (test → build → deploy).
  Enable Pages with source "GitHub Actions" in the repository settings.
- Department web server: copy `dist/` anywhere. The build uses relative paths and hash routes,
  so it works from any sub-path without server configuration.

## Add a chapter

1. Create `src/sims/chNN/` with `physics.ts` (pure, tested), `scene.ts` (a `Scene`), `index.ts` (a `SimPage`)
   and `i18n.{ko,en}.json`.
2. Set `load: () => import('./chNN').then((m) => m.default)` for the chapter in `src/sims/registry.ts`.
3. Add tests under `tests/` comparing the physics with analytic results.
