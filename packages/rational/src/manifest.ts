// The manifest of @mark1russell7/rational 0.1.3, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/rational",
  "version": "0.1.3",
  "entry": ".",
  "namespace": [
    "rational"
  ],
  "$defs": {
    "Rational": {
      "type": "object",
      "properties": {
        "n": {
          "type": "string",
          "pattern": "^-?(0|[1-9][0-9]*)$",
          "x-procedures-codec": "bigint"
        },
        "d": {
          "type": "string",
          "pattern": "^-?(0|[1-9][0-9]*)$",
          "x-procedures-codec": "bigint"
        }
      },
      "required": [
        "n",
        "d"
      ]
    }
  },
  "procedures": [
    {
      "name": "abs",
      "path": [
        "rational",
        "abs"
      ],
      "description": "This function gives `|a|`. The result is exact.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "add",
      "path": [
        "rational",
        "add"
      ],
      "description": "This function gives `a + b`. The result is exact.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "ceil",
      "path": [
        "rational",
        "ceil"
      ],
      "description": "This function gives the least integer that is not less than the value. The result is exact.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "cmp",
      "path": [
        "rational",
        "cmp"
      ],
      "description": "This function is `compare`, with the name that `@mark1russell7/quantity` uses.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "enum": [
          0,
          1,
          -1
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "compare",
      "path": [
        "rational",
        "compare"
      ],
      "description": "This function gives -1, 0 or 1 for `a < b`, `a = b` or `a > b`. The result is exact.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "enum": [
          0,
          1,
          -1
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "div",
      "path": [
        "rational",
        "div"
      ],
      "description": "This function gives `a / b`. The result is exact.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "equals",
      "path": [
        "rational",
        "equals"
      ],
      "description": "This function tells if `a = b`. Each rational is in lowest terms, so the test compares the fields.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
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
      "name": "floor",
      "path": [
        "rational",
        "floor"
      ],
      "description": "This function gives the greatest integer that is not more than the value. The result is exact.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromDecimal",
      "path": [
        "rational",
        "fromDecimal"
      ],
      "description": "This function reads a decimal from its text, exactly. The text `\"0.0254\"` gives 127/5000, and `\"1e-9\"` gives 1/10^9.",
      "params": [
        "text"
      ],
      "input": {
        "type": "object",
        "properties": {
          "text": {
            "type": "string"
          }
        },
        "required": [
          "text"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromFloat",
      "path": [
        "rational",
        "fromFloat"
      ],
      "description": "This function gives the exact value of a finite double. Thus `0.1` gives 3602879701896397/2^55. The value `-0` gives 0.",
      "params": [
        "value"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {
            "type": "number"
          }
        },
        "required": [
          "value"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromNumber",
      "path": [
        "rational",
        "fromNumber"
      ],
      "description": "This function reads a finite number as JavaScript prints it. That text is the shortest decimal that reads back as the same number. Thus `0.1` gives 1/10, not the exact value of the double. Use `fromFloat` for the exact value.",
      "params": [
        "value"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {
            "type": "number"
          }
        },
        "required": [
          "value"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "gcd",
      "path": [
        "rational",
        "gcd"
      ],
      "description": "This function gives the greatest common divisor of `|a|` and `|b|`. The result for `0` and `0` is `0`.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "string",
            "pattern": "^-?(0|[1-9][0-9]*)$",
            "x-procedures-codec": "bigint",
            "description": "An integer."
          },
          "b": {
            "type": "string",
            "pattern": "^-?(0|[1-9][0-9]*)$",
            "x-procedures-codec": "bigint",
            "description": "An integer."
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "string",
        "pattern": "^-?(0|[1-9][0-9]*)$",
        "x-procedures-codec": "bigint"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "integerRoot",
      "path": [
        "rational",
        "integerRoot"
      ],
      "description": "This function gives the floor of the `k`-th root of `n`: the largest integer `r` with `r^k <= n`. The result is exact. The search starts above the root, from the bit length of `n`, and the Newton steps go down to the root.",
      "params": [
        "n",
        "k"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "string",
            "pattern": "^-?(0|[1-9][0-9]*)$",
            "x-procedures-codec": "bigint",
            "description": "A value that is not less than `0n`."
          },
          "k": {
            "type": "number",
            "description": "An integer index of 1 or more."
          }
        },
        "required": [
          "n",
          "k"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "string",
        "pattern": "^-?(0|[1-9][0-9]*)$",
        "x-procedures-codec": "bigint"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "inverse",
      "path": [
        "rational",
        "inverse"
      ],
      "description": "This function gives `1 / a`. The result is exact.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "isInteger",
      "path": [
        "rational",
        "isInteger"
      ],
      "description": "This function tells if the value is an integer.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
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
      "name": "mul",
      "path": [
        "rational",
        "mul"
      ],
      "description": "This function gives `a × b`. The result is exact.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "neg",
      "path": [
        "rational",
        "neg"
      ],
      "description": "This function gives `-a`. The result is exact.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "pow",
      "path": [
        "rational",
        "pow"
      ],
      "description": "This function gives `a` to an integer power. The result is exact. The power 0 of each value, 0 too, is 1.",
      "params": [
        "a",
        "exponent"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "exponent": {
            "type": "number"
          }
        },
        "required": [
          "a",
          "exponent"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "rational",
      "path": [
        "rational",
        "rational"
      ],
      "description": "This function makes the rational `n / d` in lowest terms. The result is exact.",
      "params": [
        "n",
        "d"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "string",
            "pattern": "^-?(0|[1-9][0-9]*)$",
            "x-procedures-codec": "bigint",
            "description": "The numerator."
          },
          "d": {
            "type": "string",
            "pattern": "^-?(0|[1-9][0-9]*)$",
            "x-procedures-codec": "bigint",
            "description": "The denominator. The default is `1n`."
          }
        },
        "required": [
          "n"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "root",
      "path": [
        "rational",
        "root"
      ],
      "description": "This function gives the `k`-th root of `a` when it is a rational, and `null` when it is not. The root of a rational in lowest terms is rational only when its numerator and its denominator are both `k`-th powers of integers. An odd index gives the negative root of a negative value. The result is exact.",
      "params": [
        "a",
        "k"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational",
            "description": "The value."
          },
          "k": {
            "type": "number",
            "description": "An integer index of 1 or more."
          }
        },
        "required": [
          "a",
          "k"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "type": "null"
          },
          {
            "$ref": "#/$defs/Rational"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sign",
      "path": [
        "rational",
        "sign"
      ],
      "description": "This function gives -1, 0 or 1 for a value that is less than 0, equal to 0 or more than 0.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
        ],
        "additionalProperties": false
      },
      "output": {
        "enum": [
          0,
          1,
          -1
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sub",
      "path": [
        "rational",
        "sub"
      ],
      "description": "This function gives `a - b`. The result is exact.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          },
          "b": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Rational"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "toNumber",
      "path": [
        "rational",
        "toNumber"
      ],
      "description": "This function gives the nearest double to the value, with ties to even. The error is at most half a unit in the last place. A value past the range of the doubles gives an infinity, and a value too small gives 0 or a subnormal.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
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
      "name": "toString",
      "path": [
        "rational",
        "toString"
      ],
      "description": "This function gives the text `\"n/d\"`, or `\"n\"` for an integer. The text is exact.",
      "params": [
        "a"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/Rational"
          }
        },
        "required": [
          "a"
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
    }
  ],
  "exempt": [],
  "others": {
    "classes": [],
    "values": 3,
    "types": 1
  }
};
