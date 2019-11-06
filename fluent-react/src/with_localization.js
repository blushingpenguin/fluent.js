import { createElement, useContext } from "react";
import FluentContext from "./context";

import hoistNonReactStatics from "hoist-non-react-statics";

export default function withLocalization(Inner) {
  function WithDisplay(props) {
    const { l10n } = useContext(FluentContext);
    return createElement(
      Inner,
      // getString needs to be re-bound on updates to trigger a re-render
      {
        getString: (id, args, fallback) => (
          l10n
            ? l10n.getString(id, args, fallback)
            : fallback || id
        ),
        ...props
      },
    );
  }

  WithDisplay.displayName = `WithLocalization(${displayName(Inner)})`;

  return hoistNonReactStatics(WithDisplay, Inner);
}

function displayName(component) {
  return component.displayName || component.name || "Component";
}
