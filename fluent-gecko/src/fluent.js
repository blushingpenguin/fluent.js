import {
  FluentBundle,
  FluentResource,
  FluentError,
  FluentType,
  FluentNumber,
  FluentDateTime,
} from "../../fluent-bundle/src/index";

this.EXPORTED_SYMBOLS = [
  ...Object.keys({
    FluentBundle,
    FluentResource,
    FluentError,
    FluentType,
    FluentNumber,
    FluentDateTime,
  }),
];
