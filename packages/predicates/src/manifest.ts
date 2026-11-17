// The manifest of @mark1russell7/predicates 0.1.5, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/predicates",
  "version": "0.1.5",
  "entry": ".",
  "namespace": [
    "predicates"
  ],
  "$defs": {
    "PointLocation": {
      "enum": [
        "inside",
        "boundary",
        "outside"
      ]
    },
    "RayEdge": {
      "enum": [
        "boundary",
        "crosses",
        "misses"
      ]
    },
    "SegmentIntersection": {
      "type": "object",
      "properties": {
        "relation": {
          "$ref": "#/$defs/SegmentRelation"
        },
        "collinear": {
          "type": "boolean",
          "description": "The value is `true` when the four points are on one line. Then the comparisons of the floats give the relation. A segment of length 0 is on each line through its point."
        },
        "stage": {
          "$ref": "#/$defs/Stage",
          "description": "The value is `exact` when the exact stage decided one of the orientation signs that the answer used."
        }
      },
      "required": [
        "relation",
        "collinear",
        "stage"
      ]
    },
    "SegmentRelation": {
      "enum": [
        "disjoint",
        "cross",
        "touch",
        "overlap"
      ]
    },
    "Sign": {
      "enum": [
        0,
        1,
        -1
      ]
    },
    "SignResult": {
      "type": "object",
      "properties": {
        "sign": {
          "$ref": "#/$defs/Sign"
        },
        "stage": {
          "$ref": "#/$defs/Stage"
        }
      },
      "required": [
        "sign",
        "stage"
      ]
    },
    "Stage": {
      "enum": [
        "filter",
        "exact"
      ]
    }
  },
  "procedures": [
    {
      "name": "classifySegments",
      "path": [
        "predicates",
        "classifySegments"
      ],
      "description": "This function gives the exact relation of the closed segments `ab` and `cd`. The inputs must be finite.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "dx",
        "dy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "dx": {
            "type": "number"
          },
          "dy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "dx",
          "dy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SegmentIntersection"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "classifySegmentsShifted",
      "path": [
        "predicates",
        "classifySegmentsShifted"
      ],
      "description": "This function gives the exact relation of the closed segment `ab` and the closed segment `cd` after its move by `t`. The rule is the rule of `classifySegments` on the exact moved points. The inputs must be finite.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "dx",
        "dy",
        "tx",
        "ty"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "dx": {
            "type": "number"
          },
          "dy": {
            "type": "number"
          },
          "tx": {
            "type": "number"
          },
          "ty": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "dx",
          "dy",
          "tx",
          "ty"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SegmentIntersection"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "compareShifted",
      "path": [
        "predicates",
        "compareShifted"
      ],
      "description": "This function gives the exact sign of `x + t - y`. The inputs must be finite.",
      "params": [
        "x",
        "t",
        "y"
      ],
      "input": {
        "type": "object",
        "properties": {
          "x": {
            "type": "number"
          },
          "t": {
            "type": "number"
          },
          "y": {
            "type": "number"
          }
        },
        "required": [
          "x",
          "t",
          "y"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Sign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "incircle",
      "path": [
        "predicates",
        "incircle"
      ],
      "description": "This function gives the exact in-circle sign of the point `d` against the circle through `a`, `b` and `c`, and the stage that decided it. The inputs must be finite.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "dx",
        "dy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "dx": {
            "type": "number"
          },
          "dy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "dx",
          "dy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SignResult"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "incircleExact",
      "path": [
        "predicates",
        "incircleExact"
      ],
      "description": "This function gives the exact in-circle sign over dyadic numbers, with no filter.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "dx",
        "dy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "dx": {
            "type": "number"
          },
          "dy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "dx",
          "dy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Sign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "incircleSign",
      "path": [
        "predicates",
        "incircleSign"
      ],
      "description": "This function gives the exact in-circle sign of `incircle` without the stage. It is the form for a hot loop.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "dx",
        "dy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "dx": {
            "type": "number"
          },
          "dy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "dx",
          "dy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Sign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "locateInRings",
      "path": [
        "predicates",
        "locateInRings"
      ],
      "description": "This function gives the exact location of the point `(x, y)` against the rings moved by `t = (tx, ty)`. The result has no error: it is the location against the exact moved rings, also when a float sum of a position and `t` rounds.",
      "params": [
        "rings",
        "x",
        "y",
        "tx",
        "ty"
      ],
      "input": {
        "type": "object",
        "properties": {
          "rings": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "array",
                "items": {
                  "type": "number"
                }
              }
            },
            "description": "The rings. Each position has `x` and `y` first."
          },
          "x": {
            "type": "number",
            "description": "The x of the point."
          },
          "y": {
            "type": "number",
            "description": "The y of the point."
          },
          "tx": {
            "type": "number",
            "description": "The move of the rings on the x axis. The default is 0."
          },
          "ty": {
            "type": "number",
            "description": "The move of the rings on the y axis. The default is 0."
          }
        },
        "required": [
          "rings",
          "x",
          "y"
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
      "name": "orient2d",
      "path": [
        "predicates",
        "orient2d"
      ],
      "description": "This function gives the exact orientation sign of the points `a`, `b` and `c`, and the stage that decided it. The inputs must be finite.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SignResult"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "orient2dExact",
      "path": [
        "predicates",
        "orient2dExact"
      ],
      "description": "This function gives the exact orientation sign over dyadic numbers, with no filter. Each finite float is a dyadic number, so the differences and the products are exact.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Sign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "orient2dShifted",
      "path": [
        "predicates",
        "orient2dShifted"
      ],
      "description": "This function gives the exact orientation sign of the points `a`, `b` and `c + t`, and the stage that decided it. The inputs must be finite. The sign does not change when `a` and `b` move by `-t` in place of `c` by `t`.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "tx",
        "ty"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "tx": {
            "type": "number"
          },
          "ty": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "tx",
          "ty"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SignResult"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "orient2dShiftedSign",
      "path": [
        "predicates",
        "orient2dShiftedSign"
      ],
      "description": "This function gives the exact sign of `orient2dShifted` without the stage. It is the form for a hot loop.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy",
        "tx",
        "ty"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          },
          "tx": {
            "type": "number"
          },
          "ty": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy",
          "tx",
          "ty"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Sign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "orient2dSign",
      "path": [
        "predicates",
        "orient2dSign"
      ],
      "description": "This function gives the exact orientation sign of `orient2d` without the stage. It is the form for a hot loop.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "cx",
        "cy"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number"
          },
          "ay": {
            "type": "number"
          },
          "bx": {
            "type": "number"
          },
          "by": {
            "type": "number"
          },
          "cx": {
            "type": "number"
          },
          "cy": {
            "type": "number"
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "cx",
          "cy"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Sign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "rayEdge",
      "path": [
        "predicates",
        "rayEdge"
      ],
      "description": "This function gives the exact test of the edge from `a` to `b`, moved by `t = (tx, ty)`, and the ray from `(x, y)` to the east. The result has no error, also when a float sum of a position and `t` rounds.",
      "params": [
        "ax",
        "ay",
        "bx",
        "by",
        "x",
        "y",
        "tx",
        "ty"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ax": {
            "type": "number",
            "description": "The x of the end `a`."
          },
          "ay": {
            "type": "number",
            "description": "The y of the end `a`."
          },
          "bx": {
            "type": "number",
            "description": "The x of the end `b`."
          },
          "by": {
            "type": "number",
            "description": "The y of the end `b`."
          },
          "x": {
            "type": "number",
            "description": "The x of the point."
          },
          "y": {
            "type": "number",
            "description": "The y of the point."
          },
          "tx": {
            "type": "number",
            "description": "The move of the edge on the x axis. The default is 0."
          },
          "ty": {
            "type": "number",
            "description": "The move of the edge on the y axis. The default is 0."
          }
        },
        "required": [
          "ax",
          "ay",
          "bx",
          "by",
          "x",
          "y"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RayEdge"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    }
  ],
  "exempt": [],
  "others": {
    "classes": [],
    "values": 6,
    "types": 9
  }
};
