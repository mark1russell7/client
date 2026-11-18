// The manifest of @mark1russell7/rigor-generators 0.2.0, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/rigor-generators",
  "version": "0.2.0",
  "entry": ".",
  "namespace": [
    "generators"
  ],
  "$defs": {
    "CanonicalOptions": {
      "type": "object",
      "properties": {
        "form": {
          "enum": [
            "jcs",
            "json"
          ],
          "description": "The form of the values that JSON does not have:"
        },
        "bigint": {
          "enum": [
            "error",
            "suffix"
          ],
          "description": "The form of a `bigint`. `\"error\"` (the default) causes a `TypeError`, as `JSON.stringify` does. `\"suffix\"` writes the digits and the letter `n`, for example `12n`. This text is not JSON, so use it only for a key."
        },
        "tags": {
          "enum": [
            "none",
            "typed"
          ],
          "description": "The form of a `Date`, a `RegExp`, a `Map`, a `Set` and a `bigint`:"
        }
      }
    },
    "Coverage": {
      "type": "object",
      "properties": {
        "tuples": {
          "type": "number",
          "description": "The count of the combinations of `t` values of `t` different dimensions."
        },
        "covered": {
          "type": "number",
          "description": "The count of the combinations that one row or more holds."
        },
        "share": {
          "type": "number",
          "description": "`covered` divided by `tuples`. Dimensions with no combination give 1."
        },
        "missing": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The combinations that no row holds, as `<dimension>=<value>&<dimension>=<value>`, in the order of the dimensions."
        }
      },
      "required": [
        "tuples",
        "covered",
        "share",
        "missing"
      ]
    },
    "CoveringOptions": {
      "type": "object",
      "properties": {
        "strength": {
          "type": "number",
          "description": "The strength `t`: each `t` values of `t` different dimensions are in one row or more. The default is 2."
        },
        "candidates": {
          "type": "number",
          "description": "The count of candidate rows for each row that the array keeps. The default is `COVERING_CANDIDATES`."
        }
      }
    },
    "Dimension": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the dimension. It is a key of each point."
        },
        "min": {
          "type": "number",
          "description": "The smallest value."
        },
        "max": {
          "type": "number",
          "description": "The largest value. A uniform or log dimension that is not `integer` gets values below `max`."
        },
        "distribution": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "family": {
                  "const": "lognormal"
                },
                "mu": {
                  "$ref": "#/$defs/Param"
                },
                "sigma": {
                  "$ref": "#/$defs/Param"
                }
              },
              "required": [
                "family",
                "mu",
                "sigma"
              ]
            },
            {
              "type": "object",
              "properties": {
                "family": {
                  "const": "pareto"
                },
                "scale": {
                  "$ref": "#/$defs/Param"
                },
                "shape": {
                  "$ref": "#/$defs/Param"
                }
              },
              "required": [
                "family",
                "scale",
                "shape"
              ]
            },
            {
              "type": "object",
              "properties": {
                "family": {
                  "const": "zipf"
                },
                "n": {
                  "type": "number"
                },
                "exponent": {
                  "$ref": "#/$defs/Param"
                }
              },
              "required": [
                "family",
                "n",
                "exponent"
              ]
            },
            {
              "type": "object",
              "properties": {
                "family": {
                  "const": "beta"
                },
                "a": {
                  "$ref": "#/$defs/Param"
                },
                "b": {
                  "$ref": "#/$defs/Param"
                }
              },
              "required": [
                "family",
                "a",
                "b"
              ]
            },
            {
              "type": "object",
              "properties": {
                "family": {
                  "const": "mixture"
                },
                "parts": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "weight": {
                        "type": "number"
                      },
                      "part": {
                        "$ref": "#/$defs/DistributionSpec"
                      }
                    },
                    "required": [
                      "weight",
                      "part"
                    ]
                  }
                }
              },
              "required": [
                "family",
                "parts"
              ]
            },
            {
              "type": "object",
              "properties": {
                "family": {
                  "const": "recorded"
                },
                "values": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              },
              "required": [
                "family",
                "values"
              ]
            }
          ],
          "description": "The distribution of the values, cut to the range. Without it, the values are uniform in the range."
        },
        "scale": {
          "enum": [
            "linear",
            "log"
          ],
          "description": "With `log`, the logarithm of the value is uniform. `min` must be above 0. A dimension with a distribution has no scale."
        },
        "integer": {
          "type": "boolean",
          "description": "With `true`, each value is an integer. `min` and `max` must be integers."
        }
      },
      "required": [
        "name",
        "min",
        "max"
      ]
    },
    "DistributionSpec": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "family": {
              "const": "lognormal"
            },
            "mu": {
              "$ref": "#/$defs/Param"
            },
            "sigma": {
              "$ref": "#/$defs/Param"
            }
          },
          "required": [
            "family",
            "mu",
            "sigma"
          ]
        },
        {
          "type": "object",
          "properties": {
            "family": {
              "const": "pareto"
            },
            "scale": {
              "$ref": "#/$defs/Param"
            },
            "shape": {
              "$ref": "#/$defs/Param"
            }
          },
          "required": [
            "family",
            "scale",
            "shape"
          ]
        },
        {
          "type": "object",
          "properties": {
            "family": {
              "const": "zipf"
            },
            "n": {
              "type": "number"
            },
            "exponent": {
              "$ref": "#/$defs/Param"
            }
          },
          "required": [
            "family",
            "n",
            "exponent"
          ]
        },
        {
          "type": "object",
          "properties": {
            "family": {
              "const": "beta"
            },
            "a": {
              "$ref": "#/$defs/Param"
            },
            "b": {
              "$ref": "#/$defs/Param"
            }
          },
          "required": [
            "family",
            "a",
            "b"
          ]
        },
        {
          "type": "object",
          "properties": {
            "family": {
              "const": "mixture"
            },
            "parts": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "weight": {
                    "type": "number"
                  },
                  "part": {
                    "$ref": "#/$defs/DistributionSpec"
                  }
                },
                "required": [
                  "weight",
                  "part"
                ]
              }
            }
          },
          "required": [
            "family",
            "parts"
          ]
        },
        {
          "type": "object",
          "properties": {
            "family": {
              "const": "recorded"
            },
            "values": {
              "type": "array",
              "items": {
                "type": "number"
              }
            }
          },
          "required": [
            "family",
            "values"
          ]
        }
      ]
    },
    "InputFamily": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "dimensions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Dimension"
          }
        }
      },
      "required": [
        "name",
        "dimensions"
      ]
    },
    "Param": {
      "anyOf": [
        {
          "type": "number"
        },
        {
          "type": "array",
          "prefixItems": [
            {
              "type": "number"
            },
            {
              "type": "number"
            }
          ],
          "minItems": 2,
          "maxItems": 2
        }
      ]
    },
    "RecordedTable": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the table."
        },
        "measure": {
          "type": "string",
          "description": "What one value measures."
        },
        "source": {
          "type": "string",
          "description": "The link to the source, with the commit of the read."
        },
        "license": {
          "type": "string",
          "description": "The license of the source."
        },
        "notice": {
          "type": "string",
          "description": "The notice of the license of the source, or an empty string when it has no notice."
        },
        "date": {
          "type": "string",
          "description": "The date of the read."
        },
        "count": {
          "type": "number",
          "description": "The count of the recorded values."
        },
        "median": {
          "type": "number",
          "description": "The median of the recorded values."
        },
        "quantiles": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The 100 midpoint quantiles, from the lowest to the highest. The value at index `i` has the rank `floor(count * (i + 0.5) / 100)` of the sorted values. Each value thus stands for 1 percent of the recorded values."
        }
      },
      "required": [
        "name",
        "measure",
        "source",
        "license",
        "notice",
        "date",
        "count",
        "median",
        "quantiles"
      ]
    },
    "SaltelliDesign": {
      "type": "object",
      "properties": {
        "a": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "b": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "ab": {
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
          "description": "`ab[i]` is `a` with the column `i` of `b`."
        }
      },
      "required": [
        "a",
        "b",
        "ab"
      ]
    },
    "Sha256Options": {
      "type": "object",
      "properties": {
        "input": {
          "enum": [
            "utf8",
            "wtf8"
          ],
          "description": "The bytes that the hash reads, as in `fnv1a32`:"
        }
      }
    },
    "ShrinkOptions": {
      "type": "object",
      "properties": {
        "maxChecks": {
          "type": "number",
          "description": "The most checks of points, with the check of the first point. The default is `SHRINK_CHECKS`."
        },
        "tolerance": {
          "type": "number",
          "description": "The width of the last interval of a bisection on a dimension that is not an integer, as a share of its range. A log dimension uses the range of the logarithm. The default is `SHRINK_TOLERANCE`."
        }
      }
    },
    "ShrinkStep": {
      "type": "object",
      "properties": {
        "dimension": {
          "type": "string"
        },
        "from": {
          "type": "number"
        },
        "to": {
          "type": "number"
        }
      },
      "required": [
        "dimension",
        "from",
        "to"
      ]
    },
    "Shrunk": {
      "type": "object",
      "properties": {
        "point": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "number"
          },
          "description": "The last point that failed. Each key of the first point stays."
        },
        "steps": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ShrinkStep"
          },
          "description": "The moves, in their order."
        },
        "checks": {
          "type": "number",
          "description": "The count of checks, with the check of the first point."
        },
        "exhausted": {
          "type": "boolean",
          "description": "The value `true` tells that the budget of checks ended before a round with no move."
        }
      },
      "required": [
        "point",
        "steps",
        "checks",
        "exhausted"
      ]
    }
  },
  "procedures": [
    {
      "name": "betaCdf",
      "path": [
        "generators",
        "betaCdf"
      ],
      "description": "This function gives the regularized incomplete beta function: the beta cumulative distribution at `x`.",
      "params": [
        "x",
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "x": {
            "type": "number"
          },
          "a": {
            "type": "number"
          },
          "b": {
            "type": "number"
          }
        },
        "required": [
          "x",
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
      "name": "canonicalHash",
      "path": [
        "generators",
        "canonicalHash"
      ],
      "description": "This function gives the content hash of a value: `sha256Hex(canonicalJson(value, options))`.",
      "params": [
        "value",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {},
          "options": {
            "$ref": "#/$defs/CanonicalOptions"
          }
        },
        "required": [
          "value"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "string"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "canonicalJson",
      "path": [
        "generators",
        "canonicalJson"
      ],
      "description": "This function gives the canonical form of a value. The default form is RFC 8785 (JCS):",
      "params": [
        "value",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {},
          "options": {
            "$ref": "#/$defs/CanonicalOptions"
          }
        },
        "required": [
          "value"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "string"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "coveringArray",
      "path": [
        "generators",
        "coveringArray"
      ],
      "description": "This function gives a covering array of strength `t` over dimensions with `levels[i]` levels each. Each row has the index of one level of each dimension. With fewer dimensions than `t`, the array covers each combination of all the dimensions. Thus no dimensions give one empty row, as the product of no sets has one item.",
      "params": [
        "levels",
        "r",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "levels": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "r": {
            "type": "object",
            "properties": {
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "seed"
            ],
            "additionalProperties": false,
            "description": "The input of random: the procedure makes the Random with random(seed) before the call.",
            "x-procedures-construct": {
              "function": "random",
              "params": [
                "seed"
              ]
            }
          },
          "options": {
            "$ref": "#/$defs/CoveringOptions"
          }
        },
        "required": [
          "levels",
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          }
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "dependsOnLibm",
      "path": [
        "generators",
        "dependsOnLibm"
      ],
      "description": "This function tells if the numbers of a family use `Math.exp`, `Math.log` or `Math.pow`. The result of those functions can change between JavaScript engines. Thus such a family has the same numbers only on one platform.",
      "params": [
        "spec"
      ],
      "input": {
        "type": "object",
        "properties": {
          "spec": {
            "$ref": "#/$defs/DistributionSpec"
          }
        },
        "required": [
          "spec"
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
      "name": "deriveSeed",
      "path": [
        "generators",
        "deriveSeed"
      ],
      "description": "The seed of the stream with the name `label` under `seed`: the hash of `\"<seed>:<label>\"`.",
      "params": [
        "seed",
        "label"
      ],
      "input": {
        "type": "object",
        "properties": {
          "seed": {
            "type": "number"
          },
          "label": {
            "type": "string"
          }
        },
        "required": [
          "seed",
          "label"
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
      "name": "familyPoints",
      "path": [
        "generators",
        "familyPoints"
      ],
      "description": "This function gives the points of the family at the points of a unit design.",
      "params": [
        "family",
        "unit",
        "r"
      ],
      "input": {
        "type": "object",
        "properties": {
          "family": {
            "$ref": "#/$defs/InputFamily"
          },
          "unit": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "number"
              }
            }
          },
          "r": {
            "type": "object",
            "properties": {
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "seed"
            ],
            "additionalProperties": false,
            "description": "The input of random: the procedure makes the Random with random(seed) before the call.",
            "x-procedures-construct": {
              "function": "random",
              "params": [
                "seed"
              ]
            }
          }
        },
        "required": [
          "family",
          "unit",
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "number"
          }
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fnv1a32",
      "path": [
        "generators",
        "fnv1a32"
      ],
      "description": "The FNV-1a hash of 32 bits of a string. The option `input` selects the units that the hash reads:",
      "params": [
        "text",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string"
          },
          "options": {
            "type": "object",
            "properties": {
              "input": {
                "enum": [
                  "utf8",
                  "utf16",
                  "wtf8"
                ]
              }
            }
          }
        },
        "required": [
          "text"
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
      "name": "latinHypercube",
      "path": [
        "generators",
        "latinHypercube"
      ],
      "description": "This function gives a Latin hypercube of `n` points in `d` dimensions. Each column has exactly one point in each of the `n` strata `[k/n, (k+1)/n)`. For each column, the draws are one shuffle of the strata, then one draw in each point.",
      "params": [
        "n",
        "d",
        "r"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "number"
          },
          "d": {
            "type": "number"
          },
          "r": {
            "type": "object",
            "properties": {
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "seed"
            ],
            "additionalProperties": false,
            "description": "The input of random: the procedure makes the Random with random(seed) before the call.",
            "x-procedures-construct": {
              "function": "random",
              "params": [
                "seed"
              ]
            }
          }
        },
        "required": [
          "n",
          "d",
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          }
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "normalCdf",
      "path": [
        "generators",
        "normalCdf"
      ],
      "description": "This function gives the standard normal cumulative distribution, `P(Z <= x)`. Below 0.75 in size, `x` uses the series of `0.5 + phi(x) * (x + x^3/3 + x^5/15 + ...)`. The tails use the continued fraction of the Mills ratio, so a lower tail has no cancellation. On 2026-11-09 the error was at most 4.4 ulps from -38 to 9, against `mpmath`. `normalCdf(-37)` is approximately 5.7e-300, not 0.",
      "params": [
        "x"
      ],
      "input": {
        "type": "object",
        "properties": {
          "x": {
            "type": "number",
            "description": "A number. `-Infinity` gives 0 and `Infinity` gives 1. `NaN` throws a `RangeError`."
          }
        },
        "required": [
          "x"
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
      "name": "normalQuantile",
      "path": [
        "generators",
        "normalQuantile"
      ],
      "description": "This function gives the quantile of the standard normal law: the `x` with `normalCdf(x) = p`. It uses PPND16 of Wichura (algorithm AS 241). Below 0.075, one step of Halley with `normalCdf` follows. Above 0.5, `p` uses the lower tail at `1 - p`. This subtraction is exact. On 2026-11-09 the error was at most 1.2 ulps in the tails and 5.5 ulps from 0.075 to 0.925, against `mpmath`.",
      "params": [
        "p"
      ],
      "input": {
        "type": "object",
        "properties": {
          "p": {
            "type": "number",
            "description": "The share of the law below the result, from 0 to 1. A `p` of 0 gives `-Infinity` and 1 gives `Infinity`."
          }
        },
        "required": [
          "p"
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
      "name": "plackettLuceOrder",
      "path": [
        "generators",
        "plackettLuceOrder"
      ],
      "description": "A random order of a list with the Plackett-Luce law of the weights (the Gumbel-max method). Each item gets the sum of its log-weight and a Gumbel draw. The order goes from the largest sum to the smallest.",
      "params": [
        "seed",
        "items",
        "logWeightOf",
        "keyOf"
      ],
      "input": {
        "type": "object",
        "properties": {
          "seed": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "number"
              }
            ]
          },
          "items": {
            "type": "array",
            "items": {}
          },
          "logWeightOf": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (item: T) => number. It reads each parameter as {\"$ref\": \"<name>\"}: item.",
            "required": [
              "$proc"
            ],
            "properties": {
              "$proc": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 1
              },
              "input": {},
              "$when": {
                "const": "$never"
              }
            },
            "x-procedures-program": {
              "params": [
                "item"
              ],
              "inputs": [
                {}
              ],
              "output": {
                "type": "number"
              }
            }
          },
          "keyOf": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (item: T) => string. It reads each parameter as {\"$ref\": \"<name>\"}: item.",
            "required": [
              "$proc"
            ],
            "properties": {
              "$proc": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 1
              },
              "input": {},
              "$when": {
                "const": "$never"
              }
            },
            "x-procedures-program": {
              "params": [
                "item"
              ],
              "inputs": [
                {}
              ],
              "output": {
                "type": "string"
              }
            }
          }
        },
        "required": [
          "seed",
          "items",
          "logWeightOf"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {}
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
      "name": "randomDesign",
      "path": [
        "generators",
        "randomDesign"
      ],
      "description": "This function gives `n` independent uniform points of the unit cube in `d` dimensions. The draws go row by row.",
      "params": [
        "n",
        "d",
        "r"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "number"
          },
          "d": {
            "type": "number"
          },
          "r": {
            "type": "object",
            "properties": {
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "seed"
            ],
            "additionalProperties": false,
            "description": "The input of random: the procedure makes the Random with random(seed) before the call.",
            "x-procedures-construct": {
              "function": "random",
              "params": [
                "seed"
              ]
            }
          }
        },
        "required": [
          "n",
          "d",
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          }
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "recordedSpec",
      "path": [
        "generators",
        "recordedSpec"
      ],
      "description": "This function gives the spec of the family `recorded` that draws from a table.",
      "params": [
        "table"
      ],
      "input": {
        "type": "object",
        "properties": {
          "table": {
            "$ref": "#/$defs/RecordedTable"
          }
        },
        "required": [
          "table"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/DistributionSpec"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "saltelliDesign",
      "path": [
        "generators",
        "saltelliDesign"
      ],
      "description": "This function gives the Saltelli design for the Sobol indices of a model with `d` inputs: `a`, `b` and the `d` matrices `ab`. The design has `n * (d + 2)` points for the model. `a` comes from `r.fork(\"A\")`, and `b` comes from `r.fork(\"B\")`. With `base` `\"latin\"`, each is a Latin hypercube.",
      "params": [
        "n",
        "d",
        "r",
        "base"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "number"
          },
          "d": {
            "type": "number"
          },
          "r": {
            "type": "object",
            "properties": {
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "seed"
            ],
            "additionalProperties": false,
            "description": "The input of random: the procedure makes the Random with random(seed) before the call.",
            "x-procedures-construct": {
              "function": "random",
              "params": [
                "seed"
              ]
            }
          },
          "base": {
            "enum": [
              "random",
              "latin"
            ]
          }
        },
        "required": [
          "n",
          "d",
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SaltelliDesign"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "seedOf",
      "path": [
        "generators",
        "seedOf"
      ],
      "description": "The 32-bit seed of a number (its low 32 bits, unsigned) or of a string (its FNV-1a hash).",
      "params": [
        "seed"
      ],
      "input": {
        "type": "object",
        "properties": {
          "seed": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "number"
              }
            ]
          }
        },
        "required": [
          "seed"
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
      "name": "seedsFrom",
      "path": [
        "generators",
        "seedsFrom"
      ],
      "description": "The seeds of a run: the seeds in `given` (the text of an environment variable, for example `process.env.SEED`), else the default seeds. An empty text gives the defaults.",
      "params": [
        "given",
        "defaults"
      ],
      "input": {
        "type": "object",
        "properties": {
          "given": {
            "type": "string"
          },
          "defaults": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "given",
          "defaults"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "number"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sha256Hex",
      "path": [
        "generators",
        "sha256Hex"
      ],
      "description": "This function gives the SHA-256 digest of the bytes of a string, as 64 lowercase hex characters. The option `input` selects the bytes of a lone surrogate. It is not for passwords: it has no salt and no cost.",
      "params": [
        "text",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string"
          },
          "options": {
            "$ref": "#/$defs/Sha256Options"
          }
        },
        "required": [
          "text"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "string"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "shrinkPoint",
      "path": [
        "generators",
        "shrinkPoint"
      ],
      "description": "This function shrinks a point of a family that fails. Each dimension moves toward `shrinkTarget`, while the point still fails. - In each round, each dimension first tries its target. Then a bisection on the scale of the dimension finds the edge of the failure. - The rounds continue until a round has no move, or until the budget of checks ends. - The function `fails` gives `true` for a point that fails. A first point that does not fail is a `RangeError`. - The shrink has no random draws. Thus the same point and the same function give the same result.",
      "params": [
        "family",
        "point",
        "fails",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "family": {
            "$ref": "#/$defs/InputFamily"
          },
          "point": {
            "type": "object",
            "properties": {},
            "additionalProperties": {
              "type": "number"
            }
          },
          "fails": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (point: Readonly<Record<string, number>>) => boolean. It reads each parameter as {\"$ref\": \"<name>\"}: point.",
            "required": [
              "$proc"
            ],
            "properties": {
              "$proc": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 1
              },
              "input": {},
              "$when": {
                "const": "$never"
              }
            },
            "x-procedures-program": {
              "params": [
                "point"
              ],
              "inputs": [
                {
                  "type": "object",
                  "properties": {},
                  "additionalProperties": {
                    "type": "number"
                  }
                }
              ],
              "output": {
                "type": "boolean"
              }
            }
          },
          "options": {
            "$ref": "#/$defs/ShrinkOptions"
          }
        },
        "required": [
          "family",
          "point",
          "fails"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Shrunk"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "shrinkTarget",
      "path": [
        "generators",
        "shrinkTarget"
      ],
      "description": "This function gives the target of a dimension: the value of its range nearest to 0.",
      "params": [
        "dimension"
      ],
      "input": {
        "type": "object",
        "properties": {
          "dimension": {
            "$ref": "#/$defs/Dimension"
          }
        },
        "required": [
          "dimension"
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
      "name": "stablePick",
      "path": [
        "generators",
        "stablePick"
      ],
      "description": "One item of a list, chosen by highest random weight: each key has a weight from `seed`, and the largest weight wins.",
      "params": [
        "seed",
        "items",
        "keyOf"
      ],
      "input": {
        "type": "object",
        "properties": {
          "seed": {
            "type": "number"
          },
          "items": {
            "type": "array",
            "items": {}
          },
          "keyOf": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (item: T) => string. It reads each parameter as {\"$ref\": \"<name>\"}: item.",
            "required": [
              "$proc"
            ],
            "properties": {
              "$proc": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "minItems": 1
              },
              "input": {},
              "$when": {
                "const": "$never"
              }
            },
            "x-procedures-program": {
              "params": [
                "item"
              ],
              "inputs": [
                {}
              ],
              "output": {
                "type": "string"
              }
            }
          }
        },
        "required": [
          "seed",
          "items"
        ],
        "additionalProperties": false
      },
      "output": {},
      "generics": [
        "T"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "stratifiedDesign",
      "path": [
        "generators",
        "stratifiedDesign"
      ],
      "description": "This function gives a stratified grid: `strata` strata on each axis, so `strata^d` cells, and one uniform point in each cell. The cells go in the order of their index in base `strata`, with the first dimension as the last digit.",
      "params": [
        "strata",
        "d",
        "r",
        "limit"
      ],
      "input": {
        "type": "object",
        "properties": {
          "strata": {
            "type": "number"
          },
          "d": {
            "type": "number"
          },
          "r": {
            "type": "object",
            "properties": {
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ]
              }
            },
            "required": [
              "seed"
            ],
            "additionalProperties": false,
            "description": "The input of random: the procedure makes the Random with random(seed) before the call.",
            "x-procedures-construct": {
              "function": "random",
              "params": [
                "seed"
              ]
            }
          },
          "limit": {
            "type": "number"
          }
        },
        "required": [
          "strata",
          "d",
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "type": "array",
          "items": {
            "type": "number"
          }
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "tupleCoverage",
      "path": [
        "generators",
        "tupleCoverage"
      ],
      "description": "This function gives the coverage of some rows over named dimensions, with the strength `t` (the default is 2). A row holds a combination when it has each of its values. The function compares the values as text with `String`, and it ignores the fields of a row that are not dimensions. With fewer dimensions than `t`, the combinations are those of all the dimensions. Thus no dimensions give one empty combination, with the key `\"\"`.",
      "params": [
        "rows",
        "dimensions",
        "strength"
      ],
      "input": {
        "type": "object",
        "properties": {
          "rows": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {},
              "additionalProperties": {}
            }
          },
          "dimensions": {
            "type": "object",
            "properties": {},
            "additionalProperties": {
              "type": "array",
              "items": {}
            }
          },
          "strength": {
            "type": "number"
          }
        },
        "required": [
          "rows",
          "dimensions"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Coverage"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    }
  ],
  "exempt": [
    {
      "name": "coveringRows",
      "reason": "output-not-json",
      "detail": "D[string][number]"
    },
    {
      "name": "distributionOf",
      "reason": "output-not-json",
      "detail": "an object with the method cdf"
    },
    {
      "name": "familyMap",
      "reason": "output-not-json",
      "detail": "(unit: readonly number[]) => Readonly<Record<string, number>>"
    },
    {
      "name": "mulberry32",
      "reason": "output-not-json",
      "detail": "Source"
    },
    {
      "name": "random",
      "reason": "function-parameter",
      "detail": "source: (seed: number) => Source"
    },
    {
      "name": "randomOf",
      "reason": "function-parameter",
      "detail": "source: (seed: number) => Source"
    },
    {
      "name": "sampler",
      "reason": "output-not-json",
      "detail": "() => number"
    },
    {
      "name": "shrinkPointAsync",
      "reason": "function-parameter",
      "detail": "fails: (point: Readonly<Record<string, number>>) => boolean | Promise<boolean>"
    }
  ],
  "others": {
    "classes": [],
    "values": 7,
    "types": 17
  }
};
