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

  // add the base data for each link
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

        // Margin for self-links - enough for a nice rounded loop
        var selfLinkMargin = selfLinkRadius * 2 + link.width;

        if (link.circularLinkType == "bottom") {
          link.circularPathData.verticalFullExtent =
            link.source.y1 + selfLinkMargin;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent - selfLinkRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent - selfLinkRadius;
        } else {
          // top links
          link.circularPathData.verticalFullExtent =
            link.source.y0 - selfLinkMargin;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent + selfLinkRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent + selfLinkRadius;
        }
      } else {
        // else calculate normally
        // add right extent coordinates, based on links with same source column and circularLink type
        var thisColumn = link.source.column;
        var thisCircularLinkType = link.circularLinkType;
        var sameColumnLinks = graph.links.filter(function (l) {
          return (
            l.source.column == thisColumn &&
            l.circularLinkType == thisCircularLinkType
          );
        });

        if (link.circularLinkType == "bottom") {
          sameColumnLinks.sort(sortLinkSourceYDescending);
        } else {
          sameColumnLinks.sort(sortLinkSourceYAscending);
        }

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

        // add left extent coordinates, based on links with same target column and circularLink type
        thisColumn = link.target.column;
        sameColumnLinks = graph.links.filter(function (l) {
          return (
            l.target.column == thisColumn &&
            l.circularLinkType == thisCircularLinkType
          );
        });
        if (link.circularLinkType == "bottom") {
          sameColumnLinks.sort(sortLinkTargetYDescending);
        } else {
          sameColumnLinks.sort(sortLinkTargetYAscending);
        }

        radiusOffset = 0;
        sameColumnLinks.forEach(function (l, i) {
          if (l.circularLinkID == link.circularLinkID) {
            link.circularPathData.leftSmallArcRadius =
              baseRadius + link.width / 2 + radiusOffset;
            link.circularPathData.leftLargeArcRadius =
              baseRadius + link.width / 2 + i * circularLinkGap + radiusOffset;
          }
          radiusOffset = radiusOffset + l.width;
        });

        // Find min/max Y of REAL nodes between source and target columns
        // Exclude virtual nodes
        var relevantMinY = Math.min(link.source.y0, link.target.y0);
        var relevantMaxY = Math.max(link.source.y1, link.target.y1);
        
        graph.nodes.forEach(function(node) {
          if (node.virtual || (node.name && node.name.indexOf('virtualNode') === 0)) {
            return;
          }
          if (node.column >= Math.min(link.source.column, link.target.column) && 
              node.column <= Math.max(link.source.column, link.target.column)) {
            if (node.y0 < relevantMinY) relevantMinY = node.y0;
            if (node.y1 > relevantMaxY) relevantMaxY = node.y1;
          }
        });

        // Limit base offset based on column height
        var columnHeight = relevantMaxY - relevantMinY;
        var maxBaseOffset = Math.max(verticalMargin + link.width + 10, columnHeight * 0.25);
        var baseOffset = Math.min(verticalMargin, maxBaseOffset);
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

    if (link.circular) {
      link.path = createCircularPathString(link);
    } else {
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
      link.path = normalPath(link);
    }
  });

  return graph;
}

// creates vertical buffer values per set of top/bottom links
function calcVerticalBuffer(links, nodes, id, circularLinkGap) {
  // Pre-calculate base Y for each link to optimize collision logic
  links.forEach(function(link) {
    link.circularPathData.baseY = getLinkBaseY(link, nodes, link.circularLinkType);
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

  // Sort within each group by ascending distance (shortest spans first)
  Object.values(groups).forEach(function(group) {
    group.sort(function(a, b) {
      var distA = Math.abs(a.source.column - a.target.column);
      var distB = Math.abs(b.source.column - b.target.column);
      return distA - distB;
    });
  });

  // Order groups to minimize crossings:
  // - Prefer groups with smaller average span first (inner)
  // - Larger-span groups later (outer)
  // This avoids the case where a long-span link is processed too early and ends up "inner",
  // causing it to cross the vertical legs of shorter links from the same source.
  var orderedGroups = Object.keys(groups)
    .map(function(col) { return { col: +col, links: groups[col] }; })
    .sort(function(a, b) {
      // Average span ascending
      var avgDistA = a.links.reduce(function(sum, l) {
        return sum + Math.abs(l.source.column - l.target.column);
      }, 0) / a.links.length;
      var avgDistB = b.links.reduce(function(sum, l) {
        return sum + Math.abs(l.source.column - l.target.column);
      }, 0) / b.links.length;
      if (avgDistA !== avgDistB) {
        return avgDistA - avgDistB;
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

    // Find current group
    var currentGroupIndex = orderedGroups.findIndex(function(g) {
      return g.col === link.target.column;
    });
    var currentGroup = orderedGroups[currentGroupIndex];
    var linkIndexInGroup = currentGroup.links.indexOf(link);

    if (selfLinking(link, id)) {
      // For self-links, calculate buffer based on overlaps with other links
      // Self-links are always "inner" relative to other links from the same node,
      // but they might overlap with other self-links or external circular links.
      
      // Basic self-link buffer
      link.circularPathData.verticalBuffer = buffer + link.width / 2;
      
      // Check for collisions with other links processed so far
      // For self-links, check all previous (cross-group and same-group)
      for (var j = 0; j < i; j++) {
        var prevLink = orderedLinks[j];
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
            
          // Use same offset correction logic as for regular links
          var thisBaseY = link.circularPathData.baseY;
          var prevBaseY = prevLink.circularPathData.baseY;
          var offsetCorrection = 0;
          
          if (link.circularLinkType === "bottom") {
             offsetCorrection = prevBaseY - thisBaseY;
          } else {
             offsetCorrection = thisBaseY - prevBaseY;
          }
          
          bufferOverThisLink += offsetCorrection;
          buffer = bufferOverThisLink > buffer ? bufferOverThisLink : buffer;
        }
      }
      
      link.circularPathData.verticalBuffer = buffer + link.width / 2;
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
          
          if (link.circularLinkType === "bottom") {
             // For bottom links (curve down), if this link is naturally lower (larger BaseY)
             // than the previous link, we need less buffer.
             offsetCorrection = prevBaseY - thisBaseY;
          } else {
             // For top links (curve up), if this link is naturally higher (smaller BaseY)
             // than the previous link, we need less buffer.
             offsetCorrection = thisBaseY - prevBaseY;
          }
          
          bufferOverThisLink += offsetCorrection;

          console.log(`  [${i}] ${srcName}->${tgtName} CROSSES [${j}] ${prevSrcName}->${prevTgtName}, gap=${gap}, buf=${bufferOverThisLink.toFixed(2)}`);

          buffer = bufferOverThisLink > buffer ? bufferOverThisLink : buffer;
        }
      }

      link.circularPathData.verticalBuffer = buffer + link.width / 2;
      console.log(`  => [${i}] ${srcName}->${tgtName} final vBuf = ${link.circularPathData.verticalBuffer.toFixed(2)}`);
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
  
  // Calculate horizontal ranges
  var link1Min = Math.min(link1Source, link1Target);
  var link1Max = Math.max(link1Source, link1Target);
  var link2Min = Math.min(link2Source, link2Target);
  var link2Max = Math.max(link2Source, link2Target);
  
  // First check: do horizontal ranges overlap or touch at boundary?
  // If ranges don't overlap at all, links can be at same Y level without crossing
  var rangesOverlap = link1Max >= link2Min && link2Max >= link1Min;
  
  if (!rangesOverlap) {
    return false;
  }
  
  // Ranges overlap - check for specific crossing conditions
  
  var sameSource = (link1Source === link2Source);
  var sameTarget = (link1Target === link2Target);
  
  // Same TARGET column = left vertical segments would overlap at target
  // This includes same-source-same-target links
  if (sameTarget) return true;

  // Same SOURCE column = right vertical segments overlap at source.
  // If we don't stack these, the "legs" of a shorter link can intersect the horizontal
  // segment of a longer link when their spans overlap. Force stacking.
  if (sameSource) return true;
  
  // Boundary touching: one link's target = other link's source (verticals at same column)
  if (link1Target === link2Source || link1Source === link2Target) return true;
  
  // Self-link handling:
  // If one is a self-link, it spans only one column (source=target).
  // Overlap occurs if the other link spans this column.
  var link1Self = (link1Source === link1Target);
  var link2Self = (link2Source === link2Target);
  
  if (link1Self || link2Self) {
    var selfCol = link1Self ? link1Source : link2Source;
    var otherMin = link1Self ? link2Min : link1Min;
    var otherMax = link1Self ? link2Max : link1Max;
    
    // If self-link is at the same column as the other link's start or end, it might overlap
    // But if the other link just starts/ends there without spanning across, it's fine?
    // Actually, any link spanning across selfCol overlaps the self-link bubble
    if (selfCol >= otherMin && selfCol <= otherMax) return true;
  }

  // Horizontal ranges overlap significantly (not just touching at boundary)
  // Only force stacking if they target the same column (same vertical segments)
  // For different target columns, allow them to cross without stacking to avoid visual overlap issues
  if (sameTarget) {
    var overlapStart = Math.max(link1Min, link2Min);
    var overlapEnd = Math.min(link1Max, link2Max);
    if (overlapEnd > overlapStart) {
      // There's actual horizontal overlap (more than just touching at a point)
      return true;
    }
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
