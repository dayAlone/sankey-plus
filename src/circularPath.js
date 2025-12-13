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

  calcVerticalBuffer(topLinks, id, circularLinkGap);

  var bottomLinks = graph.links.filter(function (l) {
    return l.circularLinkType == "bottom";
  });

  calcVerticalBuffer(bottomLinks, id, circularLinkGap);

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
function calcVerticalBuffer(links, id, circularLinkGap) {
  links.sort(sortLinkColumnAscending);
  
  console.log("=== calcVerticalBuffer ===");
  links.forEach(function(l, idx) {
    var srcName = l.source.name || l.source.index;
    var tgtName = l.target.name || l.target.index;
    console.log(`  [${idx}] ${srcName} -> ${tgtName}, col ${l.source.column}->${l.target.column}, w=${l.width.toFixed(2)}`);
  });
  
  links.forEach(function (link, i) {
    var buffer = 0;
    var srcName = link.source.name || link.source.index;
    var tgtName = link.target.name || link.target.index;

    if (selfLinking(link, id)) {
      link.circularPathData.verticalBuffer = buffer + link.width / 2;
    } else {
      for (var j = 0; j < i; j++) {
        if (!selfLinking(links[j], id) && circularLinksActuallyCross(links[i], links[j])) {
          var prevSrcName = links[j].source.name || links[j].source.index;
          var prevTgtName = links[j].target.name || links[j].target.index;
          // Smaller gap for links to same target
          var sameTarget = (links[i].target.name || links[i].target.index) === 
                           (links[j].target.name || links[j].target.index);
          var gap = sameTarget ? Math.max(1, circularLinkGap / 2) : circularLinkGap;
          
          var bufferOverThisLink =
            links[j].circularPathData.verticalBuffer +
            links[j].width / 2 +
            gap;
          
          console.log(`  [${i}] ${srcName}->${tgtName} CROSSES [${j}] ${prevSrcName}->${prevTgtName}, gap=${gap}, buf=${bufferOverThisLink.toFixed(2)}`);
          
          buffer = bufferOverThisLink > buffer ? bufferOverThisLink : buffer;
        }
      }

      link.circularPathData.verticalBuffer = buffer + link.width / 2;
      console.log(`  => [${i}] ${srcName}->${tgtName} final vBuf = ${link.circularPathData.verticalBuffer.toFixed(2)}`);
    }
  });

  return links;
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
  
  // Same source column = right vertical segments overlap
  if (link1Source === link2Source) return true;
  
  // Same target column = left vertical segments overlap  
  if (link1Target === link2Target) return true;
  
  // Boundary touching: one link's target = other link's source (verticals at same column)
  if (link1Target === link2Source || link1Source === link2Target) return true;
  
  // One link's vertical segment is strictly within the other's horizontal span
  if (link2Source > link1Min && link2Source < link1Max) return true;
  if (link2Target > link1Min && link2Target < link1Max) return true;
  if (link1Source > link2Min && link1Source < link2Max) return true;
  if (link1Target > link2Min && link1Target < link2Max) return true;
  
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
