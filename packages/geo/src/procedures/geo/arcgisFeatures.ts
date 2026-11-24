/**
 * geo.arcgisFeatures procedure
 *
 * Give the features of an ArcGIS layer in a box, page by page
 */

import { arcgisExchange, arcgisPage, bboxParts, type ArcgisFeature } from "../../features.js";
import { answerJson, geoSend, type MapDataContext } from "../../polite.js";
import type { GeoArcgisFeaturesInput, GeoArcgisFeaturesOutput } from "../../types.js";

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_MAX_FEATURES = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * This function gives the features of an ArcGIS layer in a box. It asks for the pages in
 * sequence, at the pace of the host of the layer, until the last page or `maxFeatures`. A box that
 * crosses the antimeridian gives two queries. A feature with an id is in the output one time.
 */
export async function geoArcgisFeatures(input: GeoArcgisFeaturesInput, context: MapDataContext): Promise<GeoArcgisFeaturesOutput> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxFeatures = input.maxFeatures ?? DEFAULT_MAX_FEATURES;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const features: ArcgisFeature[] = [];
  const ids = new Set<string>();
  let requests = 0;
  let truncated = false;
  for (const part of bboxParts(input.bbox)) {
    let offset = 0;
    for (;;) {
      const room = maxFeatures - features.length;
      if (room <= 0) {
        truncated = true;
        break;
      }
      const exchange = arcgisExchange({ layerUrl: input.layerUrl, bbox: part, where: input.where, outFields: input.outFields, returnGeometry: input.returnGeometry, maxAllowableOffset: input.maxAllowableOffset, offset, pageSize: Math.min(pageSize, room), userAgent: input.userAgent });
      const reply = await geoSend(context, { source: "ArcGIS layer", what: `the features of the layer from ${offset}`, exchange, timeoutMs });
      requests += 1;
      const page = arcgisPage(answerJson(reply, "The ArcGIS layer"));
      for (const feature of page.features) {
        const id = feature.id === undefined ? undefined : `${typeof feature.id}:${feature.id}`;
        if (id !== undefined && ids.has(id)) continue;
        if (id !== undefined) ids.add(id);
        features.push(feature);
      }
      if (!page.more) break;
      if (page.features.length === 0) {
        // The layer tells of more features but gives none: a next request gives the same page.
        truncated = true;
        break;
      }
      offset += page.features.length;
    }
    if (truncated) break;
  }
  return { collection: { type: "FeatureCollection", features }, requests, truncated };
}
