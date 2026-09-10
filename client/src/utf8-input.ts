import type { ChangeEvent, CompositionEvent } from "react";
import { clampUtf8 } from "../../shared/utf8";

export function utf8Field(
  maxBytes: number,
  value: string,
  setValue: (value: string) => void,
) {
  return {
    value,
    maxLength: maxBytes,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if ((e.nativeEvent as InputEvent).isComposing) {
        setValue(e.target.value);
        return;
      }
      setValue(clampUtf8(e.target.value, maxBytes));
    },
    onCompositionEnd: (e: CompositionEvent<HTMLInputElement>) => {
      setValue(clampUtf8(e.currentTarget.value, maxBytes));
    },
  };
}
