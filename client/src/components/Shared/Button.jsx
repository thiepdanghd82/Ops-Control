/**
 * Button — canonical React wrapper over the .btn / .btn-* CSS classes
 * defined in styles/tokens.css (added in Phase 9A.3).
 *
 * Replaces ad-hoc `<button className="sc-btn">...</button>` patterns
 * scattered across 20+ tabs with a single API that composes variant +
 * size + busy state + optional icon. Legacy class names continue to
 * work (this is additive, not a breaking change) — new code should
 * use this wrapper.
 *
 * Props:
 *   variant  — 'primary' (default) | 'secondary' | 'danger' | 'ghost'
 *   size     — 'sm' | 'md' (default) | 'lg'
 *   icon     — optional leading icon (ReactNode)
 *   iconOnly — boolean; styles the button as a square icon container
 *   busy     — boolean; shows spinner + disables
 *   block    — boolean; stretches to full width
 *   leftIcon / rightIcon — semantic alternatives to `icon`
 *
 * Examples:
 *   <Button>Save</Button>
 *   <Button variant="danger" size="sm">Delete</Button>
 *   <Button variant="ghost" iconOnly icon={<SearchIcon/>} />
 *   <Button busy>Saving…</Button>
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon,
  leftIcon,
  rightIcon,
  iconOnly = false,
  busy = false,
  block = false,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) {
  // Uses the `.op-btn` namespace (see styles/tokens.css) to avoid
  // collision with the 3 legacy `.btn` systems present in
  // App.css / Settings.css / OrderEntry.css. Callers that still use
  // legacy `.btn` / `.btn-primary` keep working — this component
  // simply doesn't collide with them.
  const classes = [
    'op-btn',
    `op-btn-${variant}`,
    size === 'sm' ? 'op-btn-sm' : '',
    size === 'lg' ? 'op-btn-lg' : '',
    iconOnly ? 'op-btn-icon' : '',
    busy ? 'op-btn-busy' : '',
    block ? 'op-btn-block' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {leftIcon || icon}
      {!iconOnly && children}
      {rightIcon}
    </button>
  );
}
