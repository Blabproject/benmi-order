import type { ComponentProps } from 'react';

type ChoiceInputProps = Omit<ComponentProps<'input'>, 'type'> & { type: 'radio' | 'checkbox' };

// Keep native form values and picker semantics for settings controllers.
export function ChoiceInput({ type, ...props }: ChoiceInputProps) {
  return <input data-slot={type} type={type} {...props} />;
}
