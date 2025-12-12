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

        // bottom links
        if (link.circularLinkType == "bottom") {
          link.circularPathData.verticalFullExtent =
            Math.max(graph.y1, link.source.y1, link.target.y1) +
            verticalMargin +
            link.circularPathData.verticalBuffer;
          link.circularPathData.verticalRightInnerExtent =
            link.circularPathData.verticalFullExtent -
            link.circularPathData.rightLargeArcRadius;
          link.circularPathData.verticalLeftInnerExtent =
            link.circularPathData.verticalFullExtent -
            link.circularPathData.leftLargeArcRadius;
        } else {
          // top links
          link.circularPathData.verticalFullExtent =
            minY - verticalMargin - link.circularPathData.verticalBuffer;
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
      // Check if this forward link should bypass (go around) instead of crossing
      var shouldBypass = checkIfLinkShouldBypass(link, graph, id);
      
      if (shouldBypass) {
        // Create a bypass path that goes above/below the nodes
        link.path = createBypassPathString(link, graph, baseRadius);
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
    }
  });

  return graph;
}

// creates vertical buffer values per set of top/bottom links
function calcVerticalBuffer(links, id, circularLinkGap) {
  links.sort(sortLinkColumnAscending);
  links.forEach(function (link, i) {
    var buffer = 0;

    // Self-links always get minimal buffer - they stay close to their node
    if (selfLinking(link, id)) {
      link.circularPathData.verticalBuffer = buffer + link.width / 2;
    } else {
      var j = 0;
      for (j; j < i; j++) {
        // Don't consider self-links when calculating buffer for other links
        if (!selfLinking(links[j], id) && circularLinksCross(links[i], links[j])) {
          var bufferOverThisLink =
            links[j].circularPathData.verticalBuffer +
            links[j].width / 2 +
            circularLinkGap;
          buffer = bufferOverThisLink > buffer ? bufferOverThisLink : buffer;
        }
      }

      link.circularPathData.verticalBuffer = buffer + link.width / 2;
    }
  });

  return links;
}

// Check if two circular links potentially overlap
function circularLinksCross(link1, link2) {
  if (link1.source.column < link2.target.column) {
    return false;
  } else if (link1.target.column > link2.source.column) {
    return false;
  } else {
    return true;
  }
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

// Check if a forward link should bypass (go around) instead of crossing through nodes
function checkIfLinkShouldBypass(link, graph, id) {
  // Get source and target positions
  var sourceY = link.y0;
  var targetY = link.y1;
  var sourceX = link.source.x1;
  var targetX = link.target.x0;
  
  // Only consider forward links that span multiple columns
  var columnSpan = link.target.column - link.source.column;
  if (columnSpan <= 1) return false;
  
  // Check vertical distance
  var verticalDistance = Math.abs(targetY - sourceY);
  
  // Count how many nodes this link would cross
  var nodesCrossed = 0;
  var minY = Math.min(sourceY, targetY);
  var maxY = Math.max(sourceY, targetY);
  
  graph.nodes.forEach(function(node) {
    // Check if node is between source and target columns
    if (node.column > link.source.column && node.column < link.target.column) {
      // Check if node is in the vertical path of the link
      var nodeCenter = (node.y0 + node.y1) / 2;
      if (nodeCenter > minY && nodeCenter < maxY) {
        nodesCrossed++;
      }
    }
  });
  
  // Bypass if crossing more than 1 node and vertical distance is significant
  return nodesCrossed >= 1 && verticalDistance > 50;
}

// Create a bypass path that goes above the nodes
function createBypassPathString(link, graph, baseRadius) {
  var sourceX = link.source.x1;
  var sourceY = link.y0;
  var targetX = link.target.x0;
  var targetY = link.y1;
  
  var arcRadius = baseRadius + link.width / 2;
  var buffer = 5;
  
  // Determine if bypass should go top or bottom
  // Go top if source is higher, bottom if source is lower
  var goTop = sourceY <= targetY;
  
  // Find the extent (how far up/down to go)
  var extent;
  if (goTop) {
    // Find minimum y of all nodes between source and target columns
    var minNodeY = sourceY;
    graph.nodes.forEach(function(node) {
      if (node.column >= link.source.column && node.column <= link.target.column) {
        if (node.y0 < minNodeY) minNodeY = node.y0;
      }
    });
    extent = minNodeY - arcRadius * 2 - link.width;
  } else {
    // Find maximum y of all nodes between source and target columns  
    var maxNodeY = sourceY;
    graph.nodes.forEach(function(node) {
      if (node.column >= link.source.column && node.column <= link.target.column) {
        if (node.y1 > maxNodeY) maxNodeY = node.y1;
      }
    });
    extent = maxNodeY + arcRadius * 2 + link.width;
  }
  
  var pathString;
  
  if (goTop) {
    // Path going above
    pathString =
      "M" + sourceX + " " + sourceY + " " +
      "L" + (sourceX + buffer) + " " + sourceY + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 0 " +
      (sourceX + buffer + arcRadius) + " " + (sourceY - arcRadius) + " " +
      "L" + (sourceX + buffer + arcRadius) + " " + (extent + arcRadius) + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 0 " +
      (sourceX + buffer + arcRadius * 2) + " " + extent + " " +
      "L" + (targetX - buffer - arcRadius * 2) + " " + extent + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 0 " +
      (targetX - buffer - arcRadius) + " " + (extent + arcRadius) + " " +
      "L" + (targetX - buffer - arcRadius) + " " + (targetY - arcRadius) + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 0 " +
      (targetX - buffer) + " " + targetY + " " +
      "L" + targetX + " " + targetY;
  } else {
    // Path going below
    pathString =
      "M" + sourceX + " " + sourceY + " " +
      "L" + (sourceX + buffer) + " " + sourceY + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 1 " +
      (sourceX + buffer + arcRadius) + " " + (sourceY + arcRadius) + " " +
      "L" + (sourceX + buffer + arcRadius) + " " + (extent - arcRadius) + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 1 " +
      (sourceX + buffer + arcRadius * 2) + " " + extent + " " +
      "L" + (targetX - buffer - arcRadius * 2) + " " + extent + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 1 " +
      (targetX - buffer - arcRadius) + " " + (extent - arcRadius) + " " +
      "L" + (targetX - buffer - arcRadius) + " " + (targetY + arcRadius) + " " +
      "A" + arcRadius + " " + arcRadius + " 0 0 1 " +
      (targetX - buffer) + " " + targetY + " " +
      "L" + targetX + " " + targetY;
  }
  
  return pathString;
}
