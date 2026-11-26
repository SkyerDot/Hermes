// @vitest-environment jsdom
/**
 * F4 (wave-2/3 checkpoint §6.11): ICU *arguments* (`{count} tokens compressed`) must
 * pass through the real formatter and be swapped for React nodes. `t.rich` takes
 * functions only for <tag> placeholders, so `code: (chunks) => <code/>` rendered a
 * function ("Functions are not valid as a React child") and a node is a type error.
 * The helper passes sentinels through the real ICU formatter and swaps them for nodes.
 */
import React from "react";
import { render } from "@testing-library/react";
// The global setup mocks next-intl; its formatter lives in use-intl.
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { interpolateNodes, nodeArgs } from "@/shared/utils/interpolateNodes";
import en from "@/i18n/messages/en.json";

const tc = createTranslator({
  locale: "en",
  messages: en as never,
  namespace: "common.usageEvidence",
});
const tm = createTranslator({ locale: "en", messages: en as never, namespace: "modelCatalog" });

describe("interpolateNodes", () => {
  it("renders a single ICU argument as a <code> node", () => {
    const { container } = render(
      <p>
        {interpolateNodes(
          (tc as never as (k: string, v: object) => string)(
            "compressedTokens",
            nodeArgs(["count"])
          ),
          {
            count: <code>128</code>,
          }
        )}
      </p>
    );
    expect(container.textContent).toBe("128 tokens compressed");
    expect(container.querySelector("code")?.textContent).toBe("128");
  });

  it("handles several arguments in one message (visibilityCounts)", () => {
    const { container } = render(
      <p>
        {interpolateNodes(
          (tm as never as (k: string, v: object) => string)(
            "visibilityCounts",
            nodeArgs(["visible", "hidden", "total"])
          ),
          {
            visible: <code>8</code>,
            hidden: <code>2</code>,
            total: <code>10</code>,
          }
        )}
      </p>
    );
    expect([...container.querySelectorAll("code")].map((c) => c.textContent)).toEqual([
      "8",
      "2",
      "10",
    ]);
    expect(container.textContent).not.toMatch(/\u0000/);
  });

  it("ignores prototype keys and renders nothing for a sentinel without a node", () => {
    const text = `a ${nodeArgs(["toString"]).toString} b ${nodeArgs(["missing"]).missing} c`;
    const { container } = render(<p>{interpolateNodes(text, {})}</p>);
    expect(container.textContent).toBe("a  b  c");
  });
});
