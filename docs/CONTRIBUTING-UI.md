# UI conventions

OpenBimmer is a dark, instrument-style app. Keep every screen consistent with these rules.

## Building blocks

- Theme: `@/theme` exports `colors`, `fonts`, `radius`, `space`, `type`. Never hard-code colors or font sizes.
- Numbers (live values, results, stats) use the condensed numeric fonts: `type.hero`, `type.display`, `type.value`, `type.valueSmall`, `type.mono`. Text uses Inter via `type.title`, `type.headline`, `type.body`, `type.bodyStrong`, `type.callout`, `type.caption`, `type.label`.
- Layout: `Screen` (scroll container with safe areas) and `Header` from `@/components/screen`. Pushed screens (`log/[id]`, `adapters`, ...) get a native header from the root stack, so they use `Screen` without `Header`.
- Components in `@/components/ui`: `Card`, `Group` + `Row` (settings style lists), `Button` (primary, secondary, ghost, danger), `IconButton`, `Segmented`, `Pill`, `Label`, `SectionTitle`, `EmptyState`, `Notice`, `tap()` for selection haptics.
- Icons: `Icon` from `@/components/icon` with names from `@/components/icon-names.ts` (SF Symbols on iOS, Material Symbols on Android).
- Gauges: `RadialGauge` from `@/components/radial-gauge`.

## Style

- One accent color (`colors.accent`) for primary actions and live data. `good`, `warn`, `danger` only for status.
- Hairline borders, no drop shadows, no gradients, no emojis, no decorative blobs.
- Units always come from `useSettings((s) => s.units)` and `convert` / `convertChannel` in `@/lib/units`.
- Empty and error states always explain what to do next in one sentence.
- Destructive actions ask for confirmation with `Alert.alert`.
- Code: no comments unless something is truly non-obvious, TypeScript strict, function components, zustand for state.
