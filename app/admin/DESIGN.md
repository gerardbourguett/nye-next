# Private schedule manager

An Operate surface for an allowlisted administrator to prepare and publish hourly
stream options. The editor precedes a ruled list of saved slots. Editing is inline
on the page; native confirmation protects unpublishing, and deletion expands an
explicit confirmation form. Drafts are clearly distinguished from published slots.

- Inherit the room/relay semantic background, foreground, muted, and border tokens
  and the existing emerald accent exactly. No global theme changes or new palette.
- Archivo carries fields, labels, errors, and tabular UTC times. Big Shoulders is
  reserved for the page heading. Controls maintain familiar shapes and focus.
- The local datetime input names the detected timezone, explains DST rejection,
  and previews UTC storage. Option order is explicit; the first is the default.
- Labels and providers remain visible alongside the source fields. Pending saves
  disable editing, failures preserve entered values, and successful creates reset
  the editor. Auth errors are generic and provide an owner-contact recovery path.
- Both themes use the shared tokens. The grid stacks on mobile, with no custom
  animation, modal editor, decorative chart, or invented account data.

Browser/keyboard and real authentication verification remain pending. See
`docs/streaming-setup.md` for setup, authorization boundaries, and launch checks.
