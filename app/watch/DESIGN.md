# Viewing room

An Operate surface inside the relay's established visual system. Viewers choose
one stream for the current hour, load its player deliberately, and see alternatives
without leaving the running order. It is not a new visual identity.

- The first viewport pairs the player with a compact option list; on smaller
  screens the options follow the player. Upcoming hours form a ruled list below.
- Reuse `--background`, `--foreground`, `--muted`, `--muted-foreground`, and
  `--border` unchanged. The existing emerald-500 marks selection and primary
  actions, not status claims. The native provider iframe owns its own appearance.
- Existing Big Shoulders is used for the page title only; Archivo carries controls
  and text. Square controls, visible focus, native links, and no decorative motion.
- Loading, no programming, upcoming, ended, stale, and fetch-error states contain
  truthful guidance. Scheduled is not a synonym for live. No provider metadata,
  lineup, audience count, or availability is invented.
- Twitch falls back to external viewing under its minimum width or without HTTPS;
  the page does not create an undersized embed or horizontal scrolling to fit it.
- Visual/browser verification remains pending. Source inspection and local unit,
  lint, and type checks do not establish contrast or rendered layout compliance.

Shared route-local styles: `components/streams/surface.module.css`. Existing home,
root layout, global styles, relay data, and countdown behavior are unchanged.
