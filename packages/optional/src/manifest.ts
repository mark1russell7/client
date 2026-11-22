// The manifest of @mark1russell7/optional 1.5.0, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/optional",
  "version": "1.5.0",
  "entry": ".",
  "namespace": [
    "optional"
  ],
  "$defs": {
    "Err_E": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_2": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_3": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_4": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_5": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_6": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_7": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_8": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_9": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_E_F": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_F": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "Err_F_2": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "err"
        },
        "error": {}
      },
      "required": [
        "tag",
        "error"
      ]
    },
    "None": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "none"
        }
      },
      "required": [
        "tag"
      ]
    },
    "Ok_T": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_2": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_3": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_4": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_5": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_6": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_7": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_8": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_T_9": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_U": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Ok_U_2": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "ok"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Optional_NonNullable_T": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_NonNullable_T"
        }
      ]
    },
    "Optional_T": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T"
        }
      ]
    },
    "Optional_T_10": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_11"
        }
      ]
    },
    "Optional_T_2": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_2"
        }
      ]
    },
    "Optional_T_3": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_3"
        }
      ]
    },
    "Optional_T_4": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_4"
        }
      ]
    },
    "Optional_T_5": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_5"
        }
      ]
    },
    "Optional_T_6": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_6"
        }
      ]
    },
    "Optional_T_7": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_7"
        }
      ]
    },
    "Optional_T_8": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_9"
        }
      ]
    },
    "Optional_T_9": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_T_10"
        }
      ]
    },
    "Optional_U": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_U"
        }
      ]
    },
    "Optional_U_2": {
      "anyOf": [
        {
          "$ref": "#/$defs/None"
        },
        {
          "$ref": "#/$defs/Some_U_2"
        }
      ]
    },
    "Result_T_E": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_2"
        },
        {
          "$ref": "#/$defs/Ok_T"
        }
      ]
    },
    "Result_T_E_2": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_3"
        },
        {
          "$ref": "#/$defs/Ok_T_2"
        }
      ]
    },
    "Result_T_E_3": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_4"
        },
        {
          "$ref": "#/$defs/Ok_T_3"
        }
      ]
    },
    "Result_T_E_4": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_5"
        },
        {
          "$ref": "#/$defs/Ok_T_4"
        }
      ]
    },
    "Result_T_E_5": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_6"
        },
        {
          "$ref": "#/$defs/Ok_T_5"
        }
      ]
    },
    "Result_T_E_6": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_7"
        },
        {
          "$ref": "#/$defs/Ok_T_6"
        }
      ]
    },
    "Result_T_E_7": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_8"
        },
        {
          "$ref": "#/$defs/Ok_T_7"
        }
      ]
    },
    "Result_T_E_8": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_9"
        },
        {
          "$ref": "#/$defs/Ok_T_9"
        }
      ]
    },
    "Result_T_F": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_F_2"
        },
        {
          "$ref": "#/$defs/Ok_T_6"
        }
      ]
    },
    "Result_U_E": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_8"
        },
        {
          "$ref": "#/$defs/Ok_U_2"
        }
      ]
    },
    "Result_U_E_F": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_E_F"
        },
        {
          "$ref": "#/$defs/Ok_U"
        }
      ]
    },
    "Result_U_F": {
      "anyOf": [
        {
          "$ref": "#/$defs/Err_F"
        },
        {
          "$ref": "#/$defs/Ok_U"
        }
      ]
    },
    "Some_NonNullable_T": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {
          "type": [
            "boolean",
            "number",
            "string",
            "array",
            "object"
          ]
        }
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_10": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_11": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_2": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_3": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_4": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_5": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_6": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_7": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_8": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_T_9": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_U": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    },
    "Some_U_2": {
      "type": "object",
      "properties": {
        "tag": {
          "const": "some"
        },
        "value": {}
      },
      "required": [
        "tag",
        "value"
      ]
    }
  },
  "procedures": [
    {
      "name": "err",
      "path": [
        "optional",
        "err"
      ],
      "description": "This function wraps the error of a step that failed.",
      "params": [
        "error"
      ],
      "input": {
        "type": "object",
        "properties": {
          "error": {}
        },
        "required": [
          "error"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Err_E"
      },
      "generics": [
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "flatMap",
      "path": [
        "optional",
        "flatMap"
      ],
      "description": "This function applies `f`, which gives an optional, to a present value. An absent value stays absent.",
      "params": [
        "o",
        "f"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T"
          },
          "f": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (v: T) => Optional<U>. It reads each parameter as {\"$ref\": \"<name>\"}: v.",
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
                "v"
              ],
              "inputs": [
                {}
              ],
              "output": {
                "$ref": "#/$defs/Optional_U"
              }
            }
          }
        },
        "required": [
          "o",
          "f"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Optional_U"
      },
      "generics": [
        "T",
        "U"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "flatMapResult",
      "path": [
        "optional",
        "flatMapResult"
      ],
      "description": "This function applies `f`, which gives a result, to a value. An error stays the same.",
      "params": [
        "r",
        "f"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E"
          },
          "f": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (v: T) => Result<U, F>. It reads each parameter as {\"$ref\": \"<name>\"}: v.",
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
                "v"
              ],
              "inputs": [
                {}
              ],
              "output": {
                "$ref": "#/$defs/Result_U_F"
              }
            }
          }
        },
        "required": [
          "r",
          "f"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Result_U_E_F"
      },
      "generics": [
        "T",
        "U",
        "E",
        "F"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromNullable",
      "path": [
        "optional",
        "fromNullable"
      ],
      "description": "This function wraps a value, and gives `none` for `null` and `undefined`.",
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
        "$ref": "#/$defs/Optional_NonNullable_T"
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
      "name": "fromOptional",
      "path": [
        "optional",
        "fromOptional"
      ],
      "description": "This function changes an optional into a result: a present value becomes `ok`, and `none` becomes `err(error)`.",
      "params": [
        "o",
        "error"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_2"
          },
          "error": {}
        },
        "required": [
          "o",
          "error"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Result_T_E_2"
      },
      "generics": [
        "T",
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromSentinel",
      "path": [
        "optional",
        "fromSentinel"
      ],
      "description": "This function changes a value of the sentinel form into an optional. In the sentinel form, the value `sentinel` means \"absent\", for example a symbol `NotFound`.",
      "params": [
        "value",
        "sentinel"
      ],
      "input": {
        "type": "object",
        "properties": {
          "value": {},
          "sentinel": {}
        },
        "required": [
          "value",
          "sentinel"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Optional_T_3"
      },
      "generics": [
        "T",
        "S"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "getOkOr",
      "path": [
        "optional",
        "getOkOr"
      ],
      "description": "This function gives the value, or `fallback` for an error.",
      "params": [
        "r",
        "fallback"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E_3"
          },
          "fallback": {}
        },
        "required": [
          "r",
          "fallback"
        ],
        "additionalProperties": false
      },
      "output": {},
      "generics": [
        "T",
        "U",
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "getOr",
      "path": [
        "optional",
        "getOr"
      ],
      "description": "This function gives the present value, or `fallback`.",
      "params": [
        "o",
        "fallback"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_4"
          },
          "fallback": {}
        },
        "required": [
          "o",
          "fallback"
        ],
        "additionalProperties": false
      },
      "output": {},
      "generics": [
        "T",
        "U"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "isErr",
      "path": [
        "optional",
        "isErr"
      ],
      "description": "This function tells if a result is an error.",
      "params": [
        "r"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E_4"
          }
        },
        "required": [
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "generics": [
        "T",
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "isNone",
      "path": [
        "optional",
        "isNone"
      ],
      "description": "This function tells if an optional is absent.",
      "params": [
        "o"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_5"
          }
        },
        "required": [
          "o"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
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
      "name": "isOk",
      "path": [
        "optional",
        "isOk"
      ],
      "description": "This function tells if a result is a value.",
      "params": [
        "r"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E_5"
          }
        },
        "required": [
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
      },
      "generics": [
        "T",
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "isSome",
      "path": [
        "optional",
        "isSome"
      ],
      "description": "This function tells if an optional is present.",
      "params": [
        "o"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_6"
          }
        },
        "required": [
          "o"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "boolean"
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
      "name": "map",
      "path": [
        "optional",
        "map"
      ],
      "description": "This function applies `f` to a present value. An absent value stays absent.",
      "params": [
        "o",
        "f"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_7"
          },
          "f": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (v: T) => U. It reads each parameter as {\"$ref\": \"<name>\"}: v.",
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
                "v"
              ],
              "inputs": [
                {}
              ],
              "output": {}
            }
          }
        },
        "required": [
          "o",
          "f"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Optional_U_2"
      },
      "generics": [
        "T",
        "U"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "mapErr",
      "path": [
        "optional",
        "mapErr"
      ],
      "description": "This function applies `f` to an error. A value stays the same.",
      "params": [
        "r",
        "f"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E_6"
          },
          "f": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (e: E) => F. It reads each parameter as {\"$ref\": \"<name>\"}: e.",
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
                "e"
              ],
              "inputs": [
                {}
              ],
              "output": {}
            }
          }
        },
        "required": [
          "r",
          "f"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Result_T_F"
      },
      "generics": [
        "T",
        "E",
        "F"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "mapResult",
      "path": [
        "optional",
        "mapResult"
      ],
      "description": "This function applies `f` to a value. An error stays the same.",
      "params": [
        "r",
        "f"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E_7"
          },
          "f": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (v: T) => U. It reads each parameter as {\"$ref\": \"<name>\"}: v.",
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
                "v"
              ],
              "inputs": [
                {}
              ],
              "output": {}
            }
          }
        },
        "required": [
          "r",
          "f"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Result_U_E"
      },
      "generics": [
        "T",
        "U",
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "ok",
      "path": [
        "optional",
        "ok"
      ],
      "description": "This function wraps a value of a step that succeeded.",
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
        "$ref": "#/$defs/Ok_T_8"
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
      "name": "some",
      "path": [
        "optional",
        "some"
      ],
      "description": "This function wraps a present value.",
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
        "$ref": "#/$defs/Some_T_8"
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
      "name": "toOptional",
      "path": [
        "optional",
        "toOptional"
      ],
      "description": "This function changes a result into an optional: a value becomes `some`, and an error becomes `none`.",
      "params": [
        "r"
      ],
      "input": {
        "type": "object",
        "properties": {
          "r": {
            "$ref": "#/$defs/Result_T_E_8"
          }
        },
        "required": [
          "r"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Optional_T_8"
      },
      "generics": [
        "T",
        "E"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "toSentinel",
      "path": [
        "optional",
        "toSentinel"
      ],
      "description": "This function changes an optional into the sentinel form: an absent value becomes `sentinel`.",
      "params": [
        "o",
        "sentinel"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_9"
          },
          "sentinel": {}
        },
        "required": [
          "o",
          "sentinel"
        ],
        "additionalProperties": false
      },
      "output": {},
      "generics": [
        "T",
        "S"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "unwrap",
      "path": [
        "optional",
        "unwrap"
      ],
      "description": "This function gives the present value, or `undefined`.",
      "params": [
        "o"
      ],
      "input": {
        "type": "object",
        "properties": {
          "o": {
            "$ref": "#/$defs/Optional_T_10"
          }
        },
        "required": [
          "o"
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
    }
  ],
  "exempt": [
    {
      "name": "filter",
      "reason": "overload",
      "detail": "2 signatures"
    },
    {
      "name": "tryCatch",
      "reason": "overload",
      "detail": "2 signatures"
    },
    {
      "name": "tryCatchAsync",
      "reason": "overload",
      "detail": "2 signatures"
    }
  ],
  "others": {
    "classes": [],
    "values": 1,
    "types": 6
  }
};
