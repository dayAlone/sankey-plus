import { getNodeID } from "./nodeAttributes.js";
import { linkPerpendicularYToLinkSource, linkPerpendicularYToLinkTarget } from "./linkAttributes.js";


// sort ascending links by their source vertical position, y0
export function sortLinkSourceYAscending(link1, link2) {
    return link1.y0 - link2.y0;
}

// sort descending links by their source vertical position, y0
export function sortLinkSourceYDescending(link1, link2) {
    return link2.y0 - link1.y0;
}

// sort ascending links by their target vertical position, y1
export function sortLinkTargetYAscending(link1, link2) {
    return link1.y1 - link2.y1;
}

// sort descending links by their target vertical position, y1
export function sortLinkTargetYDescending(link1, link2) {
    return link2.y1 - link1.y1;
}

// sort links' breadth (ie top to bottom in a column), based on their source nodes' breadths
export function ascendingSourceBreadth(a, b) {
    return ascendingBreadth(a.source, b.source) || a.index - b.index;
}

// sort links' breadth (ie top to bottom in a column), based on their target nodes' breadths
export function ascendingTargetBreadth(a, b) {
    return ascendingBreadth(a.target, b.target) || a.index - b.index;
}

// sort nodes' breadth (ie top to bottom in a column)
// if both nodes have circular links, or both don't have circular links, then sort by the top (y0) of the node
// else push nodes that have top circular links to the top, and nodes that have bottom circular links to the bottom
export function ascendingBreadth(a, b) {
    if (a.partOfCycle === b.partOfCycle) {
      return a.y0 - b.y0;
    } else {
      if (a.circularLinkType === 'top' || b.circularLinkType === 'bottom') {
        return -1;
      } else {
        return 1;
      }
    }
  }


   // sort links based on the distance between the source and tartget node columns
  // if the same, then use Y position of the source node
  export function sortLinkColumnAscending(link1, link2) {
    if (linkColumnDistance(link1) == linkColumnDistance(link2)) {
      return link1.circularLinkType == 'bottom'
        ? sortLinkSourceYDescending(link1, link2)
        : sortLinkSourceYAscending(link1, link2);
    } else {
      return linkColumnDistance(link2) - linkColumnDistance(link1);
    }
  }

  function linkColumnDistance(link) {
    return link.target.column - link.source.column;
  }

  function isSelfLink(link, id) {
    return getNodeID(link.source, id) === getNodeID(link.target, id);
  }

  function typeIndex(link, typeOrder, typeAccessor) {
    if (!typeOrder || !typeAccessor) return 0;
    const t = typeAccessor(link);
    const idx = typeOrder.indexOf(t);
    return idx === -1 ? typeOrder.length : idx;
  }

  function typeCompare(link1, link2, typeOrder, typeAccessor) {
    if (!typeOrder || !typeAccessor) return 0;
    return typeIndex(link1, typeOrder, typeAccessor) - typeIndex(link2, typeOrder, typeAccessor);
  }

  function selfLinkWidthCompare(link1, link2, id) {
    // Stabilize ordering of self-loop circular links so stacking is consistent.
    if (!isSelfLink(link1, id) || !isSelfLink(link2, id)) return 0;
    return (link2.width || 0) - (link1.width || 0);
  }

  // sort and set the links' y0 for each node
export function sortSourceLinks(inputGraph, id, typeOrder = null, typeAccessor = null) {

  let graph = inputGraph;

  graph.nodes.forEach(function(node) {
    // move any nodes up which are off the bottom
    if (node.y + (node.y1 - node.y0) > graph.y1) {
      node.y = node.y - (node.y + (node.y1 - node.y0) - graph.y1);
    }

    var nodesSourceLinks = node.sourceLinks;
    var nodeSourceLinksLength = nodesSourceLinks.length;

    if (nodeSourceLinksLength > 1) {
      nodesSourceLinks.sort(function(link1, link2) {
        // If both are not circular...
        if (!link1.circular && !link2.circular) {
          // If the target nodes are the same column, then sort by the link's target y
          if (link1.target.column == link2.target.column) {
            const d = link1.y1 - link2.y1;
            if (d !== 0) return d;
          } else if (!sameInclines(link1, link2)) {
            // If the links slope in different directions, then sort by the link's target y
            const d = link1.y1 - link2.y1;
            if (d !== 0) return d;
          } else {
            // If the links slope in same directions, then sort by any overlap
            if (link1.target.column > link2.target.column) {
              var link2Adj = linkPerpendicularYToLinkTarget(link2, link1);
              const d = link1.y1 - link2Adj;
              if (d !== 0) return d;
            }
            if (link2.target.column > link1.target.column) {
              var link1Adj = linkPerpendicularYToLinkTarget(link1, link2);
              const d = link1Adj - link2.y1;
              if (d !== 0) return d;
            }
          }

          // Tie-breaker: type grouping (soft; only if geometry ties)
          const tc = typeCompare(link1, link2, typeOrder, typeAccessor);
          if (tc !== 0) return tc;

          return (link1.index || 0) - (link2.index || 0);
        }

        // If only one is circular, move top links up, or bottom links down
        if (link1.circular && !link2.circular) {
          return link1.circularLinkType == "top" ? -1 : 1;
        } else if (link2.circular && !link1.circular) {
          return link2.circularLinkType == "top" ? 1 : -1;
        }

        // If both links are circular...
        if (link1.circular && link2.circular) {
          // ...and they loop around different ways, move top up and bottom down
          if (link1.circularLinkType !== link2.circularLinkType) {
            return link1.circularLinkType == "top" ? -1 : 1;
          }

          // Stable stacking for self-loop circular links
          const sw = selfLinkWidthCompare(link1, link2, id);
          if (sw !== 0) return sw;

          if (link1.circularLinkType == "top") {
            // both top
            if (link1.target.column === link2.target.column) {
              const d = link1.target.y1 - link2.target.y1;
              if (d !== 0) return d;
            } else {
              const d = link2.target.column - link1.target.column;
              if (d !== 0) return d;
            }
          } else {
            // both bottom
            if (link1.target.column === link2.target.column) {
              const d = link2.target.y1 - link1.target.y1;
              if (d !== 0) return d;
            } else {
              const d = link1.target.column - link2.target.column;
              if (d !== 0) return d;
            }
          }

          return (link1.index || 0) - (link2.index || 0);
        }

        return (link1.index || 0) - (link2.index || 0);
      });
    }

    // update y0 for links (pack from top)
    var ySourceOffset = node.y0;
    nodesSourceLinks.forEach(function(link) {
      link.y0 = ySourceOffset + link.width / 2;
      ySourceOffset = ySourceOffset + link.width;
    });

    // correct any circular bottom links so they are at the bottom of the node
    nodesSourceLinks.forEach(function(link, i) {
      if (link.circular && link.circularLinkType == "bottom") {
        var j = i + 1;
        var offsetFromBottom = 0;
        for (j; j < nodeSourceLinksLength; j++) {
          offsetFromBottom = offsetFromBottom + nodesSourceLinks[j].width;
        }
        link.y0 = node.y1 - offsetFromBottom - link.width / 2;
      }
    });
  });

  return graph;
}


// sort and set the links' y1 for each node
export function sortTargetLinks(inputGraph, id, typeOrder = null, typeAccessor = null) {
  let graph = inputGraph;

  graph.nodes.forEach(function(node) {
    var nodesTargetLinks = node.targetLinks;
    var nodesTargetLinksLength = nodesTargetLinks.length;

    if (nodesTargetLinksLength > 1) {
      nodesTargetLinks.sort(function(link1, link2) {
        // If both are not circular, base on the source y position
        if (!link1.circular && !link2.circular) {
          if (link1.source.column == link2.source.column) {
            const d = link1.y0 - link2.y0;
            if (d !== 0) return d;
          } else if (!sameInclines(link1, link2)) {
            const d = link1.y0 - link2.y0;
            if (d !== 0) return d;
          } else {
            // get the angle of the link to the further source node (ie the smaller column)
            if (link2.source.column < link1.source.column) {
              var link2Adj = linkPerpendicularYToLinkSource(link2, link1);
              const d = link1.y0 - link2Adj;
              if (d !== 0) return d;
            }
            if (link1.source.column < link2.source.column) {
              var link1Adj = linkPerpendicularYToLinkSource(link1, link2);
              const d = link1Adj - link2.y0;
              if (d !== 0) return d;
            }
          }

          // Tie-breaker: type grouping (soft; only if geometry ties)
          const tc = typeCompare(link1, link2, typeOrder, typeAccessor);
          if (tc !== 0) return tc;

          return (link1.index || 0) - (link2.index || 0);
        }

        // If only one is circular, move top links up, or bottom links down
        if (link1.circular && !link2.circular) {
          return link1.circularLinkType == "top" ? -1 : 1;
        } else if (link2.circular && !link1.circular) {
          return link2.circularLinkType == "top" ? 1 : -1;
        }

        // If both links are circular...
        if (link1.circular && link2.circular) {
          // ...and they loop around different ways, move top up and bottom down
          if (link1.circularLinkType !== link2.circularLinkType) {
            return link1.circularLinkType == "top" ? -1 : 1;
          }

          // Stable stacking for self-loop circular links
          const sw = selfLinkWidthCompare(link1, link2, id);
          if (sw !== 0) return sw;

          if (link1.circularLinkType == "top") {
            // both top
            if (link1.source.column === link2.source.column) {
              const d = link1.source.y1 - link2.source.y1;
              if (d !== 0) return d;
            } else {
              const d = link1.source.column - link2.source.column;
              if (d !== 0) return d;
            }
          } else {
            // both bottom
            if (link1.source.column === link2.source.column) {
              const d = link1.source.y1 - link2.source.y1;
              if (d !== 0) return d;
            } else {
              const d = link2.source.column - link1.source.column;
              if (d !== 0) return d;
            }
          }

          return (link1.index || 0) - (link2.index || 0);
        }

        return (link1.index || 0) - (link2.index || 0);
      });
    }

    // update y1 for links (pack from top)
    var yTargetOffset = node.y0;
    nodesTargetLinks.forEach(function(link) {
      link.y1 = yTargetOffset + link.width / 2;
      yTargetOffset = yTargetOffset + link.width;
    });

    // correct any circular bottom links so they are at the bottom of the node
    nodesTargetLinks.forEach(function(link, i) {
      if (link.circular && link.circularLinkType == "bottom") {
        var j = i + 1;
        var offsetFromBottom = 0;
        for (j; j < nodesTargetLinksLength; j++) {
          offsetFromBottom = offsetFromBottom + nodesTargetLinks[j].width;
        }
        link.y1 = node.y1 - offsetFromBottom - link.width / 2;
      }
    });
  });

  return graph;
}

export function sortLinks(inputGraph) {
  let g = inputGraph;

  for (var iteration = 0; iteration < linkSortingIterations; iteration++) {
    g = sortSourceLinks(g);
    g = sortTargetLinks(g);
  }

  return g;
}


// test if links both slope up, or both slope down
function sameInclines(link1, link2) {
  return incline(link1) == incline(link2);
}

// returns the slope of a link, from source to target
// up => slopes up from source to target
// down => slopes down from source to target
function incline(link) {
  return link.y0 - link.y1 > 0 ? 'up' : 'down';
}