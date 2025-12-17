import test from "node:test";
import assert from "node:assert/strict";

import { _linkLabelText, _linkLabelAnchorX, _linkLabelAnchorY } from "../src/sankeyPlus.js";

test("node-hover: if hovered node is target, show value at source end (neighbor)", () => {
  const pathStart = { name: "path_start", index: 1, column: 0 };
  const search = { name: "search ○", index: 2, column: 1 };

  const link = { source: pathStart, target: search, value: 24 };

  assert.equal(_linkLabelText(link, "source", "node", search), "24%");
  assert.equal(_linkLabelText(link, "target", "node", search), "");
  assert.equal(_linkLabelText(link, "self", "node", search), "");
});

test("node-hover: if hovered node is source, show value at target end (neighbor)", () => {
  const search = { name: "search ○", index: 2, column: 1 };
  const schedule = { name: "schedule ◐", index: 3, column: 2 };

  const link = { source: search, target: schedule, value: 15 };

  assert.equal(_linkLabelText(link, "source", "node", search), "");
  assert.equal(_linkLabelText(link, "target", "node", search), "15%");
});

test("node-hover: backlinks also follow neighbor-end rule (ignore direction)", () => {
  const a = { name: "A", index: 10, column: 3 };
  const b = { name: "B", index: 11, column: 1 };

  const backlink = { source: a, target: b, value: 7 };

  // Hovering target => show at source end (neighbor)
  assert.equal(_linkLabelText(backlink, "source", "node", b), "7%");
  assert.equal(_linkLabelText(backlink, "target", "node", b), "");

  // Hovering source => show at target end (neighbor)
  assert.equal(_linkLabelText(backlink, "source", "node", a), "");
  assert.equal(_linkLabelText(backlink, "target", "node", a), "7%");
});

test("node-hover: self-loop label stays inside loop; source/target labels empty", () => {
  const n = { name: "schedule ○", index: 42, column: 2 };
  const self = { source: n, target: n, value: 10 };

  assert.equal(_linkLabelText(self, "self", "node", n), "10%");
  assert.equal(_linkLabelText(self, "source", "node", n), "");
  assert.equal(_linkLabelText(self, "target", "node", n), "");
});

test("label X anchor: replaced links fall back to stitched x0/x1 when node coords are missing", () => {
  const link = {
    linkType: "replaced",
    source: { name: "path_start" }, // no x1
    target: { name: "search ◐" },   // no x0
    x0: 40,
    x1: 120,
  };

  assert.equal(_linkLabelAnchorX(link, "source"), 42);
  assert.equal(_linkLabelAnchorX(link, "target"), 118);
});

test("label Y anchor: circular target can be placed above or below the stroke", () => {
  const link = {
    width: 10,
    circular: true,
    circularPathData: { targetY: 100, sourceY: 50 },
  };
  assert.equal(_linkLabelAnchorY(link, "target", "below"), 100 + 5 + 12);
  assert.equal(_linkLabelAnchorY(link, "target", "above"), 100 - 5 - 4);
});


