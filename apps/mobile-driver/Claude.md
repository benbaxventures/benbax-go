# Tech Stack

- Frontend: Next.js, React, Tailwind CSS
- Design Language: Modern, clean, mobile-first, high contrast (similar to Yango interface)

# UI & Animation Guidelines

- Always prioritize framer-motion or standard Tailwind transitions for animations.
- Animation style: Smooth spring physics (`type: "spring", stiffness: 300, damping: 30`).
- Use layout animations (`layoutId`) for seamless mobile sheet transitions (like expanding a map card).
- Do not generate pure CSS keyframes if Tailwind utilities can achieve the effect.

# Claude Code Token Discipline

- DO NOT rewrite entire code files if editing a single function; provide concise git diffs or specific lines.
- Always use localized file context (`@components/MapCard.tsx`) instead of reading entire directories.
- Run `npm run lint` or `npm run build` incrementally after edits to verify output.
