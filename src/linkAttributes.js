import { getNodeID } from './nodeAttributes.js';


// returns the slope of a link, from source to target
// up => slopes up from source to target
// down => slopes down from source to target
export function incline(link) {
    return link.y0 - link.y1 > 0 ? 'up' : 'down';
}

// check if link is self linking, ie links a node to the same node
export function selfLinking(link, id) {
    return getNodeID(link.source, id) == getNodeID(link.target, id);
}

// Check if a circular link is the only circular link for both its source and target node
export function onlyCircularLink(link) {
    var nodeSourceLinks = link.source.sourceLinks;
    var sourceCount = 0;
    nodeSourceLinks.forEach(function (l) {
        sourceCount = l.circular ? sourceCount + 1 : sourceCount;
    });

    var nodeTargetLinks = link.target.targetLinks;
    var targetCount = 0;
    nodeTargetLinks.forEach(function (l) {
        targetCount = l.circular ? targetCount + 1 : targetCount;
    });

    if (sourceCount > 1 || targetCount > 1) {
        return false;
    } else {
        return true;
    }
}

// return the distance between the link's target and source node, in terms of the nodes' column
export function linkColumnDistance(link) {
    return link.target.column - link.source.column;
}

// return the distance between the link's target and source node, in terms of the nodes' X coordinate
export function linkXLength(link) {
    return link.target.x0 - link.source.x1;
}

// Return the Y coordinate on the longerLink path at shorterLink's target X position.
// Used for sorting source links - both links share the same source node.
// We project longerLink to find where it would be at shorterLink's target X.
export function linkPerpendicularYToLinkTarget(longerLink, shorterLink) {
    var ratio = linkXLength(shorterLink) / linkXLength(longerLink);
    return longerLink.y0 + (longerLink.y1 - longerLink.y0) * ratio;
}

// Return the Y coordinate on the longerLink path at shorterLink's source X position.
// Used for sorting target links - both links share the same target node.
// We project longerLink to find where it would be at shorterLink's source X.
export function linkPerpendicularYToLinkSource(longerLink, shorterLink) {
    // Distance from longerLink's source to shorterLink's source, as a ratio of longerLink's length
    var ratio = (linkXLength(longerLink) - linkXLength(shorterLink)) / linkXLength(longerLink);
    return longerLink.y0 + (longerLink.y1 - longerLink.y0) * ratio;
}