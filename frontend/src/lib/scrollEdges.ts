/**
 * Which edges of a horizontally scrolling strip hide more content — used to fade those
 * edges so people can tell there is more to scroll to. One pixel of slack absorbs the
 * fractional scroll positions browsers report on high-density screens.
 */
export function scrollEdges(el: { scrollLeft: number; scrollWidth: number; clientWidth: number }): {
  start: boolean;
  end: boolean;
} {
  const hidden = el.scrollWidth - el.clientWidth;
  if (hidden <= 1) return { start: false, end: false };
  return { start: el.scrollLeft > 1, end: el.scrollLeft < hidden - 1 };
}
