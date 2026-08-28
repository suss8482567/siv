/** Inline "Gilded Hex Seal" art (docs/ART_STYLE.md): renders raw SVG source at a fixed size. */
export function ArtIcon(props: {
  art?: string;
  size: number;
  label?: string;
}) {
  if (!props.art) return null;
  return (
    <span
      class="art-icon"
      style={{ width: `${props.size}px`, height: `${props.size}px`, fontSize: `${props.size}px` }}
      role={props.label ? 'img' : undefined}
      aria-label={props.label}
      dangerouslySetInnerHTML={{ __html: props.art }}
    />
  );
}
