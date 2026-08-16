export function capAt(value, maximum) {
  if (value > maximum) {
    return maximum;
  }
  return value;
}
