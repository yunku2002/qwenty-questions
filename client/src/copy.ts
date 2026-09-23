export function copyInput(input: HTMLInputElement) {
  input.focus();
  input.select();
  return document.execCommand("copy");
}
