// The manifest of @mark1russell7/quantity 0.4.1, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/quantity",
  "version": "0.4.1",
  "entry": ".",
  "namespace": [
    "quantity"
  ],
  "$defs": {
    "Extent": {
      "anyOf": [
        {
          "$ref": "#/$defs/Quantity"
        },
        {
          "$ref": "#/$defs/Unbounded"
        }
      ]
    },
    "FormatOptions": {
      "type": "object",
      "properties": {
        "digits": {
          "type": "number",
          "description": "This number is the most decimal places to show (the default is 2). Money shows exactly this many when it is given. Otherwise money shows its cents only when it has cents: $400, $42.49."
        },
        "signed": {
          "type": "boolean",
          "description": "This option shows a + on a positive amount, for changes."
        }
      }
    },
    "MeasuredOn": {
      "type": "object",
      "properties": {
        "hz": {
          "type": "number",
          "description": "The timer frequency of the kernel converts jiffies: at 250, one jiffy is 4 ms."
        }
      }
    },
    "Quantity": {
      "type": "object",
      "properties": {
        "value": {
          "type": "number"
        },
        "unit": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "unit"
      ]
    },
    "Scale": {
      "type": "object",
      "properties": {
        "steps": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ScaleStep"
          }
        },
        "compound": {
          "$ref": "#/$defs/ScaleCompound"
        }
      },
      "required": [
        "steps"
      ]
    },
    "ScaleCompound": {
      "type": "object",
      "properties": {
        "units": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The units of the compound, from the largest to the smallest."
        },
        "parts": {
          "type": "number",
          "description": "This number is the most units that the text names (the default is all). The smallest of them is rounded."
        }
      },
      "required": [
        "units"
      ]
    },
    "ScaleStep": {
      "type": "object",
      "properties": {
        "unit": {
          "type": "string",
          "description": "The unit of the step. The text shows its symbol, so the text reads back as the same amount."
        },
        "digits": {
          "type": "number",
          "description": "This number is the most decimal places (the default is 2)."
        },
        "significant": {
          "type": "number",
          "description": "This number is the significant digits. The decimal places then shrink as the number grows, but stay at most `digits`: with 2, the text is \"0.42\", \"3.5\" and \"120\"."
        },
        "fixed": {
          "type": "boolean",
          "description": "This option always shows `digits` decimal places: \"1.0\", not \"1\"."
        }
      },
      "required": [
        "unit"
      ]
    },
    "Unbounded": {
      "type": "object",
      "properties": {
        "value": {
          "const": "infinite"
        },
        "unit": {
          "type": "string"
        }
      },
      "required": [
        "value",
        "unit"
      ]
    },
    "Unknown": {
      "type": "object",
      "properties": {
        "unknown": {
          "type": "string"
        },
        "unit": {
          "type": "string"
        }
      },
      "required": [
        "unknown"
      ]
    }
  },
  "procedures": [
    {
      "name": "add",
      "path": [
        "quantity",
        "add"
      ],
      "description": "This function gives a + b in the unit of a. It is exact for decimal inputs, thus money adds to the cent.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Quantity"
          },
          "b": {
            "$ref": "#/$defs/Quantity"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "canonicalUnit",
      "path": [
        "quantity",
        "canonicalUnit"
      ],
      "description": "This function gives the canonical spelling of a unit, for data from another system: \"hr\" is \"h\".",
      "params": [
        "spelling"
      ],
      "input": {
        "type": "object",
        "properties": {
          "spelling": {
            "type": "string"
          }
        },
        "required": [
          "spelling"
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
      "name": "compare",
      "path": [
        "quantity",
        "compare"
      ],
      "description": "This function gives -1, 0 or 1. Infinity is larger than all amounts, and equal to itself.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Extent"
          },
          "b": {
            "$ref": "#/$defs/Extent"
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
      "name": "convert",
      "path": [
        "quantity",
        "convert"
      ],
      "params": [
        "amount",
        "to",
        "on"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "to": {
            "type": "string"
          },
          "on": {
            "$ref": "#/$defs/MeasuredOn"
          }
        },
        "required": [
          "amount",
          "to"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "convertible",
      "path": [
        "quantity",
        "convertible"
      ],
      "params": [
        "from",
        "to"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "type": "string"
          },
          "to": {
            "type": "string"
          }
        },
        "required": [
          "from",
          "to"
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
      "name": "format",
      "path": [
        "quantity",
        "format"
      ],
      "description": "This function prints an amount: \"$1,234.56\", \"$500/mo\", \"7,875 s\", \"34.5%\", \"72°F\", \"12 reps\", \"∞ s\".",
      "params": [
        "amount",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "anyOf": [
              {
                "$ref": "#/$defs/Quantity"
              },
              {
                "$ref": "#/$defs/Unbounded"
              },
              {
                "$ref": "#/$defs/Unknown"
              }
            ]
          },
          "options": {
            "$ref": "#/$defs/FormatOptions"
          }
        },
        "required": [
          "amount"
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
      "name": "formatDuration",
      "path": [
        "quantity",
        "formatDuration"
      ],
      "description": "This function prints a time as people say it: \"2 h 11 min 15 s\", \"45 min\", \"2 days 3 h\". A time of less than a second keeps its own unit (\"250 ms\"). The `parts` option sets the most units that it names, and it rounds the smallest. It is `formatOnScale` with a compound of days, hours, minutes and seconds.",
      "params": [
        "amount",
        "parts"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "parts": {
            "type": "number"
          }
        },
        "required": [
          "amount"
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
      "name": "formatOnScale",
      "path": [
        "quantity",
        "formatOnScale"
      ],
      "description": "This function prints an amount on a scale: \"512 B\", \"1.5 KiB\", \"3.5 ms\", \"1.25 s\", \"2 min 5 s\". It rounds the amount in a step before it compares the amount with the next step. Thus 1,048,575 B gives \"1 MiB\", not \"1,024 KiB\".",
      "params": [
        "amount",
        "scale"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "scale": {
            "$ref": "#/$defs/Scale"
          }
        },
        "required": [
          "amount",
          "scale"
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
      "name": "formatUnit",
      "path": [
        "quantity",
        "formatUnit"
      ],
      "description": "This function gives how a unit reads next to an amount: \"kcal/(h·kg)\", \"sets/wk\", \"% of 1RM\", \"mph\".",
      "params": [
        "unit",
        "many"
      ],
      "input": {
        "type": "object",
        "properties": {
          "unit": {
            "type": "string"
          },
          "many": {
            "type": "boolean"
          }
        },
        "required": [
          "unit"
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
      "name": "isCanonicalUnit",
      "path": [
        "quantity",
        "isCanonicalUnit"
      ],
      "description": "This function tells if stored data can have this spelling. Only the canonical spelling is correct.",
      "params": [
        "spelling"
      ],
      "input": {
        "type": "object",
        "properties": {
          "spelling": {
            "type": "string"
          }
        },
        "required": [
          "spelling"
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
      "name": "isQuantity",
      "path": [
        "quantity",
        "isQuantity"
      ],
      "description": "This function tells if a value from data is a quantity: a finite number and a canonical unit.",
      "params": [
        "value"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {}
        },
        "required": [
          "value"
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
      "name": "isUnbounded",
      "path": [
        "quantity",
        "isUnbounded"
      ],
      "params": [
        "extent"
      ],
      "input": {
        "type": "object",
        "properties": {
          "extent": {
            "$ref": "#/$defs/Extent"
          }
        },
        "required": [
          "extent"
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
      "name": "kindOf",
      "path": [
        "quantity",
        "kindOf"
      ],
      "params": [
        "spelling"
      ],
      "input": {
        "type": "object",
        "properties": {
          "spelling": {
            "type": "string"
          }
        },
        "required": [
          "spelling"
        ],
        "additionalProperties": false
      },
      "output": {
        "enum": [
          "time",
          "length",
          "mass",
          "temperature",
          "data",
          "money",
          "current",
          "count",
          "ratio",
          "level",
          "frequency",
          "transfer-rate",
          "data-rate",
          "speed",
          "area",
          "volume",
          "energy",
          "power",
          "voltage",
          "charge",
          "resistance",
          "specific-power",
          "specific-volume-rate",
          "money-rate",
          "energy-price",
          "derived"
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "kindOfQuantity",
      "path": [
        "quantity",
        "kindOfQuantity"
      ],
      "description": "This function gives the kind that a quantity measures.",
      "params": [
        "amount"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "anyOf": [
              {
                "$ref": "#/$defs/Quantity"
              },
              {
                "$ref": "#/$defs/Unbounded"
              }
            ]
          }
        },
        "required": [
          "amount"
        ],
        "additionalProperties": false
      },
      "output": {
        "enum": [
          "time",
          "length",
          "mass",
          "temperature",
          "data",
          "money",
          "current",
          "count",
          "ratio",
          "level",
          "frequency",
          "transfer-rate",
          "data-rate",
          "speed",
          "area",
          "volume",
          "energy",
          "power",
          "voltage",
          "charge",
          "resistance",
          "specific-power",
          "specific-volume-rate",
          "money-rate",
          "energy-price",
          "derived"
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "max",
      "path": [
        "quantity",
        "max"
      ],
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Extent"
          },
          "b": {
            "$ref": "#/$defs/Extent"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Extent"
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
      "name": "mean",
      "path": [
        "quantity",
        "mean"
      ],
      "description": "This function gives the arithmetic mean. For a logarithmic level, it gives the energy mean: 10·log10 of the mean power.",
      "params": [
        "amounts",
        "unit"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amounts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Quantity"
            }
          },
          "unit": {
            "type": "string"
          }
        },
        "required": [
          "amounts"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "min",
      "path": [
        "quantity",
        "min"
      ],
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Extent"
          },
          "b": {
            "$ref": "#/$defs/Extent"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Extent"
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
      "name": "quantity",
      "path": [
        "quantity",
        "quantity"
      ],
      "description": "This function makes a quantity, and checks that it has a finite value and a canonical unit.",
      "params": [
        "value",
        "unit"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {
            "type": "number"
          },
          "unit": {
            "type": "string"
          }
        },
        "required": [
          "value",
          "unit"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "round",
      "path": [
        "quantity",
        "round"
      ],
      "description": "This function rounds an amount to the decimals that its unit keeps (money to the cent), or to `decimals`.",
      "params": [
        "amount",
        "decimals"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "decimals": {
            "type": "number"
          }
        },
        "required": [
          "amount"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sameVector",
      "path": [
        "quantity",
        "sameVector"
      ],
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "object",
            "properties": {
              "time": {
                "type": "number"
              },
              "length": {
                "type": "number"
              },
              "mass": {
                "type": "number"
              },
              "temperature": {
                "type": "number"
              },
              "data": {
                "type": "number"
              },
              "money": {
                "type": "number"
              },
              "current": {
                "type": "number"
              }
            }
          },
          "b": {
            "type": "object",
            "properties": {
              "time": {
                "type": "number"
              },
              "length": {
                "type": "number"
              },
              "mass": {
                "type": "number"
              },
              "temperature": {
                "type": "number"
              },
              "data": {
                "type": "number"
              },
              "money": {
                "type": "number"
              },
              "current": {
                "type": "number"
              }
            }
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
      "name": "scale",
      "path": [
        "quantity",
        "scale"
      ],
      "description": "This function multiplies an amount by a plain number: a count of probes, or a share.",
      "params": [
        "amount",
        "by"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "by": {
            "type": "number"
          }
        },
        "required": [
          "amount",
          "by"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sub",
      "path": [
        "quantity",
        "sub"
      ],
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Quantity"
          },
          "b": {
            "$ref": "#/$defs/Quantity"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sum",
      "path": [
        "quantity",
        "sum"
      ],
      "description": "This function gives the sum in `unit`, or in the unit of the first amount. An empty sum needs `unit`.",
      "params": [
        "amounts",
        "unit"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amounts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Quantity"
            }
          },
          "unit": {
            "type": "string"
          }
        },
        "required": [
          "amounts"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Quantity"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "toNanoseconds",
      "path": [
        "quantity",
        "toNanoseconds"
      ],
      "description": "This function gives a time as a whole number of nanoseconds, or refuses it. A double holds each whole nanosecond for approximately 104 days.",
      "params": [
        "amount",
        "on"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "on": {
            "$ref": "#/$defs/MeasuredOn"
          }
        },
        "required": [
          "amount"
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
      "name": "unbounded",
      "path": [
        "quantity",
        "unbounded"
      ],
      "params": [
        "unit"
      ],
      "input": {
        "type": "object",
        "properties": {
          "unit": {
            "type": "string"
          }
        },
        "required": [
          "unit"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Unbounded"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "valueIn",
      "path": [
        "quantity",
        "valueIn"
      ],
      "description": "This function gives the number that a quantity is in a unit.",
      "params": [
        "amount",
        "unit",
        "on"
      ],
      "input": {
        "type": "object",
        "properties": {
          "amount": {
            "$ref": "#/$defs/Quantity"
          },
          "unit": {
            "type": "string"
          },
          "on": {
            "$ref": "#/$defs/MeasuredOn"
          }
        },
        "required": [
          "amount",
          "unit"
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
      "name": "whyNotConvertible",
      "path": [
        "quantity",
        "whyNotConvertible"
      ],
      "description": "This function gives the reason that `from` cannot become `to`, or undefined when it can.",
      "params": [
        "from",
        "to"
      ],
      "input": {
        "type": "object",
        "properties": {
          "from": {
            "type": "string"
          },
          "to": {
            "type": "string"
          }
        },
        "required": [
          "from",
          "to"
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
    }
  ],
  "exempt": [
    {
      "name": "convertExact",
      "reason": "input-not-json",
      "detail": "value.n: bigint"
    },
    {
      "name": "lookupAtom",
      "reason": "output-not-json",
      "detail": "factor.n: bigint"
    },
    {
      "name": "parseUnit",
      "reason": "output-not-json",
      "detail": "components.atom.factor.n: bigint"
    },
    {
      "name": "tryParseUnit",
      "reason": "output-not-json",
      "detail": "components.atom.factor.n: bigint"
    },
    {
      "name": "unitSystem",
      "reason": "input-not-json",
      "detail": "atoms.factor.n: bigint"
    }
  ],
  "others": {
    "classes": [
      "UnitError"
    ],
    "values": 14,
    "types": 18
  }
};
