// The manifest of @mark1russell7/sqlite 0.3.9, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/sqlite",
  "version": "0.3.9",
  "entry": ".",
  "namespace": [
    "sqlite"
  ],
  "$defs": {
    "Checkpointed": {
      "type": "object",
      "properties": {
        "busy": {
          "type": "boolean",
          "description": "This value is true when a different connection stopped the checkpoint before its end."
        },
        "log": {
          "type": "number",
          "description": "This value is the number of pages in the log."
        },
        "checkpointed": {
          "type": "number",
          "description": "This value is the number of pages of the log that the checkpoint copied into the database file."
        }
      },
      "required": [
        "busy",
        "log",
        "checkpointed"
      ]
    },
    "ClearOptions": {
      "type": "object",
      "properties": {
        "vacuum": {
          "type": "boolean",
          "description": "This value makes the file small again after the drop (`VACUUM`). The default is true."
        }
      }
    },
    "Integrity": {
      "type": "object",
      "properties": {
        "ok": {
          "type": "boolean"
        },
        "problems": {
          "type": "array",
          "items": {
            "type": "string"
          }
        }
      },
      "required": [
        "ok",
        "problems"
      ]
    },
    "IntegrityOptions": {
      "type": "object",
      "properties": {
        "quick": {
          "type": "boolean",
          "description": "This value selects `PRAGMA quick_check`. It is faster, but it does not compare the indexes with their tables. The default is `false`."
        },
        "limit": {
          "type": "number",
          "description": "This value is the highest count of problems that the check gives. The default is 100."
        }
      }
    },
    "OpenOptions": {
      "type": "object",
      "properties": {
        "wal": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "const": "when-writable"
            }
          ],
          "description": "This value turns on the write-ahead log (WAL). The default is true. Then readers do not stop a writer. A database with no file keeps its journal in memory."
        },
        "readOnly": {
          "type": "boolean",
          "description": "This value opens the file to read only. The default is false. The file must exist. The open does not change the journal mode, and each write throws. Do not give `wal: true` or `makeFolder: true` with it."
        },
        "synchronous": {
          "enum": [
            "EXTRA",
            "FULL",
            "NORMAL",
            "OFF"
          ],
          "description": "This value is the pragma `synchronous`. The default is `FULL`: a commit is on the disk when the call ends. With WAL, `NORMAL` can lose the last commits at a power cut, and the file stays good."
        },
        "busyTimeoutMs": {
          "type": "number",
          "description": "This value is the time in milliseconds that a statement waits for the lock of a different connection. The default is 0: then the statement fails at once with \"database is locked\"."
        },
        "makeFolder": {
          "type": "boolean",
          "description": "This value makes the folder of the file when the folder is not there. The default is false."
        },
        "folderMode": {
          "type": "number",
          "description": "This value is the mode of the folders that `makeFolder` makes, for example `0o700`."
        }
      }
    },
    "Snapshot": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string"
        },
        "bytes": {
          "type": "number"
        }
      },
      "required": [
        "path",
        "bytes"
      ]
    }
  },
  "procedures": [
    {
      "name": "addMissingColumns",
      "path": [
        "sqlite",
        "addMissingColumns"
      ],
      "description": "This function adds each column that a table does not have, and gives the names of the added columns in their order.",
      "params": [
        "db",
        "table",
        "columns"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "table": {
            "type": "string",
            "description": "The name of the table. The table must exist."
          },
          "columns": {
            "type": "object",
            "properties": {},
            "additionalProperties": {
              "type": "string"
            },
            "description": "The columns that the table must have."
          }
        },
        "required": [
          "db",
          "table",
          "columns"
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
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [
          "fs"
        ],
        "destructive": false,
        "idempotent": true
      },
      "fsRoot": {}
    },
    {
      "name": "checkIntegrity",
      "path": [
        "sqlite",
        "checkIntegrity"
      ],
      "description": "This function does the integrity check of SQLite on a connection. A file that is not a database gives a problem, not an error. A different error, for example a lock that is not free, goes to the caller.",
      "params": [
        "db",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "options": {
            "$ref": "#/$defs/IntegrityOptions",
            "description": "The kind of check and the highest count of problems."
          }
        },
        "required": [
          "db"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Integrity"
      },
      "effects": {
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [],
        "idempotent": true
      },
      "fsRoot": {}
    },
    {
      "name": "checkpoint",
      "path": [
        "sqlite",
        "checkpoint"
      ],
      "description": "This function does a checkpoint of the write-ahead log, and gives its result.",
      "params": [
        "db",
        "mode"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "mode": {
            "enum": [
              "FULL",
              "PASSIVE",
              "RESTART",
              "TRUNCATE"
            ],
            "description": "The mode of `PRAGMA wal_checkpoint`. The default is `PASSIVE`: it does not wait for other connections."
          }
        },
        "required": [
          "db"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Checkpointed"
      },
      "effects": {
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [
          "fs"
        ],
        "destructive": false,
        "idempotent": true
      },
      "fsRoot": {}
    },
    {
      "name": "clearDatabase",
      "path": [
        "sqlite",
        "clearDatabase"
      ],
      "description": "This function drops each view and each table of the database, and sets `user_version` to 0. The indexes and the triggers go with their tables and views. The tables of SQLite itself (`sqlite_*`) stay. Then `migrate` makes each step again.",
      "params": [
        "db",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "options": {
            "$ref": "#/$defs/ClearOptions",
            "description": "The vacuum after the drop."
          }
        },
        "required": [
          "db"
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
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [
          "fs"
        ],
        "destructive": true,
        "idempotent": true
      },
      "fsRoot": {}
    },
    {
      "name": "openDatabase",
      "path": [
        "sqlite",
        "openDatabase"
      ],
      "description": "This function opens a database, and makes the file when it is not there. `:memory:` gives a database with no file. With `readOnly`, the file must exist.",
      "params": [
        "path",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "path": {
            "type": "string",
            "description": "The path of the file, or `:memory:`."
          },
          "options": {
            "$ref": "#/$defs/OpenOptions",
            "description": "The pragmas and the folder."
          }
        },
        "required": [
          "path"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "description": "A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
        "properties": {
          "handle": {
            "type": "string",
            "minLength": 1,
            "description": "The id of the handle. The procedure that opens the object gives it."
          }
        },
        "required": [
          "handle"
        ],
        "additionalProperties": false,
        "x-procedures-handle": "node:sqlite#DatabaseSync"
      },
      "effects": {
        "reads": [
          "fs"
        ],
        "writes": [
          "fs",
          "handles"
        ],
        "destructive": false,
        "idempotent": false
      },
      "fsRoot": {
        "paths": [
          "path"
        ],
        "values": [
          ":memory:"
        ]
      }
    },
    {
      "name": "schemaVersion",
      "path": [
        "sqlite",
        "schemaVersion"
      ],
      "description": "This function gives the schema version of a database. Without a part, it is the `user_version` of the file. With a part, it is the version of that part in the table `schema_versions`, and 0 when the file does not have the part.",
      "params": [
        "db",
        "part"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "part": {
            "type": "string",
            "description": "The name of a part of the file."
          }
        },
        "required": [
          "db"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [],
        "idempotent": true
      },
      "fsRoot": {}
    },
    {
      "name": "snapshot",
      "path": [
        "sqlite",
        "snapshot"
      ],
      "description": "This function writes a copy of an open database to a file with `VACUUM INTO`. The copy is one consistent state, and writers can continue during the copy. The function writes a temporary file first, and then it replaces the file at the path. Thus a reader of the path sees the old copy or the new copy.",
      "params": [
        "db",
        "path"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection of the database. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "path": {
            "type": "string",
            "description": "The path of the copy. A file at the path gets the new copy."
          }
        },
        "required": [
          "db",
          "path"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Snapshot"
      },
      "effects": {
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [
          "fs"
        ],
        "destructive": true,
        "idempotent": true
      },
      "fsRoot": {
        "paths": [
          "path"
        ]
      }
    },
    {
      "name": "tableColumns",
      "path": [
        "sqlite",
        "tableColumns"
      ],
      "description": "This function gives the names of the columns of a table, in the order of the table. A table that does not exist gives an empty list.",
      "params": [
        "db",
        "table"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "The connection. A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          },
          "table": {
            "type": "string",
            "description": "The name of the table."
          }
        },
        "required": [
          "db",
          "table"
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
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [],
        "idempotent": true
      },
      "fsRoot": {}
    },
    {
      "name": "userVersion",
      "path": [
        "sqlite",
        "userVersion"
      ],
      "description": "This function gives the pragma `user_version` of a database.",
      "params": [
        "db"
      ],
      "input": {
        "type": "object",
        "properties": {
          "db": {
            "type": "object",
            "description": "A handle of a node:sqlite#DatabaseSync. The procedure that opens it gives it, and handle.close closes it.",
            "properties": {
              "handle": {
                "type": "string",
                "minLength": 1,
                "description": "The id of the handle. The procedure that opens the object gives it."
              }
            },
            "required": [
              "handle"
            ],
            "additionalProperties": false,
            "x-procedures-handle": "node:sqlite#DatabaseSync"
          }
        },
        "required": [
          "db"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "number"
      },
      "effects": {
        "reads": [
          "fs",
          "handles"
        ],
        "writes": [],
        "idempotent": true
      },
      "fsRoot": {}
    }
  ],
  "exempt": [
    {
      "name": "confineToFile",
      "reason": "function-parameter",
      "detail": "db.setAuthorizer: (callback: ((actionCode: number, arg1: string | null, arg2: string | null, dbName: string | null, triggerOrView: string | null) => number) | null) => void"
    },
    {
      "name": "eachStatement",
      "reason": "input-not-json",
      "detail": "db: an object with the method prepare"
    },
    {
      "name": "ensureProjection",
      "reason": "function-parameter",
      "detail": "schema: (db: D) => void"
    },
    {
      "name": "eventLog",
      "reason": "function-parameter",
      "detail": "options.parse.~standard.validate: (value: unknown) => StandardResult<E> | Promise<StandardResult<E>>"
    },
    {
      "name": "listRecoveries",
      "reason": "output-not-json",
      "detail": "cause.fault.error: Error"
    },
    {
      "name": "migrate",
      "reason": "function-parameter",
      "detail": "migrations: (db: D) => void"
    },
    {
      "name": "openCheckedEventLog",
      "reason": "function-parameter",
      "detail": "parse.~standard.validate: (value: unknown) => StandardResult<E> | Promise<StandardResult<E>>"
    },
    {
      "name": "openEventLog",
      "reason": "function-parameter",
      "detail": "parse.~standard.validate: (value: unknown) => StandardResult<E> | Promise<StandardResult<E>>"
    },
    {
      "name": "openOrQuarantine",
      "reason": "input-not-json",
      "detail": "options.now: Date"
    },
    {
      "name": "quarantine",
      "reason": "input-not-json",
      "detail": "options.now: Date"
    },
    {
      "name": "readTransaction",
      "reason": "function-parameter",
      "detail": "options.onRollbackError: (error: unknown) => void"
    },
    {
      "name": "salvageEventLog",
      "reason": "input-not-json",
      "detail": "target: an object with the method read"
    },
    {
      "name": "sqlJsConnection",
      "reason": "input-not-json",
      "detail": "db: an object with the method exec"
    },
    {
      "name": "sqliteFault",
      "reason": "output-not-json",
      "detail": "error: Error"
    },
    {
      "name": "transaction",
      "reason": "function-parameter",
      "detail": "options.onRollbackError: (error: unknown) => void"
    },
    {
      "name": "wasmConnection",
      "reason": "input-not-json",
      "detail": "sqlite3.capi: an object with the method sqlite3_get_autocommit"
    }
  ],
  "others": {
    "classes": [
      "BrokenLogError",
      "ConfineUnavailableError",
      "IntegrityError",
      "SchemaError"
    ],
    "values": 3,
    "types": 63
  }
};
