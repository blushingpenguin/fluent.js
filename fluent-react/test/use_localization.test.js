import React from "react";
import TestRenderer from "react-test-renderer";
import { FluentBundle, FluentResource } from "../../fluent-bundle/src";
import { LocalizationProvider, withLocalization, useLocalization } from "../src";

function TestComponent() {
  const getString = useLocalization();
  return getString("test");
}

function TestComponentWithFallback() {
  const getString = useLocalization();
  return getString("not_found_test", undefined, "fallback");
}

describe("useLocalization", () => {
  const testBundle = new FluentBundle("en-US", { useIsolating: false });
  testBundle.addResource(new FluentResource("test = translated test string"));

  test("render inside of a LocalizationProvider", () => {
    const renderer = TestRenderer.create(
      <LocalizationProvider bundles={[testBundle]}>
        <TestComponent />
      </LocalizationProvider>
    );
    expect(renderer.toJSON()).toMatchInlineSnapshot(`"translated test string"`);
  });

  test("render outside of a LocalizationProvider", () => {
    const renderer = TestRenderer.create(<TestComponent />);
    expect(renderer.toJSON()).toMatchInlineSnapshot(`"test"`);
  });

  test("render inside of a LocalizationProvider with fallback", () => {
    const renderer = TestRenderer.create(
      <LocalizationProvider bundles={[testBundle]}>
        <TestComponentWithFallback />
      </LocalizationProvider>
    );
    expect(renderer.toJSON()).toMatchInlineSnapshot(`"fallback"`);
  });

  test("render outside of a LocalizationProvider with fallback", () => {
    const renderer = TestRenderer.create(
      <TestComponentWithFallback />
    );
    expect(renderer.toJSON()).toMatchInlineSnapshot(`"fallback"`);
  });

  test("render with context changes", () => {
    const renderer = TestRenderer.create(
      <LocalizationProvider bundles={[]}>
        <TestComponent />
      </LocalizationProvider>
    );

    expect(renderer.toJSON()).toMatchInlineSnapshot(`"test"`);

    renderer.update(
      <LocalizationProvider bundles={[testBundle]}>
        <TestComponent />
      </LocalizationProvider>
    );

    expect(renderer.toJSON()).toMatchInlineSnapshot(`"translated test string"`);
  });
});
