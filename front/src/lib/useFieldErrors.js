import { useCallback, useState } from 'react';

/**
 * Field-level validation errors from the API, ready to hand to <Field>.
 *
 * A failed DTO comes back with `details.fields`, one Persian sentence per
 * field keyed by its path ("title", "items.0.quantity"). Forms used to show
 * only the first of them in a toast, so a customer with three wrong fields
 * fixed one, resubmitted, and only then learned about the next. This puts
 * every message under its own input at once.
 *
 *   const fieldErrors = useFieldErrors();
 *   ...catch (error) { if (!fieldErrors.capture(error)) toast.error(...) }
 *   <Field label="عنوان" error={fieldErrors.of('title')}>
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState({});

  // Returns true only when every message is now visible under an input, so
  // the caller can skip its own toast. `known` lists the fields this form
  // actually renders: if the API complains about one that has no input
  // here, the caller still gets false and shows the message itself - an
  // error must never end up highlighted nowhere.
  const capture = useCallback((error, known) => {
    const fields = error?.details?.fields;
    if (
      error?.code === 'VALIDATION_FAILED' &&
      fields &&
      typeof fields === 'object' &&
      Object.keys(fields).length
    ) {
      setErrors(fields);
      const allVisible =
        !known || Object.keys(fields).every((path) => known.includes(path));
      // Bring the first message into view - on a phone it is easily below
      // the fold, and an error the customer cannot see might as well not
      // be there.
      requestAnimationFrame(() => {
        document
          .querySelector('.field-error')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return allVisible;
    }
    setErrors({});
    return false;
  }, []);

  const clear = useCallback(() => setErrors({}), []);

  // Retires one message while leaving the rest. Forms whose inputs carry
  // the DTO field as their `name` call it from the form's onInput, so a
  // message disappears as soon as that field is edited.
  const clearField = useCallback((name) => {
    setErrors((current) => {
      if (!(name in current)) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  const of = useCallback((name) => errors[name], [errors]);

  return { errors, of, capture, clear, clearField };
}
