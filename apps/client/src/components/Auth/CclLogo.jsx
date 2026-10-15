/**
 * CclLogo — the CCL mark (wordmark + square + disc) as inline SVG, traced
 * from the brand PNG so it stays crisp at any size and can be recoloured:
 *
 *   - letters and square: currentColor
 *   - disc: CCL blue #0057b8 by default; override with a CSS rule on
 *     `.ccl-logo-accent` (CSS beats the fill attribute)
 *   - the quarter where the disc meets the square is a cut-out, so the
 *     surface behind shows through on light and dark backgrounds alike.
 *
 * Geometry: the disc is centred on the square's top-right corner with a
 * radius of 0.584 × the square's side, as in the source artwork.
 */

// One "C": outer bowl, flat right terminals, counter shifted right. Fitted
// to the source artwork (pixel IoU 0.94 at 4×; square and L 0.96–0.97).
const C_PATH =
  'M24.8 40.1V35.8C24.8 34.04 23.36 32.6 21.6 32.6H13.6C7.86 32.6 3.2 38.87 3.2 46.6' +
  'C3.2 54.33 7.86 60.6 13.6 60.6H21.6C23.36 60.6 24.8 59.16 24.8 57.4V53H24' +
  'C22.8 53.5 19 54.8 17.5 54.8C12.97 54.8 9.3 51.15 9.3 46.65C9.3 42.15 12.97 38.5 17.5 38.5' +
  'C19 38.5 22.8 39.7 24 40.1Z';

export default function CclLogo({ className, title = 'CCL' }) {
  return (
    <svg className={className} viewBox="2 9 149 65" role="img" aria-label={title}>
      <path fill="currentColor" d={C_PATH} />
      <path fill="currentColor" d={C_PATH} transform="translate(25.3 0)" />
      <path fill="currentColor" d="M55.8 32.6h6.6v21.6h12v6.6H55.8z" />
      <path fill="currentColor" d="M86 33h16.8a23.6 23.6 0 0 0 23.6 23.6v16.8H86z" />
      <path
        className="ccl-logo-accent"
        fill="#0057b8"
        d="M126.4 33v23.6a23.6 23.6 0 1 0-23.6-23.6z"
      />
    </svg>
  );
}
