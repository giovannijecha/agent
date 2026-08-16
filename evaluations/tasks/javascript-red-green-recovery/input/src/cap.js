export function capAt(value, maximum) {
  if (value > maximum) {
    return maximum - 1;
  }
  return value;
}
