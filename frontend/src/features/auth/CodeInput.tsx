/**
 * A 6-digit one-time code. One field rather than six boxes: it pastes, autofills from
 * the SMS (`one-time-code`) and works with every screen reader without extra wiring.
 */
export function CodeInput({
  id,
  value,
  onChange,
  autoFocus = false,
  className = 'au__input au__code',
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9 ]*"
      maxLength={7}
      placeholder="123456"
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/[^\d ]/g, ''))}
      required
    />
  );
}
