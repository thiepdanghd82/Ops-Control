// Touch-first button primitive — Sprint MES-2.6b. ≥80×80px, 3 variants.
export default function BigButton({ variant = 'primary', disabled, onClick, children, ...rest }) {
  const cls = `kiosk-btn kiosk-btn-${variant}${disabled ? ' kiosk-btn-disabled' : ''}`;
  return (
    <button
      type="button"
      className={cls}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
