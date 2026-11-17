// The manifest of @mark1russell7/algebra 0.9.6, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/algebra",
  "version": "0.9.6",
  "entry": ".",
  "namespace": [
    "algebra"
  ],
  "$defs": {
    "Band": {
      "type": "object",
      "properties": {
        "low": {
          "$ref": "#/$defs/Extent",
          "description": "This time is the duration less how early the timer can fire."
        },
        "high": {
          "$ref": "#/$defs/Extent",
          "description": "This time is the duration plus how late the timer can fire."
        }
      },
      "required": [
        "low",
        "high"
      ]
    },
    "Detection": {
      "type": "object",
      "properties": {
        "detectors": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Detector"
          },
          "description": "These are the timers that can still fire, the soonest first."
        },
        "first": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "$ref": "#/$defs/Detector"
            }
          ],
          "description": "This detector is the first to fire, or null when none can fire in a known time: a silent failure."
        },
        "unsettled": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "These are the live detectors whose time nothing gives. Then `first` is only an upper bound."
        },
        "held": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "timer": {
                "type": "string"
              },
              "why": {
                "type": "string"
              }
            },
            "required": [
              "timer",
              "why"
            ]
          },
          "description": "These are the timers that are armed but cannot fire, and the reason for each."
        },
        "delivered": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "event": {
                "type": "string"
              },
              "to": {
                "type": "string"
              },
              "errno": {
                "anyOf": [
                  {
                    "type": "null"
                  },
                  {
                    "type": "string"
                  }
                ]
              }
            },
            "required": [
              "event",
              "to",
              "errno"
            ]
          },
          "description": "These are the events that the failure delivers and that a transition takes from the state: each detects the failure at once, before any timer. The errno is the errno of the transition, or null for an end of file."
        }
      },
      "required": [
        "detectors",
        "first",
        "unsettled",
        "held",
        "delivered"
      ]
    },
    "Detector": {
      "type": "object",
      "properties": {
        "timer": {
          "type": "string"
        },
        "fires": {
          "type": "string"
        },
        "duration": {
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
        "beneath": {
          "type": "string",
          "description": "This identifier is the machine below whose timer it is, when the timer is not of the machine itself (`over`)."
        }
      },
      "required": [
        "timer",
        "fires",
        "duration"
      ]
    },
    "EgressOutcome": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "sent"
            },
            "at": {
              "type": "number",
              "description": "This value is the time that the packet leaves the qdisc, in nanoseconds."
            },
            "ahead": {
              "type": "number",
              "description": "This value is the packets in the queue at the arrival of the packet."
            },
            "bytes": {
              "type": "number",
              "description": "This value is the bytes in the queue at the arrival of the packet."
            }
          },
          "required": [
            "kind",
            "at",
            "ahead",
            "bytes"
          ]
        },
        {
          "type": "object",
          "properties": {
            "kind": {
              "const": "dropped"
            },
            "why": {
              "enum": [
                "limit",
                "size"
              ],
              "description": "A `limit` drop is a full queue. A `size` drop is a packet longer than the largest size of tbf."
            },
            "ahead": {
              "type": "number"
            },
            "bytes": {
              "type": "number"
            }
          },
          "required": [
            "kind",
            "why",
            "ahead",
            "bytes"
          ]
        }
      ]
    },
    "EgressPacket": {
      "type": "object",
      "properties": {
        "at": {
          "type": "number",
          "description": "This value is the time of the arrival, in nanoseconds. The arrivals of a schedule do not go back in time."
        },
        "length": {
          "type": "number",
          "description": "This value is the qdisc length of the packet, in bytes."
        }
      },
      "required": [
        "at",
        "length"
      ]
    },
    "Expr": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "const": {
              "type": "number"
            },
            "unit": {
              "type": "string"
            }
          },
          "required": [
            "const",
            "unit"
          ]
        },
        {
          "type": "object",
          "properties": {
            "knob": {
              "type": "string"
            },
            "unit": {
              "type": "string"
            }
          },
          "required": [
            "knob",
            "unit"
          ]
        },
        {
          "type": "object",
          "properties": {
            "expr": {
              "type": "string"
            },
            "unit": {
              "type": "string"
            }
          },
          "required": [
            "expr",
            "unit"
          ]
        },
        {
          "type": "object",
          "properties": {
            "model": {
              "type": "string"
            },
            "knobs": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "unit": {
              "type": "string"
            }
          },
          "required": [
            "model",
            "knobs",
            "unit"
          ]
        }
      ]
    },
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
    "Firing": {
      "type": "object",
      "properties": {
        "fired": {
          "type": "number"
        },
        "low": {
          "$ref": "#/$defs/Quantity",
          "description": "This time is the sum of the waits to this firing, each less how early it can fire."
        },
        "high": {
          "$ref": "#/$defs/Quantity",
          "description": "This time is the sum of the waits to this firing, each plus how late it can fire."
        }
      },
      "required": [
        "fired",
        "low",
        "high"
      ]
    },
    "Machine": {
      "type": "object",
      "properties": {
        "format": {
          "const": "mark1russell7.machine/1"
        },
        "id": {
          "type": "string"
        },
        "title": {
          "type": "string"
        },
        "layer": {
          "$ref": "#/$defs/Vantage"
        },
        "version": {
          "type": "string"
        },
        "conditions": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "string"
          }
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "ref": {
                "type": "string"
              },
              "rung": {
                "enum": [
                  "normative",
                  "implemented",
                  "documented",
                  "observed",
                  "derived"
                ]
              },
              "note": {
                "type": "string"
              }
            },
            "required": [
              "ref",
              "rung"
            ]
          }
        },
        "states": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {
              "initial": {
                "type": "boolean"
              },
              "final": {
                "type": "boolean"
              },
              "pseudo": {
                "type": "boolean"
              },
              "note": {
                "type": "string"
              }
            }
          }
        },
        "events": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {
              "kind": {
                "enum": [
                  "rx",
                  "tx",
                  "app",
                  "timer",
                  "local",
                  "packet",
                  "peer"
                ]
              },
              "note": {
                "type": "string"
              }
            },
            "required": [
              "kind"
            ]
          }
        },
        "knobs": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {
              "key": {
                "type": "string"
              },
              "scope": {
                "type": "string"
              },
              "unit": {
                "anyOf": [
                  {
                    "type": "null"
                  },
                  {
                    "type": "string"
                  }
                ]
              },
              "default": {
                "anyOf": [
                  {
                    "type": "null"
                  },
                  {
                    "type": "number"
                  }
                ]
              },
              "off": {
                "type": "number",
                "description": "This value turns the knob's timers off: a time that reads the knob at it has no bound."
              },
              "note": {
                "type": "string"
              }
            },
            "required": [
              "key",
              "scope",
              "unit",
              "default"
            ]
          }
        },
        "timers": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/Timer"
          }
        },
        "realizes": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/Realization"
          },
          "description": "These are the mechanisms whose time this machine gives, by the identifier of each mechanism."
        },
        "over": {
          "$ref": "#/$defs/Over",
          "description": "This is the machine that this machine operates on, for a machine on another machine."
        },
        "transitions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/TransitionDef"
          }
        },
        "observe": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {
              "states": {
                "type": "object",
                "properties": {},
                "additionalProperties": {
                  "type": "string"
                }
              },
              "hides": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "fidelity": {
                "enum": [
                  "derived",
                  "complete",
                  "sampled",
                  "lossy"
                ]
              },
              "note": {
                "type": "string"
              }
            },
            "required": [
              "states",
              "fidelity"
            ]
          }
        },
        "generated": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string"
            },
            "by": {
              "type": "string"
            }
          },
          "required": [
            "from",
            "by"
          ]
        }
      },
      "required": [
        "format",
        "id",
        "title",
        "layer",
        "version",
        "sources",
        "states",
        "events",
        "knobs",
        "timers",
        "transitions"
      ]
    },
    "Manifestation": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "passes": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "delivers": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "These are the events that the failure itself sends one time, for example the FIN of a process that stopped with SIGKILL. A delivered event that a transition takes from the state of the connection detects the failure at once."
        },
        "errno": {
          "type": "object",
          "properties": {
            "errno": {
              "type": "string"
            },
            "timers": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          "required": [
            "errno",
            "timers"
          ],
          "description": "This errno replaces ETIMEDOUT when one of these timers gives up. Linux keeps an ICMP error on an established socket as a soft error, and the timeout reports it (`tcp_write_err`). An ICMP counts only when it quotes a segment in the window (`tcp_v4_err`). A retransmission is in the window. A keepalive probe uses the sequence number before `snd_una`, thus its ICMP does not count."
        },
        "replaces": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {
              "duration": {
                "anyOf": [
                  {
                    "type": "object",
                    "properties": {
                      "const": {
                        "type": "number"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "const",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "knob": {
                        "type": "string"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "knob",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "expr": {
                        "type": "string"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "expr",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "model": {
                        "type": "string"
                      },
                      "knobs": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "model",
                      "knobs",
                      "unit"
                    ]
                  }
                ]
              },
              "lateness": {
                "anyOf": [
                  {
                    "type": "object",
                    "properties": {
                      "const": {
                        "type": "number"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "const",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "knob": {
                        "type": "string"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "knob",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "expr": {
                        "type": "string"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "expr",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "model": {
                        "type": "string"
                      },
                      "knobs": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "model",
                      "knobs",
                      "unit"
                    ]
                  }
                ]
              },
              "early": {
                "anyOf": [
                  {
                    "type": "object",
                    "properties": {
                      "const": {
                        "type": "number"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "const",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "knob": {
                        "type": "string"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "knob",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "expr": {
                        "type": "string"
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "expr",
                      "unit"
                    ]
                  },
                  {
                    "type": "object",
                    "properties": {
                      "model": {
                        "type": "string"
                      },
                      "knobs": {
                        "type": "array",
                        "items": {
                          "type": "string"
                        }
                      },
                      "unit": {
                        "type": "string"
                      }
                    },
                    "required": [
                      "model",
                      "knobs",
                      "unit"
                    ]
                  }
                ]
              }
            }
          },
          "description": "These are the durations that the failure changes, by timer. For example, an ICMP host unreachable for each retransmission reverts the backoff of the retransmission timer."
        }
      },
      "required": [
        "name",
        "passes"
      ]
    },
    "MemcgLevel": {
      "type": "object",
      "properties": {
        "usage": {
          "type": "number"
        },
        "high": {
          "type": "number"
        }
      },
      "required": [
        "usage",
        "high"
      ]
    },
    "MemcgSleepBounds": {
      "type": "object",
      "properties": {
        "first": {
          "type": "number"
        },
        "capped": {
          "type": "number"
        }
      },
      "required": [
        "first",
        "capped"
      ]
    },
    "MemcgThrottle": {
      "type": "object",
      "properties": {
        "over": {
          "type": "number",
          "description": "These are the charges that left the cgroup above its high: each one sends the task to reclaim."
        },
        "sleeps": {
          "type": "number",
          "description": "These are the charges whose debt put the task to sleep."
        },
        "jiffies": {
          "type": "number",
          "description": "This is the sum of the sleeps, in jiffies."
        },
        "late": {
          "type": "number",
          "description": "This is how late the timer wheel can end those sleeps, in jiffies: one granularity of the level of each."
        },
        "high": {
          "type": "number",
          "description": "These are the events `high` of the cgroup of the task: one at each reclaim of a charge, 17 at a charge that sleeps."
        }
      },
      "required": [
        "over",
        "sleeps",
        "jiffies",
        "late",
        "high"
      ]
    },
    "NetemQueue": {
      "type": "object",
      "properties": {
        "latency": {
          "type": "number",
          "description": "This value is the delay of each packet, in nanoseconds, with no jitter."
        },
        "limit": {
          "type": "number",
          "description": "This value is the most packets that the queue of netem holds."
        },
        "rate": {
          "type": "number",
          "description": "This value is the rate in bytes per second."
        },
        "packetOverhead": {
          "type": "number",
          "description": "This value is the overhead that netem adds to each length. It can be negative."
        },
        "cellSize": {
          "type": "number",
          "description": "This value is the size of one cell. With 0, netem counts no cells."
        },
        "cellOverhead": {
          "type": "number",
          "description": "This value is the overhead of each cell. It can be negative."
        }
      },
      "required": [
        "limit",
        "rate"
      ]
    },
    "NetemRate": {
      "type": "object",
      "properties": {
        "rate": {
          "type": "number",
          "description": "This value is the rate in bytes per second."
        },
        "packetOverhead": {
          "type": "number",
          "description": "This value is the overhead that netem adds to each length. It can be negative."
        },
        "cellSize": {
          "type": "number",
          "description": "This value is the size of one cell. With 0, netem counts no cells."
        },
        "cellOverhead": {
          "type": "number",
          "description": "This value is the overhead of each cell. It can be negative."
        }
      },
      "required": [
        "rate"
      ]
    },
    "Node": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "op": {
              "const": "num"
            },
            "n": {
              "$ref": "#/$defs/Rational"
            }
          },
          "required": [
            "op",
            "n"
          ]
        },
        {
          "type": "object",
          "properties": {
            "op": {
              "const": "knob"
            },
            "name": {
              "type": "string"
            }
          },
          "required": [
            "op",
            "name"
          ]
        },
        {
          "type": "object",
          "properties": {
            "op": {
              "enum": [
                "+",
                "-",
                "*",
                "/"
              ]
            },
            "a": {
              "$ref": "#/$defs/Node"
            },
            "b": {
              "$ref": "#/$defs/Node"
            }
          },
          "required": [
            "op",
            "a",
            "b"
          ]
        },
        {
          "type": "object",
          "properties": {
            "op": {
              "const": "neg"
            },
            "a": {
              "$ref": "#/$defs/Node"
            }
          },
          "required": [
            "op",
            "a"
          ]
        },
        {
          "type": "object",
          "properties": {
            "op": {
              "enum": [
                "min",
                "max",
                "floor",
                "ceil",
                "pow"
              ]
            },
            "args": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/Node"
              }
            }
          },
          "required": [
            "op",
            "args"
          ]
        }
      ]
    },
    "OomTask": {
      "type": "object",
      "properties": {
        "rss": {
          "type": "number",
          "description": "This count is the resident pages of the task: its anonymous, file and shared memory pages."
        },
        "swap": {
          "type": "number",
          "description": "This count is the swap entries of the task."
        },
        "pageTables": {
          "type": "number",
          "description": "This count is the bytes of the page tables of the task."
        },
        "adj": {
          "type": "number",
          "description": "This value is the `oom_score_adj` of the task, from −1000 to 1000."
        }
      },
      "required": [
        "rss",
        "swap",
        "pageTables",
        "adj"
      ]
    },
    "Over": {
      "type": "object",
      "properties": {
        "machine": {
          "type": "string",
          "description": "This identifier is the machine below, as a graph identifies its document."
        },
        "states": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "string"
          },
          "description": "This map gives the state of the lower machine that each state of this machine is on."
        },
        "sets": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/Expr"
          },
          "description": "These are the knobs of the lower machine that this machine sets, by their lower names, over its own knobs."
        },
        "ends": {
          "type": "string",
          "description": "This event is the event of this machine that the end of the lower machine arrives as."
        },
        "note": {
          "type": "string"
        }
      },
      "required": [
        "machine",
        "states",
        "sets",
        "ends"
      ]
    },
    "PschedFactor": {
      "type": "object",
      "properties": {
        "mult": {
          "type": "number"
        },
        "shift": {
          "type": "number"
        }
      },
      "required": [
        "mult",
        "shift"
      ]
    },
    "PschedRate": {
      "type": "object",
      "properties": {
        "rate": {
          "type": "number",
          "description": "This value is the rate in bytes per second."
        },
        "overhead": {
          "type": "number",
          "description": "This value is the overhead that the rate adds to each length."
        },
        "mpu": {
          "type": "number",
          "description": "This value is the least length that the rate counts."
        },
        "linklayer": {
          "enum": [
            "ethernet",
            "atm"
          ],
          "description": "An ATM link counts the length in cells of 48 bytes, and each cell takes 53 bytes."
        }
      },
      "required": [
        "rate"
      ]
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
    },
    "Realization": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "timer": {
              "type": "string"
            }
          },
          "required": [
            "timer"
          ]
        },
        {
          "type": "object",
          "properties": {
            "duration": {
              "$ref": "#/$defs/Expr"
            },
            "lateness": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "const": {
                      "type": "number"
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "const",
                    "unit"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "knob": {
                      "type": "string"
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "knob",
                    "unit"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "expr": {
                      "type": "string"
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "expr",
                    "unit"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "model": {
                      "type": "string"
                    },
                    "knobs": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "model",
                    "knobs",
                    "unit"
                  ]
                }
              ]
            },
            "early": {
              "anyOf": [
                {
                  "type": "object",
                  "properties": {
                    "const": {
                      "type": "number"
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "const",
                    "unit"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "knob": {
                      "type": "string"
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "knob",
                    "unit"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "expr": {
                      "type": "string"
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "expr",
                    "unit"
                  ]
                },
                {
                  "type": "object",
                  "properties": {
                    "model": {
                      "type": "string"
                    },
                    "knobs": {
                      "type": "array",
                      "items": {
                        "type": "string"
                      }
                    },
                    "unit": {
                      "type": "string"
                    }
                  },
                  "required": [
                    "model",
                    "knobs",
                    "unit"
                  ]
                }
              ]
            },
            "note": {
              "type": "string"
            }
          },
          "required": [
            "duration"
          ]
        }
      ]
    },
    "Recovery": {
      "type": "object",
      "properties": {
        "firings": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Firing"
          },
          "description": "These are its firings from its arming, up to the first one that surely comes after the end of the stall."
        },
        "first": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "These are the firings that can be the first after the end of the stall. There is more than one when the end falls in the bounds of a firing: that firing can come before the end or after it."
        },
        "low": {
          "$ref": "#/$defs/Quantity",
          "description": "This time is the earliest time of the first firing after the end of the stall, from the arming."
        },
        "high": {
          "$ref": "#/$defs/Quantity",
          "description": "This time is the latest time of that firing, from the arming."
        }
      },
      "required": [
        "firings",
        "first",
        "low",
        "high"
      ]
    },
    "ReplayOptions": {
      "type": "object",
      "properties": {
        "machine": {
          "type": "string",
          "description": "Only the transitions of this machine replay. Without it, each transition of the trace replays."
        }
      }
    },
    "Replayable": {
      "type": "object",
      "properties": {
        "states": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {
              "initial": {
                "type": "boolean"
              },
              "final": {
                "type": "boolean"
              },
              "pseudo": {
                "type": "boolean"
              },
              "note": {
                "type": "string"
              }
            }
          }
        },
        "id": {
          "type": "string"
        },
        "transitions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/TransitionDef"
          }
        }
      },
      "required": [
        "states",
        "id",
        "transitions"
      ]
    },
    "ScheduleOptions": {
      "type": "object",
      "properties": {
        "from": {
          "type": "number",
          "description": "This count is the first wait of the schedule. The default is 0, the wait from the arming."
        },
        "count": {
          "type": "number",
          "description": "This count is the most firings to give."
        },
        "until": {
          "anyOf": [
            {
              "$ref": "#/$defs/Quantity"
            },
            {
              "$ref": "#/$defs/Unbounded"
            }
          ],
          "description": "This time stops the schedule: the schedule keeps no firing after it."
        },
        "reach": {
          "anyOf": [
            {
              "$ref": "#/$defs/Quantity"
            },
            {
              "$ref": "#/$defs/Unbounded"
            }
          ],
          "description": "This time stops the schedule after the first firing at it or after it. That firing is in the schedule."
        }
      }
    },
    "Scheduled": {
      "type": "object",
      "properties": {
        "fired": {
          "type": "number",
          "description": "This count is the wait that ends in this firing: the wait after `fired` firings."
        },
        "at": {
          "$ref": "#/$defs/Quantity",
          "description": "This time is the sum of the waits to this firing, from the first wait of the schedule, in seconds."
        }
      },
      "required": [
        "fired",
        "at"
      ]
    },
    "Situation": {
      "type": "object",
      "properties": {
        "state": {
          "type": "string",
          "description": "This name is the state of the machine, for example ESTABLISHED."
        },
        "inFlight": {
          "type": "boolean",
          "description": "This flag tells if it had sent data that the peer had not acknowledged."
        }
      },
      "required": [
        "state",
        "inFlight"
      ]
    },
    "TbfBuckets": {
      "type": "object",
      "properties": {
        "buffer": {
          "type": "number",
          "description": "This value is the depth of the bucket of the rate, in nanoseconds."
        },
        "mtu": {
          "type": "number",
          "description": "This value is the depth of the bucket of the peak rate, in nanoseconds, or 0 with no peak rate."
        },
        "maxSize": {
          "type": "number",
          "description": "This value is the largest qdisc length that tbf takes, in bytes."
        }
      },
      "required": [
        "buffer",
        "mtu",
        "maxSize"
      ]
    },
    "TbfPeak": {
      "type": "object",
      "properties": {
        "burst": {
          "type": "number",
          "description": "This value is the depth of the bucket of the peak rate, in bytes (`TCA_TBF_PBURST`)."
        },
        "rate": {
          "type": "number",
          "description": "This value is the rate in bytes per second."
        },
        "overhead": {
          "type": "number",
          "description": "This value is the overhead that the rate adds to each length."
        },
        "mpu": {
          "type": "number",
          "description": "This value is the least length that the rate counts."
        },
        "linklayer": {
          "enum": [
            "ethernet",
            "atm"
          ],
          "description": "An ATM link counts the length in cells of 48 bytes, and each cell takes 53 bytes."
        }
      },
      "required": [
        "burst",
        "rate"
      ]
    },
    "TbfQueue": {
      "type": "object",
      "properties": {
        "rate": {
          "$ref": "#/$defs/PschedRate"
        },
        "burst": {
          "type": "number"
        },
        "limit": {
          "type": "number"
        },
        "peak": {
          "$ref": "#/$defs/TbfPeak"
        }
      },
      "required": [
        "rate",
        "burst",
        "limit"
      ]
    },
    "Timer": {
      "type": "object",
      "properties": {
        "duration": {
          "$ref": "#/$defs/Expr"
        },
        "lateness": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "const": {
                  "type": "number"
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "const",
                "unit"
              ]
            },
            {
              "type": "object",
              "properties": {
                "knob": {
                  "type": "string"
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "knob",
                "unit"
              ]
            },
            {
              "type": "object",
              "properties": {
                "expr": {
                  "type": "string"
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "expr",
                "unit"
              ]
            },
            {
              "type": "object",
              "properties": {
                "model": {
                  "type": "string"
                },
                "knobs": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "model",
                "knobs",
                "unit"
              ]
            }
          ]
        },
        "early": {
          "anyOf": [
            {
              "type": "object",
              "properties": {
                "const": {
                  "type": "number"
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "const",
                "unit"
              ]
            },
            {
              "type": "object",
              "properties": {
                "knob": {
                  "type": "string"
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "knob",
                "unit"
              ]
            },
            {
              "type": "object",
              "properties": {
                "expr": {
                  "type": "string"
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "expr",
                "unit"
              ]
            },
            {
              "type": "object",
              "properties": {
                "model": {
                  "type": "string"
                },
                "knobs": {
                  "type": "array",
                  "items": {
                    "type": "string"
                  }
                },
                "unit": {
                  "type": "string"
                }
              },
              "required": [
                "model",
                "knobs",
                "unit"
              ]
            }
          ]
        },
        "arms": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "cancels": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "fires": {
          "type": "string"
        },
        "backoff": {
          "type": "object",
          "properties": {
            "resets": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          "required": [
            "resets"
          ],
          "description": "A backoff timer starts again after it fires, and no wait is shorter than the wait before it. Examples are the retransmission timer of the kernel, its SYN timer and the reconnect of a driver. Its duration, lateness and early bound are those of one wait. They can read `fired`: the number of times that it fired after the last of its `resets`."
        },
        "note": {
          "type": "string"
        }
      },
      "required": [
        "duration",
        "arms",
        "fires"
      ]
    },
    "TimerBounds": {
      "type": "object",
      "properties": {
        "duration": {
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
        "lateness": {
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
        "early": {
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
        }
      },
      "required": [
        "duration"
      ]
    },
    "Transition": {
      "type": "object",
      "properties": {
        "machine": {
          "type": "string",
          "description": "This name identifies the machine that reported. Each program names its own machines."
        },
        "instance": {
          "type": "string",
          "description": "This name identifies one machine among others of its kind: a connection, a check."
        },
        "from": {
          "type": "string"
        },
        "on": {
          "type": "string"
        },
        "to": {
          "type": "string"
        },
        "at": {
          "type": "number",
          "description": "This time is when the transition occurred, in milliseconds. The replay does not read it."
        }
      },
      "required": [
        "instance",
        "from",
        "on",
        "to"
      ]
    },
    "TransitionDef": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "from": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          ]
        },
        "to": {
          "type": "string"
        },
        "on": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          ]
        },
        "guard": {
          "type": "string"
        },
        "timer": {
          "type": "string"
        },
        "emits": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "errno": {
          "type": "string"
        },
        "note": {
          "type": "string"
        },
        "source": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "from",
        "to",
        "on"
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
    },
    "Vantage": {
      "enum": [
        "wire",
        "kernel",
        "middlebox",
        "proxy",
        "driver",
        "server",
        "canary",
        "injector",
        "self"
      ]
    }
  },
  "procedures": [
    {
      "name": "acceptQueueHeld",
      "path": [
        "algebra",
        "acceptQueueHeld"
      ],
      "description": "This function gives the connections that a full accept queue holds: its limit plus one.",
      "params": [
        "backlog",
        "somaxconn"
      ],
      "input": {
        "type": "object",
        "properties": {
          "backlog": {
            "type": "number"
          },
          "somaxconn": {
            "type": "number"
          }
        },
        "required": [
          "backlog",
          "somaxconn"
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
      "name": "acceptQueueLimit",
      "path": [
        "algebra",
        "acceptQueueLimit"
      ],
      "description": "This function gives the limit of the accept queue: the backlog of listen(2), clamped to `somaxconn`.",
      "params": [
        "backlog",
        "somaxconn"
      ],
      "input": {
        "type": "object",
        "properties": {
          "backlog": {
            "type": "number"
          },
          "somaxconn": {
            "type": "number"
          }
        },
        "required": [
          "backlog",
          "somaxconn"
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
      "name": "algebraProblems",
      "path": [
        "algebra",
        "algebraProblems"
      ],
      "description": "This function gives what in a document the algebra cannot read: arithmetic that does not parse, or a model that it does not have.",
      "params": [
        "doc"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          }
        },
        "required": [
          "doc"
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
      "name": "arr",
      "path": [
        "algebra",
        "arr"
      ],
      "description": "This function gives one value or many values as an array.",
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
      "name": "conntrackFloor",
      "path": [
        "algebra",
        "conntrackFloor"
      ],
      "description": "This function gives the lowest count of one network namespace after one scan of the conntrack collector under pressure. Each entry of the table can go at that scan. The sources are Linux v7.0, `net/netfilter/nf_conntrack_core.c`.",
      "params": [
        "max",
        "hz",
        "expired"
      ],
      "input": {
        "type": "object",
        "properties": {
          "max": {
            "type": "number"
          },
          "hz": {
            "type": "number"
          },
          "expired": {
            "type": "number"
          }
        },
        "required": [
          "max",
          "hz"
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
      "name": "detection",
      "path": [
        "algebra",
        "detection"
      ],
      "description": "This function gives the detection: the minimum over the detectors that are live in the situation. The entry to the state arms a timer, and so does what the failure causes: data in flight without an acknowledgment gets a retransmission. An event that occurs cancels a timer.",
      "params": [
        "doc",
        "situation",
        "manifestation",
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "situation": {
            "$ref": "#/$defs/Situation"
          },
          "manifestation": {
            "$ref": "#/$defs/Manifestation"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          }
        },
        "required": [
          "doc",
          "situation",
          "manifestation",
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Detection"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "errnoOf",
      "path": [
        "algebra",
        "errnoOf"
      ],
      "description": "This function gives the errno of a detection by a timer: the errno of the transition that its event takes from the state. A soft error of the manifestation replaces ETIMEDOUT, but only for the timers whose segments its ICMP quotes in the window.",
      "params": [
        "doc",
        "state",
        "detector",
        "manifestation"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "state": {
            "type": "string"
          },
          "detector": {
            "type": "object",
            "properties": {
              "timer": {
                "type": "string"
              },
              "fires": {
                "type": "string"
              }
            },
            "required": [
              "timer",
              "fires"
            ]
          },
          "manifestation": {
            "$ref": "#/$defs/Manifestation"
          }
        },
        "required": [
          "doc",
          "state",
          "detector",
          "manifestation"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "type": "null"
          },
          {
            "type": "string"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "evaluate",
      "path": [
        "algebra",
        "evaluate"
      ],
      "description": "This function evaluates one duration of a timer of a machine, in the unit that its document gives it. The waits of a backoff timer read `fired`, which tells which wait.",
      "params": [
        "doc",
        "expr",
        "values",
        "fired"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "expr": {
            "$ref": "#/$defs/Expr"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          },
          "fired": {
            "type": "number"
          }
        },
        "required": [
          "doc",
          "expr",
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
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
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "exprKnobs",
      "path": [
        "algebra",
        "exprKnobs"
      ],
      "description": "This function gives the knobs that a duration reads, by the names of the machine for them.",
      "params": [
        "e"
      ],
      "input": {
        "type": "object",
        "properties": {
          "e": {
            "$ref": "#/$defs/Expr"
          }
        },
        "required": [
          "e"
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
      "name": "fifoDefaultLimit",
      "path": [
        "algebra",
        "fifoDefaultLimit"
      ],
      "description": "This function gives the limit of a pfifo or a bfifo with no limit of its own (`net/sched/sch_fifo.c`, lines 106-112). A pfifo holds `txqueuelen` packets. A bfifo holds `txqueuelen` times the MTU plus the link header, in bytes (`psched_mtu`, `include/net/pkt_sched.h`, lines 131-134). A pfifo drops a packet when it holds its limit. A bfifo drops a packet that puts its bytes above its limit (lines 19-36).",
      "params": [
        "kind",
        "txQueueLen",
        "mtu",
        "hardHeaderLen"
      ],
      "input": {
        "type": "object",
        "properties": {
          "kind": {
            "enum": [
              "pfifo",
              "bfifo"
            ]
          },
          "txQueueLen": {
            "type": "number"
          },
          "mtu": {
            "type": "number"
          },
          "hardHeaderLen": {
            "type": "number"
          }
        },
        "required": [
          "kind",
          "txQueueLen",
          "mtu"
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
      "name": "firings",
      "path": [
        "algebra",
        "firings"
      ],
      "description": "This function gives the firings of a backoff timer on a timeline: the sum of its waits, exactly, from the wait `from`. It stops at the first wait that is not a known amount, or at a stop of the options, or after 4096 firings. Each time is the duration of the waits, without how early or late each can fire.",
      "params": [
        "doc",
        "timer",
        "values",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "timer": {
            "type": "string"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          },
          "options": {
            "$ref": "#/$defs/ScheduleOptions"
          }
        },
        "required": [
          "doc",
          "timer",
          "values",
          "options"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/Scheduled"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fromStates",
      "path": [
        "algebra",
        "fromStates"
      ],
      "description": "This function gives the states that a transition leaves. The state \"*\" is each state that is not final.",
      "params": [
        "m",
        "from"
      ],
      "input": {
        "type": "object",
        "properties": {
          "m": {
            "type": "object",
            "properties": {
              "states": {
                "type": "object",
                "properties": {},
                "additionalProperties": {
                  "type": "object",
                  "properties": {
                    "initial": {
                      "type": "boolean"
                    },
                    "final": {
                      "type": "boolean"
                    },
                    "pseudo": {
                      "type": "boolean"
                    },
                    "note": {
                      "type": "string"
                    }
                  }
                }
              }
            },
            "required": [
              "states"
            ]
          },
          "from": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "array",
                "items": {
                  "type": "string"
                }
              }
            ]
          }
        },
        "required": [
          "m",
          "from"
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
      "name": "gsoQdiscLength",
      "path": [
        "algebra",
        "gsoQdiscLength"
      ],
      "description": "This function gives the qdisc length of a GSO packet of `length` bytes in `segments` segments. Each segment after the first adds `headers` bytes: the link, network and transport headers of one segment (`net/core/dev.c`, lines 4119-4158).",
      "params": [
        "length",
        "segments",
        "headers"
      ],
      "input": {
        "type": "object",
        "properties": {
          "length": {
            "type": "number"
          },
          "segments": {
            "type": "number"
          },
          "headers": {
            "type": "number"
          }
        },
        "required": [
          "length",
          "segments",
          "headers"
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
      "name": "machineProblems",
      "path": [
        "algebra",
        "machineProblems"
      ],
      "description": "This function gives the problems in the consistency of a document. Each state, event, timer and knob that it refers to must exist, and it must have an initial state. A reader refuses a machine with problems, and does not draw half of it.",
      "params": [
        "m"
      ],
      "input": {
        "type": "object",
        "properties": {
          "m": {
            "$ref": "#/$defs/Machine"
          }
        },
        "required": [
          "m"
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
      "name": "memcgHighDelay",
      "path": [
        "algebra",
        "memcgHighDelay"
      ],
      "description": "This function gives the delay of a debt of `debt` pages, in jiffies, before the cap and the skip. It is the delay of the largest overage of memory plus the delay of the largest overage of swap. The table in the comment of the source gives this delay (lines 2145-2171): 6 ms at 1% over a high of 100 MiB.",
      "params": [
        "memory",
        "debt",
        "hz",
        "swap"
      ],
      "input": {
        "type": "object",
        "properties": {
          "memory": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/MemcgLevel"
            }
          },
          "debt": {
            "type": "number"
          },
          "hz": {
            "type": "number"
          },
          "swap": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/MemcgLevel"
            }
          }
        },
        "required": [
          "memory",
          "debt",
          "hz"
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
      "name": "memcgHighSleep",
      "path": [
        "algebra",
        "memcgHighSleep"
      ],
      "description": "This function gives the jiffies that a task sleeps when it pays a debt of `debt` pages. The sleep is the delay of `memcgHighDelay` with the cap of 2 s. A delay of 10 ms or less gives no sleep. `memory` is the cgroup of the task, then each ancestor below the root. `swap` gives the same for `memory.swap.high`.",
      "params": [
        "memory",
        "debt",
        "hz",
        "swap"
      ],
      "input": {
        "type": "object",
        "properties": {
          "memory": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/MemcgLevel"
            }
          },
          "debt": {
            "type": "number"
          },
          "hz": {
            "type": "number"
          },
          "swap": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/MemcgLevel"
            }
          }
        },
        "required": [
          "memory",
          "debt",
          "hz"
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
      "name": "memcgSleepBounds",
      "path": [
        "algebra",
        "memcgSleepBounds"
      ],
      "description": "This function gives two usages above `high` for a debt of `debt` pages. The first is the lowest usage that gives a sleep. The second is the lowest usage whose sleep is the cap of 2 s. The sleep does not go down as the usage goes up, thus a search finds each bound. Take a high of 25,600 pages (100 MiB), HZ 1000 and a debt of 64. The sleep starts at 25,936 pages (1.3% over), and the cap starts at 30,126 (17.7% over).",
      "params": [
        "high",
        "debt",
        "hz"
      ],
      "input": {
        "type": "object",
        "properties": {
          "high": {
            "type": "number"
          },
          "debt": {
            "type": "number"
          },
          "hz": {
            "type": "number"
          }
        },
        "required": [
          "high",
          "debt",
          "hz"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/MemcgSleepBounds"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "memcgThrottle",
      "path": [
        "algebra",
        "memcgThrottle"
      ],
      "description": "This function gives the throttle of a task that grows by `charges` charges of `batch` pages each. It starts from the usage of each level in `levels`: the cgroup of the task, then each ancestor below the root. Each charge adds `batch` pages to each level, and the task pays its debt of `batch` pages before the next charge. A task that touches one page at a time charges a batch of 64 at each 64th page.",
      "params": [
        "levels",
        "charges",
        "hz",
        "batch"
      ],
      "input": {
        "type": "object",
        "properties": {
          "levels": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/MemcgLevel"
            }
          },
          "charges": {
            "type": "number"
          },
          "hz": {
            "type": "number"
          },
          "batch": {
            "type": "number"
          }
        },
        "required": [
          "levels",
          "charges",
          "hz"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/MemcgThrottle"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "modelSource",
      "path": [
        "algebra",
        "modelSource"
      ],
      "description": "This function gives the source of the formula of a named model, for a reader of a result.",
      "params": [
        "name"
      ],
      "input": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          }
        },
        "required": [
          "name"
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
      "name": "netemPacketTime",
      "path": [
        "algebra",
        "netemPacketTime"
      ],
      "description": "This function gives the time that netem gives a packet of `length` bytes at its rate, in nanoseconds (`packet_time_ns`, lines 357-370). It rounds down. A packet of 1,514 bytes at 10 Mbit/s (1,250,000 bytes per second) takes 1,211,200 ns.",
      "params": [
        "length",
        "rate"
      ],
      "input": {
        "type": "object",
        "properties": {
          "length": {
            "type": "number"
          },
          "rate": {
            "$ref": "#/$defs/NetemRate"
          }
        },
        "required": [
          "length",
          "rate"
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
      "name": "netemSchedule",
      "path": [
        "algebra",
        "netemSchedule"
      ],
      "description": "This function gives the outcome of each packet in a netem queue with a rate. A packet that the queue takes leaves at `max(last, at + latency) + time`. `last` is the time to send of the packet before it, and `time` is the time of `netemPacketTime`. The queue holds each packet until it leaves, thus a delay of 100 ms at 1,000 packets per second fills a limit of 100.",
      "params": [
        "packets",
        "queue"
      ],
      "input": {
        "type": "object",
        "properties": {
          "packets": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/EgressPacket"
            }
          },
          "queue": {
            "$ref": "#/$defs/NetemQueue"
          }
        },
        "required": [
          "packets",
          "queue"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/EgressOutcome"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "oomBadness",
      "path": [
        "algebra",
        "oomBadness"
      ],
      "description": "This function gives the points of a task for the OOM killer. The points are its resident pages, its swap entries and the pages of its page tables. To this sum, the kernel adds `oom_score_adj` times `totalPages / 1000`, in integer arithmetic. A task at −1000 gives undefined, because the OOM killer does not take it.",
      "params": [
        "task",
        "totalPages",
        "pageSize"
      ],
      "input": {
        "type": "object",
        "properties": {
          "task": {
            "$ref": "#/$defs/OomTask"
          },
          "totalPages": {
            "type": "number"
          },
          "pageSize": {
            "type": "number"
          }
        },
        "required": [
          "task",
          "totalPages"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "type": "number"
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
      "name": "oomVictim",
      "path": [
        "algebra",
        "oomVictim"
      ],
      "description": "This function gives the index of the task that the OOM killer of a cgroup takes: the task with the most points. Of tasks with equal points, the last one in the order of the scan wins (`mm/oom_kill.c`, lines 342-351). A task replaces the choice unless its points are less. It gives undefined when the OOM killer can take no task.",
      "params": [
        "tasks",
        "totalPages",
        "pageSize"
      ],
      "input": {
        "type": "object",
        "properties": {
          "tasks": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/OomTask"
            }
          },
          "totalPages": {
            "type": "number"
          },
          "pageSize": {
            "type": "number"
          }
        },
        "required": [
          "tasks",
          "totalPages"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "type": "number"
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
      "name": "parseExpr",
      "path": [
        "algebra",
        "parseExpr"
      ],
      "description": "This function parses the arithmetic of a document, or it throws an error that tells where the text stops making sense.",
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
        "$ref": "#/$defs/Node"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "portSearchChain",
      "path": [
        "algebra",
        "portSearchChain"
      ],
      "description": "This function gives the exact chain of the search: the share of each count of connects to one destination, over `rounds` rounds. Each round closes its connections with a reset, and the next round starts where the last connect of the round before put the start. The first round starts at each even offset with the same chance.",
      "params": [
        "size",
        "rounds"
      ],
      "input": {
        "type": "object",
        "properties": {
          "size": {
            "type": "number"
          },
          "rounds": {
            "type": "number"
          }
        },
        "required": [
          "size"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
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
        },
        "x-procedures-codec": "map"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "portSearchShares",
      "path": [
        "algebra",
        "portSearchShares"
      ],
      "description": "This function gives the law of the search: the share of each count of connects to one destination before `EADDRNOTAVAIL`, over `rounds` rounds. An even range, and a range of one port, give their size in each round: the two passes reach each port. An odd range gives its size or one less, from the exact chain, up to `PORT_SEARCH_CHAIN_LARGEST` ports.",
      "params": [
        "size",
        "rounds"
      ],
      "input": {
        "type": "object",
        "properties": {
          "size": {
            "type": "number"
          },
          "rounds": {
            "type": "number"
          }
        },
        "required": [
          "size"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
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
        },
        "x-procedures-codec": "map"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "portSearchSpan",
      "path": [
        "algebra",
        "portSearchSpan"
      ],
      "description": "This function gives the size that the search reads: the size of the range, rounded down to an even number.",
      "params": [
        "size"
      ],
      "input": {
        "type": "object",
        "properties": {
          "size": {
            "type": "number"
          }
        },
        "required": [
          "size"
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
      "name": "probeTrain",
      "path": [
        "algebra",
        "probeTrain"
      ],
      "description": "This function gives the times of a train of probes, exactly, in seconds. The first probe is at `first`, and each next probe is one `interval` later, `count` probes in all. A first time without an end gives no probe. An interval without an end gives only the first probe. Keepalive at its defaults sends its probes at 7200 s, 7275 s, and so on to 7800 s.",
      "params": [
        "first",
        "interval",
        "count"
      ],
      "input": {
        "type": "object",
        "properties": {
          "first": {
            "$ref": "#/$defs/Extent"
          },
          "interval": {
            "$ref": "#/$defs/Extent"
          },
          "count": {
            "type": "number"
          }
        },
        "required": [
          "first",
          "interval",
          "count"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/Quantity"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "pschedFactor",
      "path": [
        "algebra",
        "pschedFactor"
      ],
      "description": "This function gives the factor of a rate in bytes per second (`psched_ratecfg_precompute__`). The kernel doubles a factor of 10^9 until the quotient by the rate fills 32 bits. At 125,000 bytes per second, `mult` is 4,194,304,000 and `shift` is 19.",
      "params": [
        "rate"
      ],
      "input": {
        "type": "object",
        "properties": {
          "rate": {
            "type": "number"
          }
        },
        "required": [
          "rate"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/PschedFactor"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "pschedLengthTime",
      "path": [
        "algebra",
        "pschedLengthTime"
      ],
      "description": "This function gives the time of `length` bytes at a rate of the packet scheduler, in nanoseconds (`psched_l2t_ns`). The kernel multiplies by its factor and does not divide. Thus a time can be 1 ns short: 1,500 bytes at 3,000,000 bytes per second give 499,999 ns, not 500,000.",
      "params": [
        "length",
        "rate"
      ],
      "input": {
        "type": "object",
        "properties": {
          "length": {
            "type": "number"
          },
          "rate": {
            "$ref": "#/$defs/PschedRate"
          }
        },
        "required": [
          "length",
          "rate"
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
      "name": "readsFired",
      "path": [
        "algebra",
        "readsFired"
      ],
      "description": "This function tells if a duration reads the number of times that its timer fired, as the waits of a backoff do.",
      "params": [
        "e"
      ],
      "input": {
        "type": "object",
        "properties": {
          "e": {
            "$ref": "#/$defs/Expr"
          }
        },
        "required": [
          "e"
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
      "name": "realizationKnobs",
      "path": [
        "algebra",
        "realizationKnobs"
      ],
      "description": "This function gives the knobs that a realization reads, by the names of the machine for them.",
      "params": [
        "doc",
        "mechanism"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "mechanism": {
            "type": "string"
          }
        },
        "required": [
          "doc",
          "mechanism"
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
      "name": "realizationOf",
      "path": [
        "algebra",
        "realizationOf"
      ],
      "description": "This function gives how long a mechanism takes where a machine operates, from the realization of its document. The realization is one of its timers, whole, or its own duration, lateness and early bound over the knobs of the machine. It gives undefined when the document does not realize the mechanism.",
      "params": [
        "doc",
        "mechanism",
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "mechanism": {
            "type": "string"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          }
        },
        "required": [
          "doc",
          "mechanism",
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/TimerBounds"
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
      "name": "recovery",
      "path": [
        "algebra",
        "recovery"
      ],
      "description": "This function gives the recovery from a stall. A backoff timer continues to fire through a stall, and what each firing sends gets through only after the stall ends. Thus the connection moves again at the first firing at the end or after it. That firing can be most of a wait after the end. A stall that stops immediately after one firing costs almost all of the next, longer wait.",
      "params": [
        "doc",
        "timer",
        "values",
        "stall"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "timer": {
            "type": "string"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          },
          "stall": {
            "$ref": "#/$defs/Extent"
          }
        },
        "required": [
          "doc",
          "timer",
          "values",
          "stall"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/Unknown"
          },
          {
            "$ref": "#/$defs/Recovery"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "replay",
      "path": [
        "algebra",
        "replay"
      ],
      "description": "This function replays a trace against a machine document, and it gives each disagreement: - Each instance starts in the state that its first transition leaves. - Each transition must leave the state where the replay of its instance is, and that state must be in the document. - The document must have a transition from that state, on that event, to that state. The state \"*\" is each state that is not final.",
      "params": [
        "doc",
        "transitions",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Replayable"
          },
          "transitions": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Transition"
            }
          },
          "options": {
            "$ref": "#/$defs/ReplayOptions"
          }
        },
        "required": [
          "doc",
          "transitions"
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
      "name": "stackedDetection",
      "path": [
        "algebra",
        "stackedDetection"
      ],
      "description": "This function gives the detection through the machine that a machine operates on. The detectors of the lower machine are live in the state below the state of this machine. They use the knobs that this machine sets.",
      "params": [
        "upper",
        "lower",
        "situation",
        "manifestation",
        "upperValues",
        "lowerValues"
      ],
      "input": {
        "type": "object",
        "properties": {
          "upper": {
            "$ref": "#/$defs/Machine"
          },
          "lower": {
            "$ref": "#/$defs/Machine"
          },
          "situation": {
            "$ref": "#/$defs/Situation"
          },
          "manifestation": {
            "$ref": "#/$defs/Manifestation"
          },
          "upperValues": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          },
          "lowerValues": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          }
        },
        "required": [
          "upper",
          "lower",
          "situation",
          "manifestation",
          "upperValues",
          "lowerValues"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Detection"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "synGiveUpSends",
      "path": [
        "algebra",
        "synGiveUpSends"
      ],
      "description": "This function gives the SYNs that a connect sends before it gives up: the first SYN and each retransmission (`synGiveUpWaits`). A connect whose SYN does not leave adds each of them to the field `drop` of conntrack, and each retransmission to `TCPRetransFail`.",
      "params": [
        "retries",
        "linear"
      ],
      "input": {
        "type": "object",
        "properties": {
          "retries": {
            "type": "number"
          },
          "linear": {
            "type": "number"
          }
        },
        "required": [
          "retries",
          "linear"
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
      "name": "tbfBuckets",
      "path": [
        "algebra",
        "tbfBuckets"
      ],
      "description": "This function gives the depths of the buckets of a tbf qdisc and its largest packet.",
      "params": [
        "queue"
      ],
      "input": {
        "type": "object",
        "properties": {
          "queue": {
            "$ref": "#/$defs/TbfQueue"
          }
        },
        "required": [
          "queue"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/TbfBuckets"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "tbfSchedule",
      "path": [
        "algebra",
        "tbfSchedule"
      ],
      "description": "This function gives the outcome of each packet in a tbf qdisc. The buckets are full at the first arrival. A packet leaves at the first time after its arrival and after the packet before it, when the tokens of each bucket cover its time. After it leaves, each bucket loses its time. A bucket gains one token for each nanosecond, up to its depth.",
      "params": [
        "packets",
        "queue"
      ],
      "input": {
        "type": "object",
        "properties": {
          "packets": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/EgressPacket"
            }
          },
          "queue": {
            "$ref": "#/$defs/TbfQueue"
          }
        },
        "required": [
          "packets",
          "queue"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/EgressOutcome"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "timerBand",
      "path": [
        "algebra",
        "timerBand"
      ],
      "description": "This function gives the band of a timer from its bounds, exactly, in `unit`. The band goes from its duration less its early bound to its duration plus its lateness. A bound that the document does not give is zero. A duration without an end gives a band without an end. A keepalive of 11 s, 4 ms early and 352 ms late, gives 10.996 s to 11.352 s.",
      "params": [
        "bounds",
        "unit"
      ],
      "input": {
        "type": "object",
        "properties": {
          "bounds": {
            "$ref": "#/$defs/TimerBounds"
          },
          "unit": {
            "type": "string"
          }
        },
        "required": [
          "bounds"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/Unknown"
          },
          {
            "$ref": "#/$defs/Band"
          }
        ]
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "timerOf",
      "path": [
        "algebra",
        "timerOf"
      ],
      "description": "This function gives the bounds of a timer of a machine: how long it operates, how late it can fire, how early. For a backoff timer, it gives one of its waits: the wait after `fired` firings.",
      "params": [
        "doc",
        "timer",
        "values",
        "fired"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "timer": {
            "type": "string"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          },
          "fired": {
            "type": "number"
          }
        },
        "required": [
          "doc",
          "timer",
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/TimerBounds"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "timerUnder",
      "path": [
        "algebra",
        "timerUnder"
      ],
      "description": "This function gives the bounds of a timer of a machine under a failure: its own bounds, with each duration that the manifestation replaces.",
      "params": [
        "doc",
        "timer",
        "values",
        "manifestation",
        "fired"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "timer": {
            "type": "string"
          },
          "values": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function KnobValues. It reads each parameter as {\"$ref\": \"<name>\"}: name.",
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
                "name"
              ],
              "inputs": [
                {
                  "type": "string"
                }
              ],
              "output": {
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
              "undefinedForNull": true
            }
          },
          "manifestation": {
            "$ref": "#/$defs/Manifestation"
          },
          "fired": {
            "type": "number"
          }
        },
        "required": [
          "doc",
          "timer",
          "values",
          "manifestation"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/TimerBounds"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "transitionOn",
      "path": [
        "algebra",
        "transitionOn"
      ],
      "description": "This function gives the transition that a machine takes from a state on an event, by its document.",
      "params": [
        "doc",
        "state",
        "event"
      ],
      "input": {
        "type": "object",
        "properties": {
          "doc": {
            "$ref": "#/$defs/Machine"
          },
          "state": {
            "type": "string"
          },
          "event": {
            "type": "string"
          }
        },
        "required": [
          "doc",
          "state",
          "event"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/TransitionDef"
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
      "name": "udpFrameLength",
      "path": [
        "algebra",
        "udpFrameLength"
      ],
      "description": "This function gives the qdisc length of one UDP datagram of `payload` bytes on an Ethernet device or a veth. It adds the Ethernet header of 14 bytes, the IP header and the UDP header of 8 bytes. The IP header is 20 bytes for IPv4 and 40 bytes for IPv6, with no options.",
      "params": [
        "payload",
        "family"
      ],
      "input": {
        "type": "object",
        "properties": {
          "payload": {
            "type": "number"
          },
          "family": {
            "enum": [
              4,
              6
            ]
          }
        },
        "required": [
          "payload"
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
    }
  ],
  "exempt": [
    {
      "name": "overValues",
      "reason": "output-not-json",
      "detail": "KnobValues"
    },
    {
      "name": "runMachine",
      "reason": "input-not-json",
      "detail": "options.clock: an object with the method now"
    }
  ],
  "others": {
    "classes": [],
    "values": 2,
    "types": 38
  }
};
