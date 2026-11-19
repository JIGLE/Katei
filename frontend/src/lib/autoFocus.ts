// Focusing a text field on a touch screen opens the on-screen keyboard,
// which covers half the sheet before the person has read it. Only move
// focus into a field automatically where there is a hardware keyboard
// and a fine pointer (desktop, laptop, tablet with trackpad).
export function canAutoFocusField(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
