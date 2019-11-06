import { useContext } from "react";
import FluentContext from "./context";

function dummyGetString(id, args, fallback) {
  return fallback || id;
}

/**
 * The useLocalization() hook returns the getString function from the current
 * fluent context. If there is no current fluent context then it returns a
 * function that just returns the same string that was passed to it on input.
 *
 * For example:
 *
 * const getString = useLocalization();
 * const translated = getString("to be translated");
 */
export default function useLocalization() {
  const { l10n } = useContext(FluentContext);
  return l10n ? l10n.getString : dummyGetString;
}
