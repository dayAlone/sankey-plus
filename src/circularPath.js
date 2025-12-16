import {min, linkHorizontal} from "d3";

import { selfLinking, onlyCircularLink } from "./linkAttributes.js";

import {
  sortLinkSourceYAscending,
  sortLinkSourceYDescending,
  sortLinkTargetYAscending,
  sortLinkTargetYDescending,
  sortLinkColumnAscending,
} from "./sortGraph.js";

export function addCircularPathData(
  inputGraph,
  id,
  circularLinkGap,
  baseRadius,
  verticalMargin
) {
  let graph = inputGraph;

  var buffer = 5;

  var minY = min(graph.links, function (link) {
    return link.source.y0;
  });

  // create object for circular Path Data
  graph.links.forEach(function (link) {
    if (link.circular) {
      link.circularPathData = {};
    }
  });

  // calc vertical offsets per top/bottom links
  var topLinks = graph.links.filter(function (l) {
    return l.circularLinkType == "top";
  });

  calcVerticalBuffer(topLinks, graph.nodes, id, circularLinkGap);

  var bottomLinks = graph.links.filter(function (l) {
    return l.circularLinkType == "bottom";
  });

  calcVerticalBuffer(bottomLinks, graph.nodes, id, circularLinkGap);

  // add the base data for each link (radii/extents only; we assign `link.path` after post-passes)
  graph.links.forEach(function (link) {
    if (link.circular) {
      link.circularPathData.arcRadius = link.width + baseRadius;
      link.circularPathData.rightNodeBuffer = buffer;
      link.circularPathData.leftNodeBuffer = buffer;
      link.circularPathData.sourceWidth = link.source.x1 - link.source.x0;
      link.circularPathData.sourceX =
        link.source.x0 + link.circularPathData.sourceWidth;
      link.circularPathData.targetX = link.target.x0;
      link.circularPathData.sourceY = link.y0;
      link.circularPathData.targetY = link.y1;

      // for self linking paths - always use compact layout close to the node
      if (selfLinking(link, id)) {
        var selfLinkRadius = baseRadius + link.width / 2;
        link.circularPathData.rightSmallArcRadius = selfLinkRadius;
        link.circularPathData.rightLargeArcRadius = selfLinkRadius;
        link.circularPathData.leftSmallArcRadius = selfLinkRadius;
        link.circularPathData.leftLargeArcRadius = selfLinkRadius;

        // Margin for self-links - keep them compact rectangles (wider than tall).
        // Use small factor so all self-loops have similar proportions regardless of stroke width.
        // Minimum 8px ensures even thin links are visible.
        var selfLoopMarginFactor = 0.6;
        var selfLinkMargin = Math.max(8, selfLinkRadius * selfLoopMarginFactor + link.width * 0.4);
        // Also add verticalBuffer to account for stacking with other circular links
        var vBuf = link.circularPathData.verticalBuffer || 0;
        // IMPORTANT: keep self-loops compact by NOT applying the generic `baseOffset`
        // that we use for other circular links. Self-loops are handled by:
        // - their own small `selfLinkMargin`, and
        // - `verticalBuffer` stacking, plus
        // - the global bottom-band minimum-gap pass later in this function.
        // Setting baseOffset to 0 makes them smaller and avoids "too tall" self-loops.
        var extMinY = link.source.y0;
        var extMaxY = link.source.y1;
        link.circularPathData.baseOffset = 0;

        if (link.circularLinkType == "bottom") {
          link.circularPathData.verticalFullExtent =
            extMaxY + selfLinkMargin + vBuf;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent - selfLinkRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent - selfLinkRadius;
        } else {
          // top links
          link.circularPathData.verticalFullExtent =
            extMinY - selfLinkMargin - vBuf;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent + selfLinkRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent + selfLinkRadius;
        }
      } else {
        // else calculate normally
        // add right extent coordinates, based on links with same source column and circularLink type
        // (column-level grouping is needed to avoid vertical-leg overlaps for different nodes in same column)
        var thisColumn = link.source.column;
        var thisCircularLinkType = link.circularLinkType;
        var sameColumnLinks = graph.links.filter(function (l) {
          return (
            l.circular &&
            l.source.column == thisColumn &&
            l.circularLinkType == thisCircularLinkType
          );
        });

        // SOURCE-side (right) radii ordering for a whole SOURCE COLUMN.
        //
        // Goal: outgoing backlinks that go to the same target (or target column) should be
        // adjacent ("grouped") and ordered by how close the target is:
        // - span ASC (closest target column first),
        // - within the same target column: target.y0 ASC (for TOP links: lower target => later => more-right exit),
        // - then target height ASC, then source.y0 ASC as a stable tie-break.
        sameColumnLinks.sort(function(a, b) {
          // 1) Span (distance in columns): closer first
          var ad = Math.abs((a.source.column || 0) - (a.target.column || 0));
          var bd = Math.abs((b.source.column || 0) - (b.target.column || 0));
          if (ad !== bd) return ad - bd;

          // 2) Group by target node position (keeps links to same target region together).
          // Special case: bottom *backlinks* should route local (lower) targets closer to the node
          // and push upper targets farther (outer radius) to avoid near-node braiding.
          var aTgtY0 = a.target && typeof a.target.y0 === "number" ? a.target.y0 : 0;
          var bTgtY0 = b.target && typeof b.target.y0 === "number" ? b.target.y0 : 0;
          var aIsBottomBacklink =
            a.circularLinkType === "bottom" && (a.target.column || 0) < (a.source.column || 0);
          var bIsBottomBacklink =
            b.circularLinkType === "bottom" && (b.target.column || 0) < (b.source.column || 0);
          if (aIsBottomBacklink && bIsBottomBacklink) {
            // Descending y0: lower targets first (inner), upper targets last (outer).
            if (Math.abs(aTgtY0 - bTgtY0) >= 1e-6) return bTgtY0 - aTgtY0;
          } else {
            if (Math.abs(aTgtY0 - bTgtY0) >= 1e-6) return aTgtY0 - bTgtY0;
          }

          var aTgtH =
            a.target && typeof a.target.y1 === "number" && typeof a.target.y0 === "number"
              ? a.target.y1 - a.target.y0
              : 0;
          var bTgtH =
            b.target && typeof b.target.y1 === "number" && typeof b.target.y0 === "number"
              ? b.target.y1 - b.target.y0
              : 0;
          if (aTgtH !== bTgtH) return aTgtH - bTgtH;

          // 3) Stable-ish: keep exits aligned with source port ordering.
          // TOP band assigns ports top->bottom => higher sources first (ASC).
          // BOTTOM band assigns ports bottom->top => lower sources first (DESC).
          var aSrcY0 = a.source && typeof a.source.y0 === "number" ? a.source.y0 : 0;
          var bSrcY0 = b.source && typeof b.source.y0 === "number" ? b.source.y0 : 0;
          if (Math.abs(aSrcY0 - bSrcY0) >= 1e-6) {
            return (a.circularLinkType === "bottom") ? (bSrcY0 - aSrcY0) : (aSrcY0 - bSrcY0);
          }

          // 4) Preserve nesting vs stacking order when everything else ties
          var av = a.circularPathData ? a.circularPathData.verticalBuffer : 0;
          var bv = b.circularPathData ? b.circularPathData.verticalBuffer : 0;
          if (av !== bv) return av - bv;

          return (a.circularLinkID || 0) - (b.circularLinkID || 0);
        });

        var radiusOffset = 0;
        sameColumnLinks.forEach(function (l, i) {
          if (l.circularLinkID == link.circularLinkID) {
            link.circularPathData.rightSmallArcRadius =
              baseRadius + link.width / 2 + radiusOffset;
            link.circularPathData.rightLargeArcRadius =
              baseRadius + link.width / 2 + i * circularLinkGap + radiusOffset;
          }
          radiusOffset = radiusOffset + l.width;
        });

        // add left extent coordinates.
        //
        // IMPORTANT: for backlinks (target is left of source), we must group by the *target node*,
        // not just the target column. Otherwise, radii spacing gets \"shared\" across different nodes
        // in the same column and can shrink enough that multiple thick links end up with near-identical
        // left vertical-leg X positions => visible overlap at node entry.
        thisColumn = link.target.column;
        var isBacklinkForThis =
          link.circularLinkType === "bottom" && (link.target.column || 0) < (link.source.column || 0);
        sameColumnLinks = graph.links.filter(function (l) {
          if (!(l && l.circular && l.circularLinkType == thisCircularLinkType)) return false;
          if (isBacklinkForThis) {
            // Group by target node identity via the provided id accessor.
            // Do NOT group by `type`: users may change types; geometry must remain stable.
            return id(l.target) === id(link.target);
          }
          // Non-backlink circular links keep the existing per-column grouping.
          return l.target.column == thisColumn;
        });
        // Target side radii: cluster by TARGET node first to avoid horizontal alternating,
        // then use span/vBuf for consistent nesting.
        sameColumnLinks.sort(function(a, b) {
          var aTgtY0 = a.target && typeof a.target.y0 === "number" ? a.target.y0 : 0;
          var bTgtY0 = b.target && typeof b.target.y0 === "number" ? b.target.y0 : 0;
          var aIsBottomBacklink =
            a.circularLinkType === "bottom" && (a.target.column || 0) < (a.source.column || 0);
          var bIsBottomBacklink =
            b.circularLinkType === "bottom" && (b.target.column || 0) < (b.source.column || 0);
          if (aIsBottomBacklink && bIsBottomBacklink) {
            // Descending y0: lower targets first (inner), upper targets last (outer).
            if (Math.abs(aTgtY0 - bTgtY0) >= 1e-6) return bTgtY0 - aTgtY0;
          } else {
            if (Math.abs(aTgtY0 - bTgtY0) >= 1e-6) return aTgtY0 - bTgtY0;
          }

          var aTgtH =
            a.target && typeof a.target.y1 === "number" && typeof a.target.y0 === "number"
              ? a.target.y1 - a.target.y0
              : 0;
          var bTgtH =
            b.target && typeof b.target.y1 === "number" && typeof b.target.y0 === "number"
              ? b.target.y1 - b.target.y0
              : 0;
          if (aTgtH !== bTgtH) return aTgtH - bTgtH;

          // For backlinks into the SAME target node, the \"3rd turn\" horizontal order at node entry
          // should follow the same principles as port sorting:
          // 1) primary key: span (distance from source column) — farther sources are more outer (further left)
          // 2) if span ties (=> same source column), lower source nodes should be more inner (more right)
          //    than higher source nodes.
          var aTgtName = a.target && a.target.name ? a.target.name : undefined;
          var bTgtName = b.target && b.target.name ? b.target.name : undefined;
          var ad = Math.abs((a.source.column || 0) - (a.target.column || 0));
          var bd = Math.abs((b.source.column || 0) - (b.target.column || 0));
          if (aIsBottomBacklink && bIsBottomBacklink && aTgtName && bTgtName && aTgtName === bTgtName) {
            if (ad !== bd) return ad - bd; // nearer (smaller span) first => more inner (right)
            // span tie => same source column: lower source should be more inner (right) => earlier in radius list
            var aSrcY = (a.source.y0 + a.source.y1) / 2;
            var bSrcY = (b.source.y0 + b.source.y1) / 2;
            if (Math.abs(aSrcY - bSrcY) >= 1e-6) return bSrcY - aSrcY; // lower first
          } else {
            if (ad !== bd) return ad - bd;
          }

          var av = a.circularPathData ? a.circularPathData.verticalBuffer : 0;
          var bv = b.circularPathData ? b.circularPathData.verticalBuffer : 0;
          if (av !== bv) return av - bv;

          return (a.circularLinkID || 0) - (b.circularLinkID || 0);
        });

        radiusOffset = 0;
        sameColumnLinks.forEach(function (l, i) {
          if (l.circularLinkID == link.circularLinkID) {
            // Use cumulative-width spacing so adjacent links have enough separation for their stroke widths.
            // For the left side we keep small==large to create a clean, non-bulging bundle near the target.
            var r = baseRadius + link.width / 2 + radiusOffset;
            link.circularPathData.leftSmallArcRadius = r;
            link.circularPathData.leftLargeArcRadius = r;
          }
          // Add explicit gap as well; without this, very thin links can end up too close to thicker ones,
          // causing visible overlap at node entry.
          // Apply `circularLinkGap` exactly once between neighbors. Extra gap caused a \"double spacing\" look.
          radiusOffset = radiusOffset + l.width + circularLinkGap;
        });

        // Use shared group extents computed in calcVerticalBuffer to keep bundles aligned.
        // Prefer per-link extents for compact routing when the link is "local":
        // - same-column circular links (source.column === target.column),
        // - very short-span links (span <= 1).
        // Otherwise, use group extents to keep bundles aligned.
        var sameColumnCircular = link.source && link.target && link.source.column === link.target.column;
        var span = Math.abs((link.source.column || 0) - (link.target.column || 0));
        var preferPerLinkExtents = sameColumnCircular || span <= 1;
        var relevantMinY;
        var relevantMaxY;

        if (preferPerLinkExtents && link.circularPathData) {
          if (typeof link.circularPathData._extMinY === "number") {
            relevantMinY = link.circularPathData._extMinY;
          }
          if (typeof link.circularPathData._extMaxY === "number") {
            relevantMaxY = link.circularPathData._extMaxY;
          }
        }

        // Fallback / default: group extents when available, otherwise per-link node extents.
        if (typeof relevantMinY !== "number") {
          relevantMinY = (link.circularPathData && typeof link.circularPathData.groupMinY === "number")
            ? link.circularPathData.groupMinY
            : Math.min(link.source.y0, link.target.y0);
        }
        if (typeof relevantMaxY !== "number") {
          relevantMaxY = (link.circularPathData && typeof link.circularPathData.groupMaxY === "number")
            ? link.circularPathData.groupMaxY
            : Math.max(link.source.y1, link.target.y1);
        }

        // If this link is part of a bundle (multiple links targeting the same column),
        // always use the group extents for baseOffset sizing. Otherwise short-span links
        // can compute a smaller columnHeight and fail to reach the bundle's height.
        if (
          link.circularPathData &&
          link.circularPathData.groupSize > 1 &&
          typeof link.circularPathData.groupMinY === "number" &&
          typeof link.circularPathData.groupMaxY === "number"
        ) {
          relevantMinY = link.circularPathData.groupMinY;
          relevantMaxY = link.circularPathData.groupMaxY;
        }

        // Base offset controls how far the circular link "escapes" above/below the main diagram.
        // Use an adaptive value, but cap it tightly to avoid excessive vertical gaps.
        // Make baseOffset span-dependent: short links stay closer to nodes.
        var columnHeight = relevantMaxY - relevantMinY;
        var linkSpan = Math.abs((link.source.column || 0) - (link.target.column || 0));
        
        // For short-span links (≤2 columns), use smaller baseOffset to keep them compact.
        // For longer backlinks, allow more vertical escape to avoid crossing horizontal flow.
        var spanFactor = linkSpan <= 1 ? 0.04 : (linkSpan === 2 ? 0.06 : 0.08);
        var desiredBaseOffset = Math.max(verticalMargin + link.width + 2, columnHeight * spanFactor);
        
        // Tight cap (~3% of diagram height for short, ~4.5% for long) to keep arcs close to nodes.
        var capFactor = linkSpan <= 2 ? 0.03 : 0.045;
        var maxAllowedBaseOffset = Math.max(verticalMargin, (graph.y1 - graph.y0) * capFactor);
        var baseOffset = Math.min(desiredBaseOffset, maxAllowedBaseOffset);
        link.circularPathData.baseOffset = baseOffset;
        // IMPORTANT: do NOT force all links in a bundle to share the same verticalBuffer.
        // That makes them collapse onto one horizontal line (same verticalFullExtent).
        // Group alignment should be handled via groupMinY/groupMaxY (baseOffset sizing),
        // while per-link verticalBuffer preserves stacking.
        var totalOffset = baseOffset + link.circularPathData.verticalBuffer;

        // bottom links
        if (link.circularLinkType == "bottom") {
          link.circularPathData.verticalFullExtent =
            relevantMaxY + totalOffset;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent -
            link.circularPathData.rightLargeArcRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent -
            link.circularPathData.leftLargeArcRadius;
        } else {
          // top links
          link.circularPathData.verticalFullExtent =
            relevantMinY - totalOffset;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent +
            link.circularPathData.rightLargeArcRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent +
            link.circularPathData.leftLargeArcRadius;
        }

        if (link._debugCircular) {
          console.log("[circular/extents]", (link.source && link.source.name) + "->" + (link.target && link.target.name) + " (#" + link.index + ")", {
            type: link.circularLinkType,
            span: Math.abs((link.source.column || 0) - (link.target.column || 0)),
            width: link.width,
            relevantMinY: relevantMinY,
            relevantMaxY: relevantMaxY,
            groupMinY: link.circularPathData.groupMinY,
            groupMaxY: link.circularPathData.groupMaxY,
            columnHeight: columnHeight,
            desiredBaseOffset: desiredBaseOffset,
            maxAllowedBaseOffset: maxAllowedBaseOffset,
            baseOffset: baseOffset,
            vBuf: link.circularPathData.verticalBuffer,
            totalOffset: totalOffset,
            verticalFullExtent: link.circularPathData.verticalFullExtent
          });
        }
      }

      // all links
      link.circularPathData.rightInnerExtent =
        link.circularPathData.sourceX + link.circularPathData.rightNodeBuffer;
      link.circularPathData.leftInnerExtent =
        link.circularPathData.targetX - link.circularPathData.leftNodeBuffer;
      link.circularPathData.rightFullExtent =
        link.circularPathData.sourceX +
        link.circularPathData.rightLargeArcRadius +
        link.circularPathData.rightNodeBuffer;
      link.circularPathData.leftFullExtent =
        link.circularPathData.targetX -
        link.circularPathData.leftLargeArcRadius -
        link.circularPathData.leftNodeBuffer;
    }
  });

  // Post-pass: compress overly-large RIGHT-side radii for TOP circular links, per source column.
  //
  // Why: per-column radii spacing is what prevents right vertical legs from overlapping.
  // A hard clamp to leftLargeArcRadius can collapse those radii (causing overlaps), while
  // no clamp can produce ballooned radii (A91...). So we keep per-column spacing but, if
  // the whole group becomes too large, scale the radii down proportionally.
  var rightTopGroups = {};
  graph.links.forEach(function(l) {
    if (!l.circular || l.circularLinkType !== "top") return;
    if (selfLinking(l, id)) return;
    if (!l.source || typeof l.source.column !== "number") return;
    if (!l.circularPathData || typeof l.circularPathData.rightLargeArcRadius !== "number") return;
    var key = String(l.source.column);
    if (!rightTopGroups[key]) rightTopGroups[key] = [];
    rightTopGroups[key].push(l);
  });

  var diagramWidth = graph.x1 - graph.x0;
  var maxAllowedRightRadius = Math.max(baseRadius + 30, diagramWidth * 0.05);

  Object.keys(rightTopGroups).forEach(function(key) {
    var group = rightTopGroups[key];
    var maxR = 0;
    group.forEach(function(l) {
      var r = l.circularPathData.rightLargeArcRadius;
      if (r > maxR) maxR = r;
    });
    if (maxR <= maxAllowedRightRadius) return;

    var denom = (maxR - baseRadius);
    if (denom <= 1e-6) return;
    var factor = (maxAllowedRightRadius - baseRadius) / denom;
    // Don't over-compress; keep more spacing to avoid overlap after compression.
    // Too-aggressive compression (0.5) can violate clearance between thick+thin pairs.
    factor = Math.max(0.7, Math.min(1, factor));

    group.forEach(function(l) {
      var c = l.circularPathData;
      if (typeof c.rightLargeArcRadius === "number") {
        c.rightLargeArcRadius = baseRadius + (c.rightLargeArcRadius - baseRadius) * factor;
      }
      if (typeof c.rightSmallArcRadius === "number") {
        c.rightSmallArcRadius = baseRadius + (c.rightSmallArcRadius - baseRadius) * factor;
      }
      if (
        typeof c.rightLargeArcRadius === "number" &&
        typeof c.rightSmallArcRadius === "number" &&
        c.rightSmallArcRadius > c.rightLargeArcRadius
      ) {
        c.rightSmallArcRadius = c.rightLargeArcRadius;
      }
    });
  });

  // Post-pass: enforce minimum clearance between RIGHT vertical legs (same source column + same top/bottom band).
  //
  // Right leg clearance: ensure minimum horizontal gap between ALL circular links
  // from the same source column that have overlapping vertical ranges.
  // This handles both same-type (TOP-TOP, BOTTOM-BOTTOM) and cross-type (TOP-BOTTOM) overlaps.
  //
  // We group by source column only and check vertical overlap before applying clearance.
  var rightGroups = {};
  graph.links.forEach(function(l) {
    if (!l.circular) return;
    if (!l.circularPathData) return;
    if (typeof l.circularPathData.rightLargeArcRadius !== "number") return;
    var sourceKey =
      l.source && typeof l.source.column === "number"
        ? String(l.source.column)
        : String(Math.round((l.circularPathData.sourceX || 0) * 10) / 10);
    if (!rightGroups[sourceKey]) rightGroups[sourceKey] = [];
    rightGroups[sourceKey].push(l);
  });

  Object.keys(rightGroups).forEach(function(k) {
    var group = rightGroups[k];
    if (group.length < 2) return;
    
    var maxRightIters = 20;
    for (var rightIt = 0; rightIt < maxRightIters; rightIt++) {
      var rightChanged = false;
      // Sort by rightFullExtent: inner first (smaller rfe)
      group.sort(function(a, b) {
        return a.circularPathData.rightFullExtent - b.circularPathData.rightFullExtent;
      });

      for (var i = 1; i < group.length; i++) {
        var prev = group[i - 1]; // inner (smaller rfe)
        var curr = group[i];     // outer (larger rfe)
        
        // Check vertical overlap on right leg.
        // For TOP: Y range is [vfe, source.y0]
        // For BOTTOM: Y range is [source.y1, vfe]
        var prevYMin, prevYMax, currYMin, currYMax;
        if (prev.circularLinkType === 'top') {
          prevYMin = prev.circularPathData.verticalFullExtent;
          prevYMax = prev.source.y0;
        } else {
          prevYMin = prev.source.y1;
          prevYMax = prev.circularPathData.verticalFullExtent;
        }
        if (curr.circularLinkType === 'top') {
          currYMin = curr.circularPathData.verticalFullExtent;
          currYMax = curr.source.y0;
        } else {
          currYMin = curr.source.y1;
          currYMax = curr.circularPathData.verticalFullExtent;
        }
        
        var verticalOverlap = Math.max(0, Math.min(prevYMax, currYMax) - Math.max(prevYMin, currYMin));
        if (verticalOverlap <= 1e-6) continue; // No vertical overlap, no need for clearance
        
        var prevW = prev.width || 0;
        var currW = curr.width || 0;
        var prevRight = prev.circularPathData.rightFullExtent + prevW / 2;
        var currLeft = curr.circularPathData.rightFullExtent - currW / 2;
        var gap = currLeft - prevRight;
        var required = circularLinkGap || 0;
        
        if (gap < required) {
          var delta = required - gap + 1e-6;
          // Push curr outward (increase rfe)
          curr.circularPathData.rightLargeArcRadius += delta;
          if (typeof curr.circularPathData.rightSmallArcRadius === "number") {
            curr.circularPathData.rightSmallArcRadius += delta;
            if (curr.circularPathData.rightSmallArcRadius > curr.circularPathData.rightLargeArcRadius) {
              curr.circularPathData.rightSmallArcRadius = curr.circularPathData.rightLargeArcRadius;
            }
          }
          curr.circularPathData.rightFullExtent =
            curr.circularPathData.sourceX +
            curr.circularPathData.rightLargeArcRadius +
            (curr.circularPathData.rightNodeBuffer || 0);
          rightChanged = true;
        }
      }
      if (!rightChanged) break;
    }
  });

  // Post-pass: ensure minimum horizontal clearance on the LEFT vertical leg.
  // Group links by circularLinkType AND target column - TOP and BOTTOM links don't affect each other
  // because they go in opposite directions and their left legs don't intersect.
  // Skip self-loops: they are already handled by the right leg post-pass (source col grouping).
  var leftGroups = {};
  graph.links.forEach(function(l) {
    if (!l.circular) return;
    if (!l.circularPathData) return;
    if (selfLinking(l, id)) return; // Self-loops handled by right leg pass
    if (typeof l.circularPathData.leftLargeArcRadius !== "number") return;
    var targetKey =
      l.target && typeof l.target.column === "number"
        ? String(l.target.column)
        : String(Math.round((l.circularPathData.targetX || 0) * 10) / 10);
    // Group by circularLinkType AND target column - TOP links only affect TOP, BOTTOM only affects BOTTOM
    var k = String(l.circularLinkType) + "|" + targetKey;
    if (!leftGroups[k]) leftGroups[k] = [];
    leftGroups[k].push(l);
  });

  Object.keys(leftGroups).forEach(function(k) {
    var group = leftGroups[k];
    var maxLeftIters = 20;
    for (var leftIt = 0; leftIt < maxLeftIters; leftIt++) {
      var leftChanged = false;
      // Sort by leftFullExtent: outer first (smaller value = more to the left)
      group.sort(function(a, b) {
        var al = a.circularPathData.leftFullExtent;
        var bl = b.circularPathData.leftFullExtent;
        if (al !== bl) return al - bl;
        return 0;
      });

      for (var i = 1; i < group.length; i++) {
        var prev = group[i - 1]; // outer (more to the left, smaller lfe)
        var curr = group[i];     // inner (more to the right, larger lfe)
        
        // Check if vertical ranges overlap on the left leg.
        // IMPORTANT: Use target.y1 since left leg is near the target node.
        var prevTargetY = (prev.target && prev.target.y1) || prev.y1 || 0;
        var prevVfe = prev.circularPathData.verticalFullExtent;
        var prevYMin = Math.min(prevTargetY, prevVfe);
        var prevYMax = Math.max(prevTargetY, prevVfe);
        
        var currTargetY = (curr.target && curr.target.y1) || curr.y1 || 0;
        var currVfe = curr.circularPathData.verticalFullExtent;
        var currYMin = Math.min(currTargetY, currVfe);
        var currYMax = Math.max(currTargetY, currVfe);
        
        // Ranges overlap if: prevYMin <= currYMax AND currYMin <= prevYMax
        var verticalOverlap = (prevYMin <= currYMax) && (currYMin <= prevYMax);
        if (!verticalOverlap) continue; // No vertical overlap, no need for horizontal clearance
        
        var prevR = prev.circularPathData.leftLargeArcRadius;
        var prevW = prev.width || 0;
        var currW = curr.width || 0;
        var prevRight = prev.circularPathData.leftFullExtent + prevW / 2;
        var currLeft = curr.circularPathData.leftFullExtent - currW / 2;
        var gap = currLeft - prevRight;
        var required = circularLinkGap || 0;
        if (gap < required) {
          var delta = required - gap + 1e-6;
          // Increase prev's leftLargeArcRadius to push it more to the LEFT (decrease lfe)
          prev.circularPathData.leftLargeArcRadius = prevR + delta;
          if (typeof prev.circularPathData.leftSmallArcRadius === "number") {
            prev.circularPathData.leftSmallArcRadius += delta;
            if (prev.circularPathData.leftSmallArcRadius > prev.circularPathData.leftLargeArcRadius) {
              prev.circularPathData.leftSmallArcRadius = prev.circularPathData.leftLargeArcRadius;
            }
          }
          // Update leftFullExtent: lfe = targetX - radius - buffer
          prev.circularPathData.leftFullExtent =
            prev.circularPathData.targetX -
            prev.circularPathData.leftLargeArcRadius -
            (prev.circularPathData.leftNodeBuffer || 0);
          leftChanged = true;
        }
      }
      if (!leftChanged) break;
    }
  });

  // Post-pass: enforce global minimum vertical gap between ALL bottom circular links.
  //
  // The diagram has a shared "bottom escape band" for all bottom circular links. Even when
  // two links have non-overlapping horizontal ranges, their bottom arcs can visually overlap
  // unless we guarantee a minimum separation in absolute Y.
  //
  // This is intentionally global (not per column/group): it matches the layout invariant
  // checked in `test/sort-invariants.test.js`.
  var minBottomGap = circularLinkGap || 0;
  if (minBottomGap > 0) {
    var bottomCircular = graph.links.filter(function(l) {
      return (
        l &&
        l.circular &&
        l.circularLinkType === "bottom" &&
        !l.isVirtual &&
        l.circularPathData &&
        typeof l.circularPathData.verticalFullExtent === "number"
      );
    });
    // Iterate because pushing one link down can reorder the sorted adjacency,
    // and the invariant is defined on the final sorted order.
    var maxIters = 10;
    for (var it = 0; it < maxIters; it++) {
      var changed = false;
      bottomCircular.sort(function(a, b) {
        return a.circularPathData.verticalFullExtent - b.circularPathData.verticalFullExtent;
      });
      for (var bi = 1; bi < bottomCircular.length; bi++) {
        var prevL = bottomCircular[bi - 1];
        var currL = bottomCircular[bi];
        var prevBottom =
          prevL.circularPathData.verticalFullExtent + (prevL.width || 0) / 2;
        var currTop =
          currL.circularPathData.verticalFullExtent - (currL.width || 0) / 2;
        var gapNow = currTop - prevBottom;
        if (gapNow < minBottomGap) {
          // Add a tiny epsilon so downstream strict comparisons (gap >= circularGap)
          // don't fail due to floating point rounding.
          var push = (minBottomGap - gapNow) + 1e-6;
          currL.circularPathData.verticalFullExtent += push;
          if (typeof currL.circularPathData.verticalBuffer === "number") {
            currL.circularPathData.verticalBuffer += push;
          }
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  // Post-pass: enforce global minimum vertical gap between ALL top circular links.
  //
  // Same logic as bottom but inverted: for TOP links, lower VFE = higher visually.
  // Gap = (higher link's VFE - w/2) - (lower link's VFE + w/2)
  // If gap is too small, push the lower link UP (decrease its VFE).
  var minTopGap = circularLinkGap || 0;
  if (minTopGap > 0) {
    var topCircular = graph.links.filter(function(l) {
      return (
        l &&
        l.circular &&
        l.circularLinkType === "top" &&
        !l.isVirtual &&
        l.circularPathData &&
        typeof l.circularPathData.verticalFullExtent === "number"
      );
    });
    var maxItersTop = 10;
    for (var itTop = 0; itTop < maxItersTop; itTop++) {
      var changedTop = false;
      // Sort by VFE descending: higher VFE first (these are the links closer to nodes)
      topCircular.sort(function(a, b) {
        return b.circularPathData.verticalFullExtent - a.circularPathData.verticalFullExtent;
      });
      for (var ti = 1; ti < topCircular.length; ti++) {
        var prevT = topCircular[ti - 1]; // higher VFE = closer to nodes
        var currT = topCircular[ti];     // lower VFE = further from nodes (higher visually)
        // prev is "inner" (closer to nodes), curr is "outer" (further up)
        var prevTopEdge = prevT.circularPathData.verticalFullExtent - (prevT.width || 0) / 2;
        var currBottomEdge = currT.circularPathData.verticalFullExtent + (currT.width || 0) / 2;
        var gapTop = prevTopEdge - currBottomEdge;
        if (gapTop < minTopGap) {
          var pushTop = (minTopGap - gapTop) + 1e-6;
          // Push curr UP = decrease its VFE
          currT.circularPathData.verticalFullExtent -= pushTop;
          if (typeof currT.circularPathData.verticalBuffer === "number") {
            currT.circularPathData.verticalBuffer += pushTop;
          }
          changedTop = true;
        }
      }
      if (!changedTop) break;
    }
  }

  // Recompute extents that depend on radii (post-passes above mutate radii).
  graph.links.forEach(function(link) {
    if (!link.circular || !link.circularPathData) return;
    var c = link.circularPathData;

    // inner extents are buffer-only
    c.rightInnerExtent = c.sourceX + c.rightNodeBuffer;
    c.leftInnerExtent = c.targetX - c.leftNodeBuffer;

    // full extents depend on radii
    c.rightFullExtent = c.sourceX + c.rightLargeArcRadius + c.rightNodeBuffer;
    c.leftFullExtent = c.targetX - c.leftLargeArcRadius - c.leftNodeBuffer;

    // vertical inner extents depend on radii + direction
    if (link.circularLinkType === "bottom") {
      c.verticalRightInnerExtent = c.verticalFullExtent - c.rightLargeArcRadius;
      c.verticalLeftInnerExtent = c.verticalFullExtent - c.leftLargeArcRadius;
    } else {
      c.verticalRightInnerExtent = c.verticalFullExtent + c.rightLargeArcRadius;
      c.verticalLeftInnerExtent = c.verticalFullExtent + c.leftLargeArcRadius;
    }
  });

  // Finally: assign link.path for rendering
  var normalPath = linkHorizontal()
    .source(function (d) {
      var x = d.source.x0 + (d.source.x1 - d.source.x0);
      var y = d.y0;
      return [x, y];
    })
    .target(function (d) {
      var x = d.target.x0;
      var y = d.y1;
      return [x, y];
    });

  graph.links.forEach(function(link) {
    if (link.circular) {
      link.path = createCircularPathString(link);
    } else {
      link.path = normalPath(link);
    }
  });

  return graph;
}

// creates vertical buffer values per set of top/bottom links
function calcVerticalBuffer(links, nodes, id, circularLinkGap) {
  function dbg(link) {
    return !!(link && link._debugCircular);
  }
  function nameOf(link) {
    if (!link) return "?";
    var s = link.source && (link.source.name || link.source.index);
    var t = link.target && (link.target.name || link.target.index);
    return String(s) + "->" + String(t) + " (#" + String(link.index) + ")";
  }

  // Pre-calculate base Y for each link to optimize collision logic
  links.forEach(function(link) {
    var ext = getLinkBaseExtents(link, nodes);
    link.circularPathData._extMinY = ext.minY;
    link.circularPathData._extMaxY = ext.maxY;
    link.circularPathData.baseY = link.circularLinkType === "bottom" ? ext.maxY : ext.minY;
  });

  // Pre-calculate max span for each target column (for group ordering)
  var maxSpanByTarget = {};
  links.forEach(function(link) {
    var targetCol = link.target.column;
    var span = Math.abs(link.source.column - link.target.column);
    if (maxSpanByTarget[targetCol] === undefined || span > maxSpanByTarget[targetCol]) {
      maxSpanByTarget[targetCol] = span;
    }
  });
  
  // Attach max span to each link for sorting
  links.forEach(function(link) {
    link._targetGroupMaxSpan = maxSpanByTarget[link.target.column];
  });
  
  // New grouping algorithm:
  // 1. Group links by target column to ensure links to same node are together
  // 2. Within each group, sort by ascending distance (shortest first)
  // 3. Order groups to minimize horizontal crossings between groups
  // 4. Apply vertical buffering within this grouped order

  var groups = {};
  links.forEach(function(link) {
    var targetCol = link.target.column;
    if (!groups[targetCol]) groups[targetCol] = [];
    groups[targetCol].push(link);
  });

  // Sort within each group (same target column) so that:
  // - self-links (distance 0) come LAST (outer) relative to other links,
  // - for equal span, order by source vertical position (upper first),
  // - then thinner first as a stable tie-break.
  // This helps avoid:
  // - non-self backlinks being pushed below self-loops,
  // - crossings between same-span links,
  // - thin links becoming outermost and entering a node from above.
  Object.values(groups).forEach(function(group) {
    group.sort(function(a, b) {
      // Keep links targeting the same node together (prevents alternating/braiding between
      // multiple target nodes in the same column).
      //
      // Primary key: target vertical position (y0). This makes all backlinks entering the
      // upper target node come before those entering a lower target node.
      // Secondary key (only when y0 is equal): smaller target node first.
      var aTgtY0 = a.target && typeof a.target.y0 === "number" ? a.target.y0 : 0;
      var bTgtY0 = b.target && typeof b.target.y0 === "number" ? b.target.y0 : 0;
      if (Math.abs(aTgtY0 - bTgtY0) >= 1e-6) return aTgtY0 - bTgtY0;

      var aTgtH =
        a.target && typeof a.target.y1 === "number" && typeof a.target.y0 === "number"
          ? a.target.y1 - a.target.y0
          : 0;
      var bTgtH =
        b.target && typeof b.target.y1 === "number" && typeof b.target.y0 === "number"
          ? b.target.y1 - b.target.y0
          : 0;
      if (aTgtH !== bTgtH) return aTgtH - bTgtH; // smaller target first

      var aSelf = selfLinking(a, id);
      var bSelf = selfLinking(b, id);
      if (aSelf !== bSelf) return aSelf ? 1 : -1;

      // Special-case: for backlinks into the same target node with the same span from the same source column,
      // order by source vertical position DESC (lower sources first).
      // This makes lower sources \"wrap\" earlier (smaller verticalBuffer -> smaller verticalFullExtent),
      // matching the requested behavior for schedule ◐ -> search ● vs schedule ● -> search ●.
      var aIsBacklink0 =
        a.circularLinkType === "bottom" && (a.target.column || 0) < (a.source.column || 0);
      var bIsBacklink0 =
        b.circularLinkType === "bottom" && (b.target.column || 0) < (b.source.column || 0);
      var aTgtName0 = a.target && a.target.name ? a.target.name : undefined;
      var bTgtName0 = b.target && b.target.name ? b.target.name : undefined;
      if (aIsBacklink0 && bIsBacklink0 && aTgtName0 && bTgtName0 && aTgtName0 === bTgtName0) {
        var distA0 = Math.abs(a.source.column - a.target.column);
        var distB0 = Math.abs(b.source.column - b.target.column);
        if (distA0 === distB0 && a.source.column === b.source.column) {
          var aSrcY0 = (a.source.y0 + a.source.y1) / 2;
          var bSrcY0 = (b.source.y0 + b.source.y1) / 2;
          if (Math.abs(aSrcY0 - bSrcY0) >= 1e-6) return bSrcY0 - aSrcY0;
        }
      }

      // Bottom backlinks into the SAME target node:
      // - For *curl depth* (verticalBuffer / verticalFullExtent), we want nearer (shorter span)
      //   to curl less deep (stay higher), and farther spans to go more outer/deeper.
      // - Do NOT change the node entry order here (that's handled by sortTargetLinks + port assignment).
      var aIsBottomBacklink =
        a.circularLinkType === "bottom" && (a.target.column || 0) < (a.source.column || 0);
      var bIsBottomBacklink =
        b.circularLinkType === "bottom" && (b.target.column || 0) < (b.source.column || 0);
      var aTgtName = a.target && a.target.name ? a.target.name : undefined;
      var bTgtName = b.target && b.target.name ? b.target.name : undefined;
      if (aIsBottomBacklink && bIsBottomBacklink && aTgtName && bTgtName && aTgtName === bTgtName) {
        var distA1 = Math.abs(a.source.column - a.target.column);
        var distB1 = Math.abs(b.source.column - b.target.column);
        // Nearer first => smaller verticalBuffer => smaller verticalFullExtent (higher bottom boundary).
        if (distA1 !== distB1) return distA1 - distB1;

        // If span ties, keep higher entry processed first (helps reduce target-side braiding).
        var aY1 = typeof a.y1 === "number" ? a.y1 : 0;
        var bY1 = typeof b.y1 === "number" ? b.y1 : 0;
        if (Math.abs(aY1 - bY1) >= 1e-6) return aY1 - bY1;
      }

      var distA = Math.abs(a.source.column - a.target.column);
      var distB = Math.abs(b.source.column - b.target.column);
      if (distA !== distB) return distA - distB;

      // Stable-ish tie-breakers to reduce jitter between reruns
      var aSrcY = (a.source.y0 + a.source.y1) / 2;
      var bSrcY = (b.source.y0 + b.source.y1) / 2;
      if (aSrcY !== bSrcY) return aSrcY - bSrcY;

      var aw = a.width || 0;
      var bw = b.width || 0;
      if (aw !== bw) return aw - bw; // thinner first

      return (a.circularLinkID || 0) - (b.circularLinkID || 0) || a.index - b.index;
    });
  });

  // For each group, compute shared minY/maxY across all links in the group.
  // This makes links targeting the same column align to the same baseline/ceiling,
  // so the "bundle" looks coherent and avoids one link not reaching another's height.
  Object.values(groups).forEach(function(group) {
    var groupMinY = Infinity;
    var groupMaxY = -Infinity;
    group.forEach(function(l) {
      if (l.circularPathData && typeof l.circularPathData._extMinY === "number") {
        groupMinY = Math.min(groupMinY, l.circularPathData._extMinY);
      }
      if (l.circularPathData && typeof l.circularPathData._extMaxY === "number") {
        groupMaxY = Math.max(groupMaxY, l.circularPathData._extMaxY);
      }
    });
    // Attach group extents to each link
    group.forEach(function(l) {
      l.circularPathData.groupMinY = groupMinY;
      l.circularPathData.groupMaxY = groupMaxY;
      l.circularPathData.groupSize = group.length;
    });
  });

  // Order groups to minimize crossings:
  // - Prefer groups with smaller MAX span first (inner)
  // - Larger-span groups later (outer)
  // Using MAX span (rather than average) ensures that a group containing any long backlink
  // is treated as "outer" overall, preventing that long backlink from being forced inner
  // relative to shorter-span links from other groups.
  //
  // Additional TOP-only tie-breaker:
  // When two target columns sit on the same row (same min target.y0), process the column
  // whose top-most target node is SMALLER (smaller height) first. Earlier processing =>
  // smaller verticalBuffer => TOP arcs stay closer to nodes. This fixes the case where a
  // tiny node (e.g. `saved_filters_search ●`) shares y0 with a tall neighbor (e.g. `search ●`)
  // but its backlinks end up above due to group-size sorting.
  var orderedGroups = Object.keys(groups)
    .map(function(col) { return { col: +col, links: groups[col] }; })
    .sort(function(a, b) {
      // Max span ascending
      var maxDistA = 0;
      a.links.forEach(function(l) {
        var d = Math.abs(l.source.column - l.target.column);
        if (d > maxDistA) maxDistA = d;
      });
      var maxDistB = 0;
      b.links.forEach(function(l) {
        var d = Math.abs(l.source.column - l.target.column);
        if (d > maxDistB) maxDistB = d;
      });
      if (maxDistA !== maxDistB) return maxDistA - maxDistB;

      // TOP-only: if min target.y0 is the same, prefer smaller target height first.
      // NOTE: We compute this on the fly to avoid mutating group state.
      if (a.links.length && a.links[0].circularLinkType === "top") {
        function groupMinTargetY0AndHeight(links) {
          var minY0 = Infinity;
          var minHAtMinY0 = Infinity;
          links.forEach(function(l) {
            var t = l.target;
            if (!t || typeof t.y0 !== "number" || typeof t.y1 !== "number") return;
            var y0 = t.y0;
            var h = t.y1 - t.y0;
            if (y0 < minY0 - 1e-6) {
              minY0 = y0;
              minHAtMinY0 = h;
            } else if (Math.abs(y0 - minY0) < 1e-6) {
              minHAtMinY0 = Math.min(minHAtMinY0, h);
            }
          });
          if (minY0 === Infinity) minY0 = 0;
          if (minHAtMinY0 === Infinity) minHAtMinY0 = 0;
          return { minY0: minY0, minHAtMinY0: minHAtMinY0 };
        }
        var ma = groupMinTargetY0AndHeight(a.links);
        var mb = groupMinTargetY0AndHeight(b.links);
        if (Math.abs(ma.minY0 - mb.minY0) < 1e-6) {
          if (ma.minHAtMinY0 !== mb.minHAtMinY0) return ma.minHAtMinY0 - mb.minHAtMinY0;
        }
      }

      // Then bigger groups first (stable packing)
      if (a.links.length !== b.links.length) {
        return b.links.length - a.links.length;
      }
      // Finally by column index
      return a.col - b.col;
    });

  // Flatten back to ordered links array
  var orderedLinks = [];
  orderedGroups.forEach(function(group) {
    orderedLinks = orderedLinks.concat(group.links);
  });

  // Process links in grouped order
  orderedLinks.forEach(function (link, i) {
    var buffer = 0;
    var srcName = link.source.name || link.source.index;
    var tgtName = link.target.name || link.target.index;
    var maxCause = null; // { j, prev, gap, offsetCorrection, bufferOver }

    // Find current group
    var currentGroupIndex = orderedGroups.findIndex(function(g) {
      return g.col === link.target.column;
    });
    var currentGroup = orderedGroups[currentGroupIndex];
    var linkIndexInGroup = currentGroup.links.indexOf(link);

    if (selfLinking(link, id)) {
      // For self-links, keep them visually compact by only stacking with:
      // - other self-links in the same column
      // - very short circular links (span <= 1) that could overlap near the node
      // Ignore long backlinks: they shouldn't force self-loops to have huge verticalBuffer.
      // The global minimum-gap pass will handle any necessary vertical separation later.
      
      // Basic self-link buffer
      link.circularPathData.verticalBuffer = buffer + link.width / 2;
      
      // Check for collisions ONLY with compact circular links (self-loops or span<=1)
      for (var j = 0; j < i; j++) {
        var prevLink = orderedLinks[j];
        
        // Skip long backlinks: they don't need tight stacking with self-loops
        var prevSpan = Math.abs((prevLink.source.column || 0) - (prevLink.target.column || 0));
        var prevIsSelf = selfLinking(prevLink, id);
        if (!prevIsSelf && prevSpan > 1) {
          continue; // Long backlink: skip collision check to keep self-loop compact
        }
        
        if (circularLinksActuallyCross(link, prevLink)) {
          // Check if both links share at least one node (for tighter spacing)
          var sameNode = (link.source.name === prevLink.source.name || 
                         link.source.name === prevLink.target.name ||
                         link.target.name === prevLink.source.name ||
                         link.target.name === prevLink.target.name);
          // Use no gap ONLY if both are self-links AND they share a node
          var gap = circularLinkGap;
          if (selfLinking(link, id) && selfLinking(prevLink, id) && sameNode) {
            gap = 0;
          }
          
          var bufferOverThisLink =
            prevLink.circularPathData.verticalBuffer +
            prevLink.width / 2 +
            gap;
            
          // Offset correction helps reduce "holes", but must NOT eliminate circularGap
          // for links targeting the same column/bundle.
          var thisBaseY = link.circularPathData.baseY;
          var prevBaseY = prevLink.circularPathData.baseY;
          var offsetCorrection = 0;
          
          if (link.target.column !== prevLink.target.column) {
            if (link.circularLinkType === "bottom") {
              offsetCorrection = prevBaseY - thisBaseY;
            } else {
              offsetCorrection = thisBaseY - prevBaseY;
            }
          }
          // Offset correction is meant to *reduce* required buffer when baseYs are naturally separated.
          // It should never INCREASE buffer (that creates huge "holes" between stacked top links).
          if (offsetCorrection > 0) offsetCorrection = 0;
          
          bufferOverThisLink += offsetCorrection;
          // Enforce minimum gap even after correction to prevent overlap.
          var minBuffer = prevLink.circularPathData.verticalBuffer + prevLink.width / 2 + circularLinkGap;
          if (bufferOverThisLink < minBuffer) bufferOverThisLink = minBuffer;
          
          buffer = bufferOverThisLink > buffer ? bufferOverThisLink : buffer;
        }
      }
      
      var finalBuffer = buffer + link.width / 2;
      // Self-loops should stay compact - rectangular shape, not square.
      // Cap verticalBuffer tightly (~5px) so all self-loops have similar proportions.
      var maxSelfLoopBuffer = 5;
      if (finalBuffer > maxSelfLoopBuffer) finalBuffer = maxSelfLoopBuffer;
      link.circularPathData.verticalBuffer = finalBuffer;
    } else {
      // Check collisions based on grouping:
      // - Within same group: only check previous links in same group (guarantees no crossings within group)
      // - Across groups: check all previous links (allows stacking between groups)
      for (var j = 0; j < i; j++) {
        var prevLink = orderedLinks[j];
        var prevGroupIndex = orderedGroups.findIndex(function(g) {
          return g.col === prevLink.target.column;
        });

        // If same group, only check if previous in group
        if (prevGroupIndex === currentGroupIndex) {
          if (currentGroup.links.indexOf(prevLink) >= linkIndexInGroup) {
            continue; // Skip if not previous in group
          }
        }
        // Different groups or valid same-group previous - check crossing

        if (circularLinksActuallyCross(link, prevLink)) {
          var prevSrcName = prevLink.source.name || prevLink.source.index;
          var prevTgtName = prevLink.target.name || prevLink.target.index;
          // Check if both links share at least one node
          var sameNode = (link.source.name === prevLink.source.name || 
                         link.source.name === prevLink.target.name ||
                         link.target.name === prevLink.source.name ||
                         link.target.name === prevLink.target.name);
          // Use no gap ONLY if both are self-links AND they share a node
          var gap = circularLinkGap;
          if (selfLinking(link, id) && selfLinking(prevLink, id) && sameNode) {
            gap = 0;
          }
          
          var bufferOverThisLink =
            prevLink.circularPathData.verticalBuffer +
            prevLink.width / 2 +
            gap;
          
          // Fix for visual hole: adjust buffer requirement based on vertical separation of base positions
          var thisBaseY = link.circularPathData.baseY;
          var prevBaseY = prevLink.circularPathData.baseY;
          var offsetCorrection = 0;
          
          // Do not reduce spacing for the same target-column bundle (keeps circularGap)
          if (link.target.column !== prevLink.target.column) {
            if (link.circularLinkType === "bottom") {
              // For bottom links (curve down), if this link is naturally lower (larger BaseY)
              // than the previous link, we need less buffer.
              offsetCorrection = prevBaseY - thisBaseY;
            } else {
              // For top links (curve up), if this link is naturally higher (smaller BaseY)
              // than the previous link, we need less buffer.
              offsetCorrection = thisBaseY - prevBaseY;
            }
          }
          // Only allow offsetCorrection to reduce the buffer requirement.
          if (offsetCorrection > 0) offsetCorrection = 0;
          
          bufferOverThisLink += offsetCorrection;
          // Enforce minimum gap even after correction to prevent overlap.
          // The minimum is: previous link's extent + gap between links.
          var minBuffer = prevLink.circularPathData.verticalBuffer + prevLink.width / 2 + circularLinkGap;
          if (bufferOverThisLink < minBuffer) bufferOverThisLink = minBuffer;
          
          if (bufferOverThisLink > buffer) {
            buffer = bufferOverThisLink;
            maxCause = { j: j, prev: prevLink, gap: gap, offsetCorrection: offsetCorrection, bufferOver: bufferOverThisLink };
          }
          if (dbg(link) || dbg(prevLink)) {
            console.log(
              "[circular/vBuf] link",
              nameOf(link),
              "crosses",
              nameOf(prevLink),
              {
                gap: gap,
                offsetCorrection: offsetCorrection,
                prevVB: prevLink.circularPathData.verticalBuffer,
                prevW: prevLink.width,
                baseY: link.circularPathData.baseY,
                prevBaseY: prevLink.circularPathData.baseY,
                bufferOver: +bufferOverThisLink.toFixed(2),
              }
            );
          }
        }
      }

      var finalBuffer = buffer + link.width / 2;
      // NO cap for regular backlinks here - they need proper stacking.
      // Height control is done in addCircularPathData via baseOffset caps.
      link.circularPathData.verticalBuffer = finalBuffer;
      if (dbg(link)) {
        console.log(
          "[circular/vBuf] FINAL",
          nameOf(link),
          {
            vBuf: +link.circularPathData.verticalBuffer.toFixed(2),
            baseY: link.circularPathData.baseY,
            groupMinY: link.circularPathData.groupMinY,
            groupMaxY: link.circularPathData.groupMaxY,
            maxCause: maxCause
              ? {
                  prev: nameOf(maxCause.prev),
                  j: maxCause.j,
                  gap: maxCause.gap,
                  offsetCorrection: maxCause.offsetCorrection,
                  bufferOver: +maxCause.bufferOver.toFixed(2),
                }
              : null,
          }
        );
      }
    }
  });

  return orderedLinks;
}

// Links cross only if their horizontal ranges overlap AND they share a column
function circularLinksActuallyCross(link1, link2) {
  var link1Source = link1.source.column;
  var link1Target = link1.target.column;
  var link2Source = link2.source.column;
  var link2Target = link2.target.column;

  // Helper: true self-loop means same node (not just same column)
  var link1SelfLoop = (link1.source === link1.target) ||
                      (link1.source && link1.target && link1.source.name === link1.target.name);
  var link2SelfLoop = (link2.source === link2.target) ||
                      (link2.source && link2.target && link2.source.name === link2.target.name);

  // Helper: do links share at least one node (object identity preferred; fallback to name)
  function sameNode(a, b) {
    if (a === b) return true;
    if (a && b && a.name !== undefined && b.name !== undefined) return a.name === b.name;
    return false;
  }
  var shareNode =
    sameNode(link1.source, link2.source) ||
    sameNode(link1.source, link2.target) ||
    sameNode(link1.target, link2.source) ||
    sameNode(link1.target, link2.target);
  
  // Special case: "zero-span" (source.column === target.column) but NOT self-link
  // (source node !== target node). These are very compact local loops and should
  // NOT be forced to stack against every link whose column-range includes this column.
  // They only need stacking against links that actually start/end in this column
  // (i.e. could share the same vertical leg region).
  var link1ZeroSpanNonSelf =
    link1Source === link1Target && link1.source !== link1.target;
  var link2ZeroSpanNonSelf =
    link2Source === link2Target && link2.source !== link2.target;

  if (link1ZeroSpanNonSelf) {
    var col = link1Source;
    if (!(link2Source === col || link2Target === col)) return false;
  }
  if (link2ZeroSpanNonSelf) {
    var col2 = link2Source;
    if (!(link1Source === col2 || link1Target === col2)) return false;
  }

  // Calculate horizontal ranges
  var link1Min = Math.min(link1Source, link1Target);
  var link1Max = Math.max(link1Source, link1Target);
  var link2Min = Math.min(link2Source, link2Target);
  var link2Max = Math.max(link2Source, link2Target);
  
  // First check: do horizontal ranges overlap or touch at boundary?
  // If ranges don't overlap at all, links can be at same Y level without crossing
  var rangesOverlap = link1Max >= link2Min && link2Max >= link1Min;
  
  if (!rangesOverlap) {
    // Even if column ranges don't overlap, circular links can still visually overlap
    // in the vertical space at the top/bottom of the chart. Check if both are same
    // circularLinkType (both top or both bottom) - they share the same "escape" space.
    if (link1.circularLinkType && link2.circularLinkType && 
        link1.circularLinkType === link2.circularLinkType) {
      // Both links curve in the same direction (both top or both bottom).
      // They need to be stacked vertically to avoid overlap.
      return true;
    }
    return false;
  }
  
  // Ranges overlap - check for specific crossing conditions
  
  // Same TARGET NODE: stack (they share the same endpoint and can overlap near the node).
  if (sameNode(link1.target, link2.target)) return true;

  // NOTE: we intentionally do NOT auto-stack merely because target *column* matches.
  // However, we also must not early-return false here: links targeting different nodes in
  // the same column can still geometrically overlap (nested spans, shared leg columns, etc),
  // and in that case we still need verticalBuffer + circularGap to prevent visual overlap.

  // Same SOURCE column = right vertical segments would overlap at source.
  // This is a common cause of "double-crossing" (links swap order near the source,
  // then swap back near the target). If both links share the same source column,
  // they must be stacked unless it's an unrelated self-loop that can be nested locally.
  var sameSource = (link1Source === link2Source);
  if (sameSource) {
    // Allow two unrelated self-loop bubbles to be nested by radii.
    if ((link1SelfLoop || link2SelfLoop) && !shareNode) {
      // fall through
    } else {
      return true;
    }
  }

  // Self-link handling:
  // NOTE: self-link means "same node", not merely "same column".
  // Column-equality is common for compact circulars and must NOT be treated as a self-loop.
  var link1Self = link1SelfLoop;
  var link2Self = link2SelfLoop;
  
  if (link1Self || link2Self) {
    // Only force stacking with self-loops when the links share a node.
    // Otherwise, the self-loop bubble is local to its node and can be nested by radii.
    if (!shareNode) return false;
    var selfCol = link1Self ? link1Source : link2Source;
    var otherMin = link1Self ? link2Min : link1Min;
    var otherMax = link1Self ? link2Max : link1Max;
    
    // If self-link is at the same column as the other link's start or end, it might overlap
    // But if the other link just starts/ends there without spanning across, it's fine?
    // Actually, any link spanning across selfCol overlaps the self-link bubble
    if (selfCol >= otherMin && selfCol <= otherMax) return true;
  }

  // Boundary-touch overlap:
  // If the column ranges only TOUCH at a boundary (e.g. [2,5] and [5,7]) and BOTH links
  // have an endpoint at that boundary column, their vertical legs/arc buffers can overlap
  // visually. This is a common source of "bundle groups overlapping" and should be stacked,
  // but only in this narrow boundary-touch case (avoids the old over-aggressive stacking).
  var overlapStart = Math.max(link1Min, link2Min);
  var overlapEnd = Math.min(link1Max, link2Max);
  if (overlapStart === overlapEnd) {
    var c = overlapStart;
    var link1HasEndpointAt = (link1Source === c || link1Target === c);
    var link2HasEndpointAt = (link2Source === c || link2Target === c);
    if (link1HasEndpointAt && link2HasEndpointAt) return true;
  }

  // For non-self links with overlapping ranges, we only need stacking if a vertical
  // "leg" column of one link lies strictly INSIDE the other link's horizontal span.
  // This is the real condition for a vertical segment intersecting a horizontal segment.
  // (If they only overlap by range but all endpoints are outside, they can be nested
  // by radii without needing extra vertical separation.)
  function inside(col, min, max) {
    return col > min && col < max;
  }
  if (
    inside(link1Source, link2Min, link2Max) ||
    inside(link1Target, link2Min, link2Max) ||
    inside(link2Source, link1Min, link1Max) ||
    inside(link2Target, link1Min, link1Max)
  ) {
    return true;
  }
  
  // With proper span-distance sorting, other crossings (vertical inside range) don't occur:
  // - Shorter span is processed first (higher, smaller vBuf)
  // - Its vertical segments end above the longer span's horizontal
  // - So no actual visual crossing happens
  
  return false;
}

// create a d path using the addCircularPathData
// create a d path using the addCircularPathData
function createCircularPathString(link) {
  var pathString = "";

  if (link.circularLinkType == "top") {
    pathString =
      // start at the left of the source node
      "M" +
      link.circularPathData.sourceX +
      " " +
      link.circularPathData.sourceY +
      " " +
      // line left to buffer point
      "L" +
      link.circularPathData.rightInnerExtent +
      " " +
      link.circularPathData.sourceY +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.rightLargeArcRadius +
      " " +
      link.circularPathData.rightSmallArcRadius +
      " 0 0 0 " +
      // End of arc X //End of arc Y
      link.circularPathData.rightFullExtent +
      " " +
      (link.circularPathData.sourceY -
        link.circularPathData.rightSmallArcRadius) +
      " " + // End of arc X
      // line up to buffer point
      "L" +
      link.circularPathData.rightFullExtent +
      " " +
      link.circularPathData.verticalRightInnerExtent +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.rightLargeArcRadius +
      " " +
      link.circularPathData.rightLargeArcRadius +
      " 0 0 0 " +
      // End of arc X //End of arc Y
      link.circularPathData.rightInnerExtent +
      " " +
      link.circularPathData.verticalFullExtent +
      " " + // End of arc X
      // line right to buffer point
      "L" +
      link.circularPathData.leftInnerExtent +
      " " +
      link.circularPathData.verticalFullExtent +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.leftLargeArcRadius +
      " " +
      link.circularPathData.leftLargeArcRadius +
      " 0 0 0 " +
      // End of arc X //End of arc Y
      link.circularPathData.leftFullExtent +
      " " +
      link.circularPathData.verticalLeftInnerExtent +
      " " + // End of arc X
      // line down
      "L" +
      link.circularPathData.leftFullExtent +
      " " +
      (link.circularPathData.targetY -
        link.circularPathData.leftSmallArcRadius) +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.leftLargeArcRadius +
      " " +
      link.circularPathData.leftSmallArcRadius +
      " 0 0 0 " +
      // End of arc X //End of arc Y
      link.circularPathData.leftInnerExtent +
      " " +
      link.circularPathData.targetY +
      " " + // End of arc X
      // line to end
      "L" +
      link.circularPathData.targetX +
      " " +
      link.circularPathData.targetY;
  } else {
    // bottom path
    pathString =
      // start at the left of the source node
      "M" +
      link.circularPathData.sourceX +
      " " +
      link.circularPathData.sourceY +
      " " +
      // line left to buffer point
      "L" +
      link.circularPathData.rightInnerExtent +
      " " +
      link.circularPathData.sourceY +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.rightLargeArcRadius +
      " " +
      link.circularPathData.rightSmallArcRadius +
      " 0 0 1 " +
      // End of arc X //End of arc Y
      link.circularPathData.rightFullExtent +
      " " +
      (link.circularPathData.sourceY +
        link.circularPathData.rightSmallArcRadius) +
      " " + // End of arc X
      // line down to buffer point
      "L" +
      link.circularPathData.rightFullExtent +
      " " +
      link.circularPathData.verticalRightInnerExtent +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.rightLargeArcRadius +
      " " +
      link.circularPathData.rightLargeArcRadius +
      " 0 0 1 " +
      // End of arc X //End of arc Y
      link.circularPathData.rightInnerExtent +
      " " +
      link.circularPathData.verticalFullExtent +
      " " + // End of arc X
      // line right to buffer point
      "L" +
      link.circularPathData.leftInnerExtent +
      " " +
      link.circularPathData.verticalFullExtent +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.leftLargeArcRadius +
      " " +
      link.circularPathData.leftLargeArcRadius +
      " 0 0 1 " +
      // End of arc X //End of arc Y
      link.circularPathData.leftFullExtent +
      " " +
      link.circularPathData.verticalLeftInnerExtent +
      " " + // End of arc X
      // line up
      "L" +
      link.circularPathData.leftFullExtent +
      " " +
      (link.circularPathData.targetY +
        link.circularPathData.leftSmallArcRadius) +
      " " +
      // Arc around: Centre of arc X and  //Centre of arc Y
      "A" +
      link.circularPathData.leftLargeArcRadius +
      " " +
      link.circularPathData.leftSmallArcRadius +
      " 0 0 1 " +
      // End of arc X //End of arc Y
      link.circularPathData.leftInnerExtent +
      " " +
      link.circularPathData.targetY +
      " " + // End of arc X
      // line to end
      "L" +
      link.circularPathData.targetX +
      " " +
      link.circularPathData.targetY;
  }

  return pathString;
}

function getLinkBaseY(link, nodes, type) {
  // Find min/max Y of REAL nodes between source and target columns
  // Exclude virtual nodes
  var relevantMinY = Math.min(link.source.y0, link.target.y0);
  var relevantMaxY = Math.max(link.source.y1, link.target.y1);
  
  nodes.forEach(function(node) {
    if (node.virtual || (node.name && node.name.indexOf('virtualNode') === 0)) {
      return;
    }
    if (node.column >= Math.min(link.source.column, link.target.column) && 
        node.column <= Math.max(link.source.column, link.target.column)) {
      if (node.y0 < relevantMinY) relevantMinY = node.y0;
      if (node.y1 > relevantMaxY) relevantMaxY = node.y1;
    }
  });
  
  return type === "bottom" ? relevantMaxY : relevantMinY;
}

// Returns both minY and maxY extents of REAL nodes in the link's spanned columns.
function getLinkBaseExtents(link, nodes) {
  var relevantMinY = Math.min(link.source.y0, link.target.y0);
  var relevantMaxY = Math.max(link.source.y1, link.target.y1);

  nodes.forEach(function(node) {
    if (node.virtual || (node.name && node.name.indexOf('virtualNode') === 0)) {
      return;
    }
    if (node.column >= Math.min(link.source.column, link.target.column) && 
        node.column <= Math.max(link.source.column, link.target.column)) {
      if (node.y0 < relevantMinY) relevantMinY = node.y0;
      if (node.y1 > relevantMaxY) relevantMaxY = node.y1;
    }
  });

  return { minY: relevantMinY, maxY: relevantMaxY };
}
