// The manifest of @mark1russell7/collections 0.11.3, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/collections",
  "version": "0.11.3",
  "entry": "./dag",
  "namespace": [
    "dag"
  ],
  "$defs": {
    "DAGNode_TData": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for this node"
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Names/IDs of nodes this node depends on"
        },
        "level": {
          "type": "number",
          "description": "Topological level (0 = leaves, computed by Kahn's algorithm)"
        },
        "data": {
          "description": "Optional user data associated with this node"
        }
      },
      "required": [
        "id",
        "dependencies"
      ]
    },
    "DAGNode_unknown": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for this node"
        },
        "dependencies": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Names/IDs of nodes this node depends on"
        },
        "level": {
          "type": "number",
          "description": "Topological level (0 = leaves, computed by Kahn's algorithm)"
        },
        "data": {
          "description": "Optional user data associated with this node"
        }
      },
      "required": [
        "id",
        "dependencies"
      ]
    },
    "DependencyDAG_TNode": {
      "type": "object",
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "array",
            "prefixItems": [
              {
                "type": "string"
              },
              {
                "$ref": "#/$defs/DAGNode_unknown"
              }
            ],
            "minItems": 2,
            "maxItems": 2
          },
          "x-procedures-codec": "map",
          "description": "All nodes in the DAG"
        },
        "levels": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/DAGNode_unknown"
            }
          },
          "description": "Nodes grouped by level for parallel execution"
        },
        "roots": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Root nodes (no dependents in the DAG)"
        },
        "leaves": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Leaf nodes (no dependencies in the DAG)"
        }
      },
      "required": [
        "nodes",
        "levels",
        "roots",
        "leaves"
      ]
    },
    "DependencyDAG_TNode_4": {
      "type": "object",
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "array",
            "prefixItems": [
              {
                "type": "string"
              },
              {
                "$ref": "#/$defs/DAGNode_unknown"
              }
            ],
            "minItems": 2,
            "maxItems": 2
          },
          "x-procedures-codec": "map",
          "description": "All nodes in the DAG"
        },
        "levels": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/DAGNode_unknown"
            }
          },
          "description": "Nodes grouped by level for parallel execution"
        },
        "roots": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Root nodes (no dependents in the DAG)"
        },
        "leaves": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Leaf nodes (no dependencies in the DAG)"
        }
      },
      "required": [
        "nodes",
        "levels",
        "roots",
        "leaves"
      ]
    },
    "DependencyDAG_TNode_5": {
      "type": "object",
      "properties": {
        "nodes": {
          "type": "array",
          "items": {
            "type": "array",
            "prefixItems": [
              {
                "type": "string"
              },
              {
                "$ref": "#/$defs/DAGNode_unknown"
              }
            ],
            "minItems": 2,
            "maxItems": 2
          },
          "x-procedures-codec": "map",
          "description": "All nodes in the DAG"
        },
        "levels": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/DAGNode_unknown"
            }
          },
          "description": "Nodes grouped by level for parallel execution"
        },
        "roots": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Root nodes (no dependents in the DAG)"
        },
        "leaves": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Leaf nodes (no dependencies in the DAG)"
        }
      },
      "required": [
        "nodes",
        "levels",
        "roots",
        "leaves"
      ]
    }
  },
  "procedures": [
    {
      "name": "buildLeveledDAG",
      "path": [
        "dag",
        "buildLeveledDAG"
      ],
      "description": "This function builds a leveled DAG from nodes, with Kahn's algorithm.",
      "params": [
        "nodes"
      ],
      "input": {
        "type": "object",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "string"
                },
                {
                  "$ref": "#/$defs/DAGNode_unknown"
                }
              ],
              "minItems": 2,
              "maxItems": 2
            },
            "x-procedures-codec": "map"
          }
        },
        "required": [
          "nodes"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/DependencyDAG_TNode"
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "buildNodeMap",
      "path": [
        "dag",
        "buildNodeMap"
      ],
      "description": "This function builds a Map of nodes from an array.",
      "params": [
        "nodes"
      ],
      "input": {
        "type": "object",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/DAGNode_unknown"
            }
          }
        },
        "required": [
          "nodes"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "array",
          "prefixItems": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/DAGNode_unknown"
            }
          ],
          "minItems": 2,
          "maxItems": 2
        },
        "x-procedures-codec": "map"
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "createNode",
      "path": [
        "dag",
        "createNode"
      ],
      "description": "This function makes a DAG node from a minimal input.",
      "params": [
        "id",
        "dependencies",
        "data"
      ],
      "input": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "dependencies": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "data": {}
        },
        "required": [
          "id"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/DAGNode_TData"
      },
      "generics": [
        "TData"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "filterDAGFromRoot",
      "path": [
        "dag",
        "filterDAGFromRoot"
      ],
      "description": "This function filters a DAG to the nodes that a root can reach.",
      "params": [
        "nodes",
        "rootId"
      ],
      "input": {
        "type": "object",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "string"
                },
                {
                  "$ref": "#/$defs/DAGNode_unknown"
                }
              ],
              "minItems": 2,
              "maxItems": 2
            },
            "x-procedures-codec": "map"
          },
          "rootId": {
            "type": "string"
          }
        },
        "required": [
          "nodes",
          "rootId"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "array",
          "prefixItems": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/DAGNode_unknown"
            }
          ],
          "minItems": 2,
          "maxItems": 2
        },
        "x-procedures-codec": "map"
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "getAncestors",
      "path": [
        "dag",
        "getAncestors"
      ],
      "description": "This function gives all ancestors of a node: the nodes that this node depends on, transitively.",
      "params": [
        "nodes",
        "id"
      ],
      "input": {
        "type": "object",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "string"
                },
                {
                  "$ref": "#/$defs/DAGNode_unknown"
                }
              ],
              "minItems": 2,
              "maxItems": 2
            },
            "x-procedures-codec": "map"
          },
          "id": {
            "type": "string"
          }
        },
        "required": [
          "nodes",
          "id"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "x-procedures-codec": "set"
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "getDescendants",
      "path": [
        "dag",
        "getDescendants"
      ],
      "description": "This function gives all descendants of a node: the nodes that depend on this node, transitively.",
      "params": [
        "nodes",
        "id"
      ],
      "input": {
        "type": "object",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "type": "array",
              "prefixItems": [
                {
                  "type": "string"
                },
                {
                  "$ref": "#/$defs/DAGNode_unknown"
                }
              ],
              "minItems": 2,
              "maxItems": 2
            },
            "x-procedures-codec": "map"
          },
          "id": {
            "type": "string"
          }
        },
        "required": [
          "nodes",
          "id"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "x-procedures-codec": "set"
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "getTopologicalOrder",
      "path": [
        "dag",
        "getTopologicalOrder"
      ],
      "description": "This function gives the topological order: a flat list, leaves first.",
      "params": [
        "dag"
      ],
      "input": {
        "type": "object",
        "properties": {
          "dag": {
            "$ref": "#/$defs/DependencyDAG_TNode_4"
          }
        },
        "required": [
          "dag"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/DAGNode_unknown"
        }
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "visualizeDAG",
      "path": [
        "dag",
        "visualizeDAG"
      ],
      "description": "Visualize the DAG structure (for debugging)",
      "params": [
        "dag"
      ],
      "input": {
        "type": "object",
        "properties": {
          "dag": {
            "$ref": "#/$defs/DependencyDAG_TNode_5"
          }
        },
        "required": [
          "dag"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "string"
      },
      "generics": [
        "TNode"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    }
  ],
  "exempt": [
    {
      "name": "createProcessor",
      "reason": "function-parameter",
      "detail": "fn: (node: TNode) => Promise<void>"
    },
    {
      "name": "executeDAG",
      "reason": "function-parameter",
      "detail": "processor: (node: TNode) => Promise<NodeResult<TNode>>"
    },
    {
      "name": "executeDAGSequential",
      "reason": "function-parameter",
      "detail": "processor: (node: TNode) => Promise<NodeResult<TNode>>"
    }
  ],
  "others": {
    "classes": [],
    "values": 0,
    "types": 6
  }
};
