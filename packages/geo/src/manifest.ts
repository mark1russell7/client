// The manifest of @mark1russell7/geo 0.5.3, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/geo",
  "version": "0.5.3",
  "entry": ".",
  "namespace": [
    "geo"
  ],
  "$defs": {
    "BBox": {
      "type": "object",
      "properties": {
        "west": {
          "type": "number"
        },
        "south": {
          "type": "number"
        },
        "east": {
          "type": "number"
        },
        "north": {
          "type": "number"
        }
      },
      "required": [
        "west",
        "south",
        "east",
        "north"
      ]
    },
    "BufferOptions": {
      "type": "object",
      "properties": {
        "tolerance": {
          "type": "number",
          "description": "The tolerance of the boundary, in the unit of the distance. It is more than 0 and less than the distance. The default is the distance over 100. A small tolerance gives a boundary nearer to the true boundary, with more cells."
        },
        "maxCells": {
          "type": "number",
          "description": "The limit of the count of the cells near the boundary, a value of 1 or more. The default is `DEFAULT_MAX_BUFFER_CELLS`. A buffer that needs more cells gives the error `too-many-cells`."
        }
      }
    },
    "CircleOptions": {
      "type": "object",
      "properties": {
        "vertices": {
          "type": "number",
          "description": "The number of the vertices on the circle, an integer from 3 to `MAX_CIRCLE_VERTICES`. The default is `DEFAULT_CIRCLE_VERTICES`. More vertices give a polygon nearer to the circle."
        }
      }
    },
    "Ellipsoid": {
      "type": "object",
      "properties": {
        "equatorialRadiusMeters": {
          "type": "number",
          "description": "The equatorial radius `a` in metres. It is a finite number more than 0."
        },
        "flattening": {
          "type": "number",
          "description": "The flattening `f`, equal to `(a - b) / a` for the polar radius `b`. It is a finite number less than 1. A negative flattening gives a prolate ellipsoid. The results are accurate for an absolute flattening of 1/50 or less."
        }
      },
      "required": [
        "equatorialRadiusMeters",
        "flattening"
      ]
    },
    "FeatureCollection_Feature_Geometry_null_GeoJsonProperties": {
      "type": "object",
      "properties": {
        "type": {
          "const": "FeatureCollection"
        },
        "features": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Feature_Geometry_null_GeoJsonProperties_2"
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "features"
      ]
    },
    "Feature_Geometry_null_GeoJsonProperties": {
      "type": "object",
      "properties": {
        "type": {
          "const": "Feature"
        },
        "geometry": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "$ref": "#/$defs/GeometryCollection"
            },
            {
              "$ref": "#/$defs/LineString"
            },
            {
              "$ref": "#/$defs/MultiLineString"
            },
            {
              "$ref": "#/$defs/MultiPoint"
            },
            {
              "$ref": "#/$defs/MultiPolygon"
            },
            {
              "$ref": "#/$defs/Point"
            },
            {
              "$ref": "#/$defs/Polygon"
            }
          ]
        },
        "properties": {
          "$ref": "#/$defs/GeoJsonProperties"
        },
        "id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ]
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "geometry",
        "properties"
      ]
    },
    "Feature_Geometry_null_GeoJsonProperties_2": {
      "type": "object",
      "properties": {
        "type": {
          "const": "Feature"
        },
        "geometry": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "$ref": "#/$defs/GeometryCollection"
            },
            {
              "$ref": "#/$defs/LineString"
            },
            {
              "$ref": "#/$defs/MultiLineString"
            },
            {
              "$ref": "#/$defs/MultiPoint"
            },
            {
              "$ref": "#/$defs/MultiPolygon"
            },
            {
              "$ref": "#/$defs/Point"
            },
            {
              "$ref": "#/$defs/Polygon"
            }
          ]
        },
        "properties": {
          "$ref": "#/$defs/GeoJsonProperties"
        },
        "id": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ]
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "geometry",
        "properties"
      ]
    },
    "GeoJson": {
      "anyOf": [
        {
          "$ref": "#/$defs/Feature_Geometry_null_GeoJsonProperties"
        },
        {
          "$ref": "#/$defs/FeatureCollection_Feature_Geometry_null_GeoJsonProperties"
        },
        {
          "$ref": "#/$defs/GeometryCollection"
        },
        {
          "$ref": "#/$defs/LineString"
        },
        {
          "$ref": "#/$defs/MultiLineString"
        },
        {
          "$ref": "#/$defs/MultiPoint"
        },
        {
          "$ref": "#/$defs/MultiPolygon"
        },
        {
          "$ref": "#/$defs/Point"
        },
        {
          "$ref": "#/$defs/Polygon"
        }
      ]
    },
    "GeoJsonBBox": {
      "anyOf": [
        {
          "type": "array",
          "prefixItems": [
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            }
          ],
          "minItems": 4,
          "maxItems": 4
        },
        {
          "type": "array",
          "prefixItems": [
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            }
          ],
          "minItems": 6,
          "maxItems": 6
        }
      ]
    },
    "GeoJsonProperties": {
      "anyOf": [
        {
          "type": "null"
        },
        {
          "type": "object",
          "properties": {},
          "additionalProperties": {}
        }
      ]
    },
    "GeodesicDirect": {
      "type": "object",
      "properties": {
        "point": {
          "$ref": "#/$defs/LatLon",
          "description": "The end point. Its longitude is normalized."
        },
        "finalBearing": {
          "type": "number",
          "description": "The bearing of the geodesic at the end point, in degrees clockwise from north, from 0 to less than 360."
        }
      },
      "required": [
        "point",
        "finalBearing"
      ]
    },
    "GeodesicInverse": {
      "type": "object",
      "properties": {
        "meters": {
          "type": "number",
          "description": "The length of the geodesic in metres."
        },
        "initialBearing": {
          "type": "number",
          "description": "The bearing of the geodesic at the first point, in degrees clockwise from north, from 0 to less than 360."
        },
        "finalBearing": {
          "type": "number",
          "description": "The bearing of the geodesic at the second point, away from the first point, from 0 to less than 360."
        }
      },
      "required": [
        "meters",
        "initialBearing",
        "finalBearing"
      ]
    },
    "GeohashCell": {
      "type": "object",
      "properties": {
        "south": {
          "type": "number"
        },
        "west": {
          "type": "number"
        },
        "north": {
          "type": "number"
        },
        "east": {
          "type": "number"
        },
        "center": {
          "$ref": "#/$defs/LatLon"
        }
      },
      "required": [
        "south",
        "west",
        "north",
        "east",
        "center"
      ]
    },
    "GeohashDirection": {
      "enum": [
        "e",
        "n",
        "ne",
        "nw",
        "s",
        "se",
        "sw",
        "w"
      ]
    },
    "GeohashNeighbors": {
      "type": "object",
      "properties": {
        "n": {
          "type": "string"
        },
        "ne": {
          "type": "string"
        },
        "e": {
          "type": "string"
        },
        "se": {
          "type": "string"
        },
        "s": {
          "type": "string"
        },
        "sw": {
          "type": "string"
        },
        "w": {
          "type": "string"
        },
        "nw": {
          "type": "string"
        }
      }
    },
    "Geometry": {
      "anyOf": [
        {
          "$ref": "#/$defs/GeometryCollection"
        },
        {
          "$ref": "#/$defs/LineString"
        },
        {
          "$ref": "#/$defs/MultiLineString"
        },
        {
          "$ref": "#/$defs/MultiPoint"
        },
        {
          "$ref": "#/$defs/MultiPolygon"
        },
        {
          "$ref": "#/$defs/Point"
        },
        {
          "$ref": "#/$defs/Polygon"
        }
      ]
    },
    "GeometryCollection": {
      "type": "object",
      "properties": {
        "type": {
          "const": "GeometryCollection"
        },
        "geometries": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Geometry"
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "geometries"
      ]
    },
    "LatLon": {
      "type": "object",
      "properties": {
        "lat": {
          "type": "number",
          "description": "The latitude in degrees, from -90 to 90."
        },
        "lon": {
          "type": "number",
          "description": "The longitude in degrees. A normalized longitude is from -180 to less than 180."
        }
      },
      "required": [
        "lat",
        "lon"
      ]
    },
    "LineString": {
      "type": "object",
      "properties": {
        "type": {
          "const": "LineString"
        },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "array",
            "prefixItems": [
              {
                "type": "number"
              },
              {
                "type": "number"
              },
              {
                "type": "number"
              }
            ],
            "minItems": 2
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "coordinates"
      ]
    },
    "MultiLineString": {
      "type": "object",
      "properties": {
        "type": {
          "const": "MultiLineString"
        },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 2
            }
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "coordinates"
      ]
    },
    "MultiPoint": {
      "type": "object",
      "properties": {
        "type": {
          "const": "MultiPoint"
        },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "array",
            "prefixItems": [
              {
                "type": "number"
              },
              {
                "type": "number"
              },
              {
                "type": "number"
              }
            ],
            "minItems": 2
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "coordinates"
      ]
    },
    "MultiPolygon": {
      "type": "object",
      "properties": {
        "type": {
          "const": "MultiPolygon"
        },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "array",
                "prefixItems": [
                  {
                    "type": "number"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "number"
                  }
                ],
                "minItems": 2
              }
            }
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "coordinates"
      ]
    },
    "Point": {
      "type": "object",
      "properties": {
        "type": {
          "const": "Point"
        },
        "coordinates": {
          "type": "array",
          "prefixItems": [
            {
              "type": "number"
            },
            {
              "type": "number"
            },
            {
              "type": "number"
            }
          ],
          "minItems": 2
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "coordinates"
      ]
    },
    "PointLocation": {
      "enum": [
        "boundary",
        "inside",
        "outside"
      ]
    },
    "Polygon": {
      "type": "object",
      "properties": {
        "type": {
          "const": "Polygon"
        },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 2
            }
          }
        },
        "bbox": {
          "anyOf": [
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 4,
              "maxItems": 4
            },
            {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 6,
              "maxItems": 6
            }
          ],
          "description": "The bounding box of the object (RFC 7946, section 5)."
        }
      },
      "required": [
        "type",
        "coordinates"
      ]
    },
    "Region": {
      "anyOf": [
        {
          "$ref": "#/$defs/MultiPolygon"
        },
        {
          "$ref": "#/$defs/Polygon"
        }
      ]
    },
    "RingWinding": {
      "enum": [
        "clockwise",
        "counterclockwise",
        "degenerate"
      ]
    },
    "UnitVector": {
      "type": "object",
      "properties": {
        "x": {
          "type": "number"
        },
        "y": {
          "type": "number"
        },
        "z": {
          "type": "number"
        }
      },
      "required": [
        "x",
        "y",
        "z"
      ]
    }
  },
  "procedures": [
    {
      "name": "bboxCenter",
      "path": [
        "geo",
        "bboxCenter"
      ],
      "description": "This function gives the middle of a box. Its latitude is the middle of the latitudes of the box. Its longitude is the middle of the arc of longitudes from the west to the east. For a box that crosses the antimeridian, the middle is on the arc across the antimeridian.",
      "params": [
        "box"
      ],
      "input": {
        "type": "object",
        "properties": {
          "box": {
            "$ref": "#/$defs/BBox"
          }
        },
        "required": [
          "box"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bboxContains",
      "path": [
        "geo",
        "bboxContains"
      ],
      "description": "This function gives `true` when the closed box has the point. A box that reaches a pole has the pole for each longitude.",
      "params": [
        "box",
        "point"
      ],
      "input": {
        "type": "object",
        "properties": {
          "box": {
            "$ref": "#/$defs/BBox"
          },
          "point": {
            "$ref": "#/$defs/LatLon"
          }
        },
        "required": [
          "box",
          "point"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bboxIntersects",
      "path": [
        "geo",
        "bboxIntersects"
      ],
      "description": "This function gives `true` when the two closed boxes have a common point. Two boxes that touch on an edge have a common point. Two boxes that reach the same pole have the pole.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/BBox"
          },
          "b": {
            "$ref": "#/$defs/BBox"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bboxOfGeoJson",
      "path": [
        "geo",
        "bboxOfGeoJson"
      ],
      "description": "This function gives the smallest bounding box of a GeoJSON object. It reads the coordinates, not the member `bbox`.",
      "params": [
        "geojson"
      ],
      "input": {
        "type": "object",
        "properties": {
          "geojson": {
            "$ref": "#/$defs/GeoJson"
          }
        },
        "required": [
          "geojson"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/BBox"
          },
          {
            "type": "null"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bboxOfPoints",
      "path": [
        "geo",
        "bboxOfPoints"
      ],
      "description": "This function gives the smallest bounding box of the points. A box crosses the antimeridian when that makes it narrower. For an empty array, the result is `undefined`.",
      "params": [
        "points"
      ],
      "input": {
        "type": "object",
        "properties": {
          "points": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/LatLon"
            }
          }
        },
        "required": [
          "points"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/BBox"
          },
          {
            "type": "null"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bufferKm",
      "path": [
        "geo",
        "bufferKm"
      ],
      "description": "This function gives the buffer of a GeoJSON geometry: the area within a distance in kilometres of the geometry, as a polygon for a map. The module documentation gives the rules and the guarantee of the tolerance.",
      "params": [
        "geometry",
        "distance",
        "options",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "geometry": {
            "$ref": "#/$defs/Geometry"
          },
          "distance": {
            "type": "number",
            "description": "The distance in kilometres, more than 0."
          },
          "options": {
            "$ref": "#/$defs/BufferOptions",
            "description": "The tolerance in kilometres and the limit of the cells."
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "geometry",
          "distance"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/MultiPolygon"
          },
          {
            "$ref": "#/$defs/Polygon"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bufferMeters",
      "path": [
        "geo",
        "bufferMeters"
      ],
      "description": "This function gives the buffer of a GeoJSON geometry: the area within a distance in metres of the geometry, as a polygon for a map. It uses the rules of `bufferKm`.",
      "params": [
        "geometry",
        "distance",
        "options",
        "radiusMeters"
      ],
      "input": {
        "type": "object",
        "properties": {
          "geometry": {
            "$ref": "#/$defs/Geometry"
          },
          "distance": {
            "type": "number",
            "description": "The distance in metres, more than 0."
          },
          "options": {
            "$ref": "#/$defs/BufferOptions",
            "description": "The tolerance in metres and the limit of the cells."
          },
          "radiusMeters": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_METERS`."
          }
        },
        "required": [
          "geometry",
          "distance"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/MultiPolygon"
          },
          {
            "$ref": "#/$defs/Polygon"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "centralAngleRadians",
      "path": [
        "geo",
        "centralAngleRadians"
      ],
      "description": "This function gives the angle between two points at the center of the sphere, in radians from 0 to pi. It uses the haversine formula. The result is the same when the two points change places.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/LatLon"
          },
          "b": {
            "$ref": "#/$defs/LatLon"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "circleKm",
      "path": [
        "geo",
        "circleKm"
      ],
      "description": "This function gives a circle on the Earth as a polygon. The radius is a great-circle distance in kilometres. The module documentation gives the rules for the antimeridian and the poles.",
      "params": [
        "center",
        "distance",
        "options",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "center": {
            "$ref": "#/$defs/LatLon"
          },
          "distance": {
            "type": "number",
            "description": "The radius of the circle in kilometres, more than 0."
          },
          "options": {
            "$ref": "#/$defs/CircleOptions"
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "center",
          "distance"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/MultiPolygon"
          },
          {
            "$ref": "#/$defs/Polygon"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "circleMeters",
      "path": [
        "geo",
        "circleMeters"
      ],
      "description": "This function gives a circle on the Earth as a polygon. The radius is a great-circle distance in metres. The module documentation gives the rules for the antimeridian and the poles.",
      "params": [
        "center",
        "distance",
        "options",
        "radiusMeters"
      ],
      "input": {
        "type": "object",
        "properties": {
          "center": {
            "$ref": "#/$defs/LatLon"
          },
          "distance": {
            "type": "number",
            "description": "The radius of the circle in metres, more than 0."
          },
          "options": {
            "$ref": "#/$defs/CircleOptions"
          },
          "radiusMeters": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_METERS`."
          }
        },
        "required": [
          "center",
          "distance"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/MultiPolygon"
          },
          {
            "$ref": "#/$defs/Polygon"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "decodeGeohash",
      "path": [
        "geo",
        "decodeGeohash"
      ],
      "description": "This function gives the cell of a geohash: its edges and its center. Upper case letters are correct. Each character must be an ASCII digit or an ASCII letter.",
      "params": [
        "hash"
      ],
      "input": {
        "type": "object",
        "properties": {
          "hash": {
            "type": "string"
          }
        },
        "required": [
          "hash"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/GeohashCell"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "densify",
      "path": [
        "geo",
        "densify"
      ],
      "description": "This function gives a copy of a geometry with more positions on its edges. It divides each edge into equal parts, so that no part is longer than `maxStep` degrees of longitude or of latitude. Use it before a drawing on a globe.",
      "params": [
        "geometry",
        "maxStep"
      ],
      "input": {
        "type": "object",
        "properties": {
          "geometry": {
            "$ref": "#/$defs/Geometry"
          },
          "maxStep": {
            "type": "number",
            "description": "The largest step in degrees, more than 0."
          }
        },
        "required": [
          "geometry",
          "maxStep"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Geometry"
      },
      "generics": [
        "G"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "destinationKm",
      "path": [
        "geo",
        "destinationKm"
      ],
      "description": "This function gives the point at a distance from a start point, along the great circle with an initial bearing. The longitude of the result is normalized. A negative distance goes in the opposite direction.",
      "params": [
        "from",
        "bearingDegrees",
        "distance",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "$ref": "#/$defs/LatLon"
          },
          "bearingDegrees": {
            "type": "number",
            "description": "The initial bearing in degrees clockwise from north."
          },
          "distance": {
            "type": "number",
            "description": "The distance in kilometres."
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "from",
          "bearingDegrees",
          "distance"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "destinationMeters",
      "path": [
        "geo",
        "destinationMeters"
      ],
      "description": "This function gives the point at a distance in metres from a start point, along the great circle with an initial bearing. The longitude of the result is normalized.",
      "params": [
        "from",
        "bearingDegrees",
        "distance",
        "radiusMeters"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "$ref": "#/$defs/LatLon"
          },
          "bearingDegrees": {
            "type": "number",
            "description": "The initial bearing in degrees clockwise from north."
          },
          "distance": {
            "type": "number",
            "description": "The distance in metres."
          },
          "radiusMeters": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_METERS`."
          }
        },
        "required": [
          "from",
          "bearingDegrees",
          "distance"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "distanceBetweenGeometriesKm",
      "path": [
        "geo",
        "distanceBetweenGeometriesKm"
      ],
      "description": "This function gives the great-circle distance in kilometres between the nearest points of two GeoJSON geometries. The rules are in the description of this module. The model is a sphere.",
      "params": [
        "a",
        "b",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Geometry"
          },
          "b": {
            "$ref": "#/$defs/Geometry"
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "distanceBetweenGeometriesMeters",
      "path": [
        "geo",
        "distanceBetweenGeometriesMeters"
      ],
      "description": "This function gives the great-circle distance in metres between the nearest points of two GeoJSON geometries. It uses the rules of `distanceBetweenGeometriesKm`.",
      "params": [
        "a",
        "b",
        "radiusMeters"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Geometry"
          },
          "b": {
            "$ref": "#/$defs/Geometry"
          },
          "radiusMeters": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_METERS`."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "distanceKm",
      "path": [
        "geo",
        "distanceKm"
      ],
      "description": "This function gives the great-circle distance between two points in kilometres. The model is a sphere. On the ellipsoid of WGS84, the true distance can be different by up to approximately 0.6 %.",
      "params": [
        "a",
        "b",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/LatLon"
          },
          "b": {
            "$ref": "#/$defs/LatLon"
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "distanceMeters",
      "path": [
        "geo",
        "distanceMeters"
      ],
      "description": "This function gives the great-circle distance between two points in metres. The model is a sphere.",
      "params": [
        "a",
        "b",
        "radiusMeters"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/LatLon"
          },
          "b": {
            "$ref": "#/$defs/LatLon"
          },
          "radiusMeters": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_METERS`."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "distanceToGeometryKm",
      "path": [
        "geo",
        "distanceToGeometryKm"
      ],
      "description": "This function gives the great-circle distance in kilometres from a point to the nearest point of a GeoJSON geometry. The rules are in the description of this module. The model is a sphere.",
      "params": [
        "point",
        "geometry",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "point": {
            "$ref": "#/$defs/LatLon"
          },
          "geometry": {
            "$ref": "#/$defs/Geometry"
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "point",
          "geometry"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "distanceToGeometryMeters",
      "path": [
        "geo",
        "distanceToGeometryMeters"
      ],
      "description": "This function gives the great-circle distance in metres from a point to the nearest point of a GeoJSON geometry. It uses the rules of `distanceToGeometryKm`.",
      "params": [
        "point",
        "geometry",
        "radiusMeters"
      ],
      "input": {
        "type": "object",
        "properties": {
          "point": {
            "$ref": "#/$defs/LatLon"
          },
          "geometry": {
            "$ref": "#/$defs/Geometry"
          },
          "radiusMeters": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_METERS`."
          }
        },
        "required": [
          "point",
          "geometry"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "followsRightHandRule",
      "path": [
        "geo",
        "followsRightHandRule"
      ],
      "description": "This function gives `true` when the polygon follows the right-hand rule of RFC 7946 (section 3.1.6): each exterior ring is counterclockwise, and each hole is clockwise. A degenerate ring does not follow the rule.",
      "params": [
        "polygon"
      ],
      "input": {
        "type": "object",
        "properties": {
          "polygon": {
            "anyOf": [
              {
                "$ref": "#/$defs/MultiPolygon"
              },
              {
                "$ref": "#/$defs/Polygon"
              }
            ]
          }
        },
        "required": [
          "polygon"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromGeoJsonBBox",
      "path": [
        "geo",
        "fromGeoJsonBBox"
      ],
      "description": "This function reads a GeoJSON bounding box of 4 or 6 numbers, with the rules of `parseGeoJson`. It examines the altitudes, and then it ignores them. It gives a box with longitudes from -180 to 180, with no rounding:",
      "params": [
        "bbox"
      ],
      "input": {
        "type": "object",
        "properties": {
          "bbox": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "bbox"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/BBox"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromPosition",
      "path": [
        "geo",
        "fromPosition"
      ],
      "description": "This function gives the point of a GeoJSON position. It ignores the altitude. The longitude of the result is normalized.",
      "params": [
        "position"
      ],
      "input": {
        "type": "object",
        "properties": {
          "position": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "position"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromUnitVector",
      "path": [
        "geo",
        "fromUnitVector"
      ],
      "description": "This function gives the point in the direction of a vector from the center of a sphere. The vector can have each length other than 0. The longitude of the result is normalized.",
      "params": [
        "vector"
      ],
      "input": {
        "type": "object",
        "properties": {
          "vector": {
            "$ref": "#/$defs/UnitVector"
          }
        },
        "required": [
          "vector"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "geodesicDirect",
      "path": [
        "geo",
        "geodesicDirect"
      ],
      "description": "This function gives the point at a distance along the geodesic from a start point with an initial bearing. It also gives the bearing of the geodesic at that point.",
      "params": [
        "from",
        "bearingDegrees",
        "meters",
        "ellipsoid"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "$ref": "#/$defs/LatLon",
            "description": "The start point."
          },
          "bearingDegrees": {
            "type": "number",
            "description": "The initial bearing in degrees clockwise from north. Each finite value is correct."
          },
          "meters": {
            "type": "number",
            "description": "The distance along the geodesic in metres. Each finite value is correct."
          },
          "ellipsoid": {
            "$ref": "#/$defs/Ellipsoid",
            "description": "The ellipsoid. The default is `WGS84`."
          }
        },
        "required": [
          "from",
          "bearingDegrees",
          "meters"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/GeodesicDirect"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "geodesicInverse",
      "path": [
        "geo",
        "geodesicInverse"
      ],
      "description": "This function gives the geodesic between two points on an ellipsoid: its length and its bearings at the two ends. The geodesic is the shortest path between the two points on the ellipsoid.",
      "params": [
        "from",
        "to",
        "ellipsoid"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "$ref": "#/$defs/LatLon",
            "description": "The first point."
          },
          "to": {
            "$ref": "#/$defs/LatLon",
            "description": "The second point."
          },
          "ellipsoid": {
            "$ref": "#/$defs/Ellipsoid",
            "description": "The ellipsoid. The default is `WGS84`."
          }
        },
        "required": [
          "from",
          "to"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/GeodesicInverse"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "geohashNeighbor",
      "path": [
        "geo",
        "geohashNeighbor"
      ],
      "description": "This function gives the neighbor of a cell in a direction, with the same precision. The longitude wraps at the antimeridian. Past a pole, the result is `undefined`.",
      "params": [
        "hash",
        "direction"
      ],
      "input": {
        "type": "object",
        "properties": {
          "hash": {
            "type": "string"
          },
          "direction": {
            "$ref": "#/$defs/GeohashDirection"
          }
        },
        "required": [
          "hash",
          "direction"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "null"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "geohashNeighbors",
      "path": [
        "geo",
        "geohashNeighbors"
      ],
      "description": "This function gives the eight neighbors of a cell. A neighbor past a pole is `undefined`.",
      "params": [
        "hash"
      ],
      "input": {
        "type": "object",
        "properties": {
          "hash": {
            "type": "string"
          }
        },
        "required": [
          "hash"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/GeohashNeighbors"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "geohashesInBBox",
      "path": [
        "geo",
        "geohashesInBBox"
      ],
      "description": "This function gives the geohashes of the cells that cover a closed box, with one precision. The list has each cell that has a point of the box one time, with the rule of `geohash` for a point on an edge. So a cell that touches the box only on the south edge or the west edge of the box is not in the list. A cell that touches the box only on the north edge or the east edge of the box is in the list. The order is from south to north, then from west to east. A box that crosses the antimeridian is correct.",
      "params": [
        "box",
        "precision",
        "maxCells"
      ],
      "input": {
        "type": "object",
        "properties": {
          "box": {
            "$ref": "#/$defs/BBox"
          },
          "precision": {
            "type": "number",
            "description": "The number of characters, from 1 to 12."
          },
          "maxCells": {
            "type": "number",
            "description": "The limit of the number of cells. It must not be `NaN` or less than 0. The default is\n`DEFAULT_MAX_GEOHASH_CELLS`."
          }
        },
        "required": [
          "box",
          "precision"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "initialBearing",
      "path": [
        "geo",
        "initialBearing"
      ],
      "description": "This function gives the initial bearing of the great circle from `from` to `to`, in degrees clockwise from north. The result is from 0 to less than 360.",
      "params": [
        "from",
        "to"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "$ref": "#/$defs/LatLon"
          },
          "to": {
            "$ref": "#/$defs/LatLon"
          }
        },
        "required": [
          "from",
          "to"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "intermediatePoint",
      "path": [
        "geo",
        "intermediatePoint"
      ],
      "description": "This function gives the point at a part of the way along the great circle from `from` to `to`. A part of 0 gives the start, 0.5 gives the middle, and 1 gives the end. The longitude of the result is normalized.",
      "params": [
        "from",
        "to",
        "part"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "$ref": "#/$defs/LatLon"
          },
          "to": {
            "$ref": "#/$defs/LatLon"
          },
          "part": {
            "type": "number",
            "description": "The part of the way, as a number. Each finite value is correct."
          }
        },
        "required": [
          "from",
          "to",
          "part"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "latLon",
      "path": [
        "geo",
        "latLon"
      ],
      "description": "This function gives a point with a normalized longitude.",
      "params": [
        "lat",
        "lon"
      ],
      "input": {
        "type": "object",
        "properties": {
          "lat": {
            "type": "number",
            "description": "The latitude in degrees, from -90 to 90."
          },
          "lon": {
            "type": "number",
            "description": "The longitude in degrees. Each finite value is correct."
          }
        },
        "required": [
          "lat",
          "lon"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LatLon"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "locatePoint",
      "path": [
        "geo",
        "locatePoint"
      ],
      "description": "This function gives the location of a point against a Polygon or a MultiPolygon: `inside`, `boundary` or `outside`. The rules are in the description of this module. A point on the boundary of one part and inside another part is `inside`. A closed polygon contains the point when the result is not `outside`.",
      "params": [
        "point",
        "polygon"
      ],
      "input": {
        "type": "object",
        "properties": {
          "point": {
            "$ref": "#/$defs/LatLon"
          },
          "polygon": {
            "anyOf": [
              {
                "$ref": "#/$defs/MultiPolygon"
              },
              {
                "$ref": "#/$defs/Polygon"
              }
            ]
          }
        },
        "required": [
          "point",
          "polygon"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/PointLocation"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "normalizeLon",
      "path": [
        "geo",
        "normalizeLon"
      ],
      "description": "This function gives the longitude in the range from -180 to less than 180. A longitude of 180 becomes -180, and -0 becomes 0. The result has no rounding: it is the longitude plus a multiple of 360. So the function does not change a longitude that is already in the range, other than -0.",
      "params": [
        "lon"
      ],
      "input": {
        "type": "object",
        "properties": {
          "lon": {
            "type": "number"
          }
        },
        "required": [
          "lon"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "polygonIntersectsBBox",
      "path": [
        "geo",
        "polygonIntersectsBBox"
      ],
      "description": "This function gives `true` when a closed polygon and a closed box have a common point. A box that crosses the antimeridian is two rectangles, one on each side.",
      "params": [
        "polygon",
        "box"
      ],
      "input": {
        "type": "object",
        "properties": {
          "polygon": {
            "anyOf": [
              {
                "$ref": "#/$defs/MultiPolygon"
              },
              {
                "$ref": "#/$defs/Polygon"
              }
            ]
          },
          "box": {
            "$ref": "#/$defs/BBox"
          }
        },
        "required": [
          "polygon",
          "box"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "polygonsIntersect",
      "path": [
        "geo",
        "polygonsIntersect"
      ],
      "description": "This function gives `true` when two closed polygons have a common point. Polygons that touch at one point intersect. A polygon in a hole of the other polygon does not intersect it, unless they touch. The rules are in the description of this module. The result is the same when `a` and `b` change places.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "anyOf": [
              {
                "$ref": "#/$defs/MultiPolygon"
              },
              {
                "$ref": "#/$defs/Polygon"
              }
            ]
          },
          "b": {
            "anyOf": [
              {
                "$ref": "#/$defs/MultiPolygon"
              },
              {
                "$ref": "#/$defs/Polygon"
              }
            ]
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "rewind",
      "path": [
        "geo",
        "rewind"
      ],
      "description": "This function gives a copy of the polygon that follows the right-hand rule of RFC 7946. It reverses each clockwise exterior ring and each counterclockwise hole. It does not change a degenerate ring. The copy keeps the other members of the object.",
      "params": [
        "polygon"
      ],
      "input": {
        "type": "object",
        "properties": {
          "polygon": {
            "anyOf": [
              {
                "$ref": "#/$defs/MultiPolygon"
              },
              {
                "$ref": "#/$defs/Polygon"
              }
            ]
          }
        },
        "required": [
          "polygon"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/MultiPolygon"
          },
          {
            "$ref": "#/$defs/Polygon"
          }
        ]
      },
      "generics": [
        "T"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "ringWinding",
      "path": [
        "geo",
        "ringWinding"
      ],
      "description": "This function gives the winding of a ring in the plane of longitude and latitude: the sign of its exact signed area. The sum uses exact dyadic numbers, so a rounding error cannot change the result. For a ring that crosses itself, the result is the sign of the sum of the signed areas of its loops.",
      "params": [
        "ring"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ring": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "number"
                },
                {
                  "type": "number"
                },
                {
                  "type": "number"
                }
              ],
              "minItems": 2
            }
          }
        },
        "required": [
          "ring"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RingWinding"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "simplifyRegions",
      "path": [
        "geo",
        "simplifyRegions"
      ],
      "description": "This function simplifies regions that share borders, for example the counties of a state, with the method of Douglas and Peucker. It gives one region for each region of the input, with the same type.",
      "params": [
        "regions",
        "toleranceKm",
        "radiusKm"
      ],
      "input": {
        "type": "object",
        "properties": {
          "regions": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Region"
            },
            "description": "The Polygons and MultiPolygons. Regions that share a border must have equal positions on it."
          },
          "toleranceKm": {
            "type": "number",
            "description": "The largest distance in kilometres from a removed position to the result, 0 or more."
          },
          "radiusKm": {
            "type": "number",
            "description": "The radius of the sphere, more than 0. The default is `EARTH_MEAN_RADIUS_KM`."
          }
        },
        "required": [
          "regions",
          "toleranceKm"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/Region"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "toGeoJsonBBox",
      "path": [
        "geo",
        "toGeoJsonBBox"
      ],
      "description": "This function gives the GeoJSON form `[west, south, east, north]` of a box.",
      "params": [
        "box"
      ],
      "input": {
        "type": "object",
        "properties": {
          "box": {
            "$ref": "#/$defs/BBox"
          }
        },
        "required": [
          "box"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/GeoJsonBBox"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "toPosition",
      "path": [
        "geo",
        "toPosition"
      ],
      "description": "This function gives the GeoJSON position `[lon, lat]` of a point.",
      "params": [
        "point"
      ],
      "input": {
        "type": "object",
        "properties": {
          "point": {
            "$ref": "#/$defs/LatLon"
          }
        },
        "required": [
          "point"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "prefixItems": [
          {
            "type": "number"
          },
          {
            "type": "number"
          },
          {
            "type": "number"
          }
        ],
        "minItems": 2
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "toUnitVector",
      "path": [
        "geo",
        "toUnitVector"
      ],
      "description": "This function gives the unit vector of a point, from the center of a sphere to the point. A drawing in 3D multiplies the vector by its radius.",
      "params": [
        "point"
      ],
      "input": {
        "type": "object",
        "properties": {
          "point": {
            "$ref": "#/$defs/LatLon"
          }
        },
        "required": [
          "point"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/UnitVector"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    }
  ],
  "exempt": [
    {
      "name": "geohash",
      "reason": "overlay",
      "detail": "The hand-written procedure geo.geohash of this package has this name. It also gives the cell of the hash and checks the longitude."
    },
    {
      "name": "parseGeoJson",
      "reason": "output-not-json",
      "detail": "error: an instance of the class GeoError"
    },
    {
      "name": "parseGeometry",
      "reason": "output-not-json",
      "detail": "error: an instance of the class GeoError"
    },
    {
      "name": "parseLatLon",
      "reason": "output-not-json",
      "detail": "error: an instance of the class GeoError"
    },
    {
      "name": "pointLocator",
      "reason": "output-not-json",
      "detail": "PointLocator"
    },
    {
      "name": "regionSimplifier",
      "reason": "output-not-json",
      "detail": "(toleranceKm: number) => Region[]"
    }
  ],
  "others": {
    "classes": [
      "GeoError"
    ],
    "values": 13,
    "types": 31
  }
};
