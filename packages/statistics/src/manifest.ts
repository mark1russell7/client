// The manifest of @mark1russell7/rigor-statistics 0.1.29, made from its types by `node scripts/wraps.ts generate`. Do not edit it.
import type { ExportsManifest } from "@procedures/compiler";

export const manifest: ExportsManifest = {
  "format": "procedures-exports/1",
  "package": "@mark1russell7/rigor-statistics",
  "version": "0.1.29",
  "entry": ".",
  "namespace": [
    "statistics"
  ],
  "$defs": {
    "BinomialSide": {
      "enum": [
        "greater",
        "less"
      ]
    },
    "BootstrapOptions": {
      "type": "object",
      "properties": {
        "runs": {
          "type": "number",
          "description": "The number of samples. The default is 10 000."
        },
        "level": {
          "type": "number",
          "description": "The level of the interval. The default is 0.95."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The seed of the draws. The default is 1."
        },
        "method": {
          "enum": [
            "higher",
            "linear",
            "nearest-rank"
          ],
          "description": "The quantile method of the two ends of the interval. The default is linear."
        },
        "ends": {
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
          "maxItems": 2,
          "description": "The quantiles of the two ends, in place of `level`, for example [0.025, 0.975] or an interval with one side. The default is from the level: (1 - level) / 2 and 1 - (1 - level) / 2. In floating point, (1 - 0.95) / 2 is not 0.025, so a copy that writes 0.025 needs this option to give the same numbers."
        },
        "against": {
          "type": "number",
          "description": "The value of a claim to test, for example 0 for \"no difference\". With this option, the interval also gives `pAbove` and `pBelow` from the same draws, so the ends do not change. The default is no value and no p."
        }
      }
    },
    "BradleyTerryFit": {
      "type": "object",
      "properties": {
        "strengths": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The log-strength of each item. An item with no comparison has the prior mean."
        },
        "se": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The standard error of each log-strength: the square root of the diagonal of the inverse of the Hessian of the negative log posterior. An item with no comparison has the prior SD."
        },
        "tie": {
          "type": "number",
          "description": "The Davidson tie parameter. It is 0 with the model `\"half\"`, and when no comparison is a tie."
        },
        "logLikelihood": {
          "type": "number",
          "description": "The log-likelihood of the comparisons at the fit, with no prior term."
        },
        "iterations": {
          "type": "number",
          "description": "The number of Newton steps."
        },
        "converged": {
          "type": "boolean",
          "description": "True when the last full Newton step moved no parameter more than the tolerance."
        }
      },
      "required": [
        "strengths",
        "se",
        "tie",
        "logLikelihood",
        "iterations",
        "converged"
      ]
    },
    "BradleyTerryOptions": {
      "type": "object",
      "properties": {
        "priorMean": {
          "type": "number",
          "description": "The mean of the prior of each log-strength. The default is 0."
        },
        "priorSd": {
          "type": "number",
          "description": "The standard deviation of the prior of each log-strength. The default is 1. A smaller value pulls the strengths together."
        },
        "ties": {
          "enum": [
            "davidson",
            "half"
          ],
          "description": "The model of a tie. With `\"davidson\"` (the default), the fit also gives a tie parameter. With `\"half\"`, a tie counts as half a win and half a loss of each item, and the tie parameter is 0."
        },
        "tiePriorSd": {
          "type": "number",
          "description": "The standard deviation of the normal prior of the log of the tie parameter, with mean 0. The default is 10. The prior is weak. It keeps the parameter finite when each comparison is a tie."
        },
        "maxIterations": {
          "type": "number",
          "description": "The largest number of Newton steps. The default is 100."
        },
        "tolerance": {
          "type": "number",
          "description": "The fit stops when the full Newton step moves no parameter more than this value. The default is 1e-10."
        }
      }
    },
    "BradleyTerrySparseFit": {
      "type": "object",
      "properties": {
        "se": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The approximate standard error of each log-strength. For an item in a connected group of `n` items, the variance is `1 / (n * p) + (1 - 1 / n) / h`. Here `p` is the prior precision, and `h` is the diagonal entry of the Hessian. The first term is the variance of the mean of the group, which only the prior sets. An item with no comparison has the prior SD, as in `bradleyTerry`."
        },
        "iterations": {
          "type": "number",
          "description": "The number of MM steps."
        },
        "converged": {
          "type": "boolean",
          "description": "True when `bound` is the tolerance or less, or when the gradient is at the rounding level of floating point. At the rounding level, a step gains nothing, but a weak prior can keep `bound` above the tolerance."
        },
        "bound": {
          "type": "number",
          "description": "An upper bound of the distance of the parameters from the exact optimum: the norm of the gradient over the smallest prior precision. The objective is strongly convex, so this bound holds."
        },
        "pairs": {
          "type": "number",
          "description": "The number of distinct pairs of items with a comparison. The memory of the fit is in proportion to it."
        },
        "strengths": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The log-strength of each item. An item with no comparison has the prior mean."
        },
        "tie": {
          "type": "number",
          "description": "The Davidson tie parameter. It is 0 with the model `\"half\"`, and when no comparison is a tie."
        },
        "logLikelihood": {
          "type": "number",
          "description": "The log-likelihood of the comparisons at the fit, with no prior term."
        }
      },
      "required": [
        "se",
        "iterations",
        "converged",
        "bound",
        "pairs",
        "strengths",
        "tie",
        "logLikelihood"
      ]
    },
    "BradleyTerrySparseOptions": {
      "type": "object",
      "properties": {
        "maxIterations": {
          "type": "number",
          "description": "The largest number of MM steps. The default is 10000."
        },
        "tolerance": {
          "type": "number",
          "description": "The largest distance of the parameters from the exact optimum at the stop. The default is 1e-8. The distance is the Euclidean norm over the log-strengths and the log of the tie parameter."
        },
        "priorMean": {
          "type": "number",
          "description": "The mean of the prior of each log-strength. The default is 0."
        },
        "priorSd": {
          "type": "number",
          "description": "The standard deviation of the prior of each log-strength. The default is 1. A smaller value pulls the strengths together."
        },
        "ties": {
          "enum": [
            "davidson",
            "half"
          ],
          "description": "The model of a tie. With `\"davidson\"` (the default), the fit also gives a tie parameter. With `\"half\"`, a tie counts as half a win and half a loss of each item, and the tie parameter is 0."
        },
        "tiePriorSd": {
          "type": "number",
          "description": "The standard deviation of the normal prior of the log of the tie parameter, with mean 0. The default is 10. The prior is weak. It keeps the parameter finite when each comparison is a tie."
        }
      }
    },
    "CalibrationLevel": {
      "type": "object",
      "properties": {
        "stated": {
          "type": "number"
        },
        "n": {
          "type": "number"
        },
        "hits": {
          "type": "number"
        },
        "rate": {
          "type": "number",
          "description": "hits / n. A calibrated level has a rate near `stated`."
        },
        "interval": {
          "$ref": "#/$defs/Proportion",
          "description": "The Wilson interval of the rate. A level is overconfident when `stated` is above it."
        }
      },
      "required": [
        "stated",
        "n",
        "hits",
        "rate",
        "interval"
      ]
    },
    "CategoricalDimension": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "categorical"
        },
        "levels": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "id": {
          "type": "string",
          "description": "The key of the dimension in the values of a point."
        },
        "label": {
          "type": "string",
          "description": "The name that a view shows."
        },
        "unit": {
          "type": "string",
          "description": "The unit. An empty string means that the dimension has no unit."
        },
        "when": {
          "$ref": "#/$defs/ResponseWhen",
          "description": "With this field, a point has a value only at the stated levels of the parent. Each other point has `null`."
        }
      },
      "required": [
        "kind",
        "levels",
        "id",
        "label",
        "unit"
      ]
    },
    "CompareOptions": {
      "type": "object",
      "properties": {
        "better": {
          "enum": [
            "higher",
            "lower"
          ],
          "description": "\"higher\" (the default): a ratio above 1 is a gain. \"lower\": a ratio below 1 is a gain, as for a time or a cost."
        },
        "tie": {
          "type": "number",
          "description": "A ratio at this distance from 1 or nearer is a tie. The default is 0: only a ratio of exactly 1 is a tie."
        },
        "noise": {
          "type": "number",
          "description": "A gain or a loss counts only beyond this distance from 1. The default is 0. Use noiseFloor."
        }
      }
    },
    "Comparison": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The number of inputs."
        },
        "ties": {
          "type": "number"
        },
        "wins": {
          "type": "number",
          "description": "The inputs where the candidate is better, by any amount."
        },
        "losses": {
          "type": "number",
          "description": "The inputs where the candidate is worse, by any amount."
        },
        "signP": {
          "type": "number",
          "description": "The one-sided sign test of wins against losses."
        },
        "effect": {
          "$ref": "#/$defs/Effect",
          "description": "The ratios of the inputs that are not ties, or undefined when each input is a tie."
        },
        "gains": {
          "type": "number",
          "description": "The inputs that gain beyond the noise."
        },
        "drops": {
          "type": "number",
          "description": "The inputs that lose beyond the noise."
        },
        "gainShare": {
          "type": "number",
          "description": "gains / n, with its Wilson interval."
        },
        "gainInterval": {
          "$ref": "#/$defs/Proportion"
        },
        "dropShare": {
          "type": "number",
          "description": "drops / n, with its Wilson interval."
        },
        "dropInterval": {
          "$ref": "#/$defs/Proportion"
        }
      },
      "required": [
        "n",
        "ties",
        "wins",
        "losses",
        "signP",
        "gains",
        "drops",
        "gainShare",
        "gainInterval",
        "dropShare",
        "dropInterval"
      ]
    },
    "ContinuousDimension": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "continuous"
        },
        "range": {
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
          "maxItems": 2,
          "description": "The smallest and the largest value. The first is less than the second."
        },
        "log": {
          "type": "boolean",
          "description": "When true, a model and an axis use the base-10 logarithm of the value. All of the range is above 0."
        },
        "id": {
          "type": "string",
          "description": "The key of the dimension in the values of a point."
        },
        "label": {
          "type": "string",
          "description": "The name that a view shows."
        },
        "unit": {
          "type": "string",
          "description": "The unit. An empty string means that the dimension has no unit."
        },
        "when": {
          "$ref": "#/$defs/ResponseWhen",
          "description": "With this field, a point has a value only at the stated levels of the parent. Each other point has `null`."
        }
      },
      "required": [
        "kind",
        "range",
        "id",
        "label",
        "unit"
      ]
    },
    "Corrected": {
      "type": "object",
      "properties": {
        "p": {
          "type": "number",
          "description": "The p of the test."
        },
        "adjusted": {
          "type": "number",
          "description": "The p after the correction: compare it with the level of the whole family."
        },
        "reject": {
          "type": "boolean",
          "description": "The adjusted p is less than the level."
        }
      },
      "required": [
        "p",
        "adjusted",
        "reject"
      ]
    },
    "CountInterval": {
      "type": "object",
      "properties": {
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        },
        "coverage": {
          "type": "number",
          "description": "The chance of a count from `low` to `high`. It is `level` or more."
        }
      },
      "required": [
        "low",
        "high",
        "coverage"
      ]
    },
    "CoverageBar": {
      "type": "object",
      "properties": {
        "level": {
          "type": "number",
          "description": "The coverage that the method claims, for example 0.95. Each cell has a one-sided exact binomial test of it."
        },
        "alpha": {
          "type": "number",
          "description": "The level of the Holm family of the cell tests, for example 0.05."
        },
        "pooledLow": {
          "type": "number",
          "description": "The smallest Wilson lower end of the pooled coverage, for example 0.94."
        },
        "z": {
          "type": "number",
          "description": "The z of the Wilson interval. The default is `Z95`."
        }
      },
      "required": [
        "level",
        "alpha",
        "pooledLow"
      ]
    },
    "CoverageCell": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the cell, for example `\"skewed 120/108\"`. The result names the rejected cells with it."
        },
        "sample": {
          "type": "number",
          "description": "The sample size `m` of the cell, a whole number of 1 or more."
        },
        "hits": {
          "type": "number",
          "description": "The count of samples whose interval holds the true value, a whole number from 0 to `draws`."
        },
        "draws": {
          "type": "number",
          "description": "The count of samples of the cell, a whole number of 1 or more."
        }
      },
      "required": [
        "name",
        "sample",
        "hits",
        "draws"
      ]
    },
    "CoverageMinSample": {
      "type": "object",
      "properties": {
        "minSample": {
          "type": "number",
          "description": "The smallest sample size `m` of the cells such that each size of `m` or more passes the bar. It is infinite when the largest size fails."
        },
        "blocking": {
          "type": "number",
          "description": "The largest sample size that fails the bar. It blocks each smaller size. The result has no `blocking` when each size passes."
        },
        "steps": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/CoverageStep"
          },
          "description": "One step for each sample size of the cells, from the smallest to the largest."
        }
      },
      "required": [
        "minSample",
        "steps"
      ]
    },
    "CoverageReason": {
      "enum": [
        "cell-rejected",
        "cell-rejected-and-pooled-low",
        "pooled-low",
        "qualifies"
      ]
    },
    "CoverageStep": {
      "type": "object",
      "properties": {
        "sample": {
          "type": "number",
          "description": "The sample size `m` of the step."
        },
        "cells": {
          "type": "number",
          "description": "The count of cells with a sample of `m` or more."
        },
        "rejected": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The names of the cells that reject the coverage `level`, after the Holm correction."
        },
        "smallestAdjusted": {
          "type": "number",
          "description": "The smallest Holm-adjusted p of the cells of the step."
        },
        "hits": {
          "type": "number",
          "description": "The sum of the hits of the cells of the step."
        },
        "draws": {
          "type": "number",
          "description": "The sum of the draws of the cells of the step."
        },
        "pooled": {
          "$ref": "#/$defs/Proportion",
          "description": "The Wilson interval of the pooled coverage `hits / draws`."
        },
        "qualifies": {
          "type": "boolean",
          "description": "The sample size `m` passes the two tests of the bar."
        },
        "reason": {
          "$ref": "#/$defs/CoverageReason"
        }
      },
      "required": [
        "sample",
        "cells",
        "rejected",
        "smallestAdjusted",
        "hits",
        "draws",
        "pooled",
        "qualifies",
        "reason"
      ]
    },
    "Effect": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number"
        },
        "median": {
          "type": "number"
        },
        "p10": {
          "type": "number",
          "description": "The 0.1 quantile (linear)."
        },
        "p90": {
          "type": "number",
          "description": "The 0.9 quantile (linear)."
        }
      },
      "required": [
        "n",
        "median",
        "p10",
        "p90"
      ]
    },
    "EloOptions": {
      "type": "object",
      "properties": {
        "k": {
          "type": "number",
          "description": "The largest change of a rating after one result (the K factor). The default is 32."
        },
        "center": {
          "type": "number",
          "description": "The rating of the log-strength 0. The default is 1500. Elo uses only differences, so it does not read it."
        },
        "scale": {
          "type": "number",
          "description": "The number of points that gives odds of `base` to 1. The default is 400."
        },
        "base": {
          "type": "number",
          "description": "The base of the odds. The default is 10."
        }
      }
    },
    "EloReplayOptions": {
      "type": "object",
      "properties": {
        "start": {
          "type": "number",
          "description": "The rating of each item before its first pick. The default is 1500."
        },
        "k": {
          "type": "number",
          "description": "The largest change of a rating after one result (the K factor). The default is 32."
        },
        "center": {
          "type": "number",
          "description": "The rating of the log-strength 0. The default is 1500. Elo uses only differences, so it does not read it."
        },
        "scale": {
          "type": "number",
          "description": "The number of points that gives odds of `base` to 1. The default is 400."
        },
        "base": {
          "type": "number",
          "description": "The base of the odds. The default is 10."
        }
      }
    },
    "EloUpdate": {
      "type": "object",
      "properties": {
        "a": {
          "type": "number",
          "description": "The new rating of the first item."
        },
        "b": {
          "type": "number",
          "description": "The new rating of the second item."
        },
        "expected": {
          "type": "number",
          "description": "The expected score of the first item before the result."
        }
      },
      "required": [
        "a",
        "b",
        "expected"
      ]
    },
    "Forecast": {
      "type": "object",
      "properties": {
        "p": {
          "type": "number"
        },
        "hit": {
          "type": "boolean"
        }
      },
      "required": [
        "p",
        "hit"
      ]
    },
    "Glicko2Game": {
      "type": "object",
      "properties": {
        "rating": {
          "type": "number"
        },
        "rd": {
          "type": "number"
        },
        "score": {
          "type": "number",
          "description": "The score of the player: 1 for a win, 0.5 for a tie and 0 for a loss."
        }
      },
      "required": [
        "rating",
        "rd",
        "score"
      ]
    },
    "Glicko2Options": {
      "type": "object",
      "properties": {
        "tau": {
          "type": "number",
          "description": "The constraint on the change of the volatility over time (tau). The default is 0.5. Glickman uses 0.3 to 1.2."
        },
        "tolerance": {
          "type": "number",
          "description": "The tolerance of the iteration for the new volatility (epsilon). The default is 0.000001, as in the paper."
        }
      }
    },
    "Glicko2Rating": {
      "type": "object",
      "properties": {
        "rating": {
          "type": "number"
        },
        "rd": {
          "type": "number",
          "description": "The rating deviation, in rating points. It is above 0."
        },
        "volatility": {
          "type": "number",
          "description": "The volatility: the expected size of a change of the true strength in one rating period. It is above 0."
        }
      },
      "required": [
        "rating",
        "rd",
        "volatility"
      ]
    },
    "Glicko2ReplayOptions": {
      "type": "object",
      "properties": {
        "start": {
          "$ref": "#/$defs/Glicko2Rating",
          "description": "The rating of each item before its first pick. The default is the rating 1500, the RD 350 and the volatility 0.06."
        },
        "tau": {
          "type": "number",
          "description": "The constraint on the change of the volatility over time (tau). The default is 0.5. Glickman uses 0.3 to 1.2."
        },
        "tolerance": {
          "type": "number",
          "description": "The tolerance of the iteration for the new volatility (epsilon). The default is 0.000001, as in the paper."
        }
      }
    },
    "Interval": {
      "type": "object",
      "properties": {
        "estimate": {
          "type": "number",
          "description": "The statistic of all the data."
        },
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        },
        "level": {
          "type": "number"
        },
        "runs": {
          "type": "number"
        },
        "finite": {
          "type": "number",
          "description": "The number of runs whose statistic is a finite number. Only these runs make the interval."
        },
        "seed": {
          "type": "number",
          "description": "The seed as a 32-bit number."
        },
        "against": {
          "type": "number",
          "description": "The value of the option `against`."
        },
        "pAbove": {
          "type": "number",
          "description": "The p of the claim \"the statistic is above `against`\": (1 + the finite runs at or below `against`) / (finite + 1)."
        },
        "pBelow": {
          "type": "number",
          "description": "The p of the claim \"the statistic is below `against`\": (1 + the finite runs at or above `against`) / (finite + 1)."
        }
      },
      "required": [
        "estimate",
        "low",
        "high",
        "level",
        "runs",
        "finite",
        "seed"
      ]
    },
    "Kappa": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The number of items."
        },
        "observed": {
          "type": "number",
          "description": "The part of the items where the two raters give the same category."
        },
        "chance": {
          "type": "number",
          "description": "The part of agreement that two independent raters with the same frequencies of categories give."
        },
        "kappa": {
          "type": "number",
          "description": "Cohen's kappa: `(observed − chance) / (1 − chance)`. It is `undefined` when `chance` is 1."
        }
      },
      "required": [
        "n",
        "observed",
        "chance"
      ]
    },
    "LeastSquaresFit": {
      "type": "object",
      "properties": {
        "coefficients": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The coefficients. With an intercept, coefficient 0 is the intercept and coefficient `j + 1` is predictor `j`."
        },
        "residualSd": {
          "type": "number",
          "description": "The residual standard deviation: the square root of the residual sum of squares divided by `n - k`."
        },
        "r2": {
          "type": "number",
          "description": "The coefficient of determination: 1 minus the residual sum of squares divided by the total sum of squares. With an intercept, the total sum uses the distances from the mean of `y`. Without an intercept, it uses the values."
        },
        "n": {
          "type": "number",
          "description": "The number of rows."
        },
        "k": {
          "type": "number",
          "description": "The number of coefficients, with the intercept."
        }
      },
      "required": [
        "coefficients",
        "residualSd",
        "r2",
        "n",
        "k"
      ]
    },
    "LeastSquaresOptions": {
      "type": "object",
      "properties": {
        "intercept": {
          "type": "boolean",
          "description": "When true, the fit adds an intercept as coefficient 0. The default is true."
        }
      }
    },
    "MedianInterval": {
      "type": "object",
      "properties": {
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        },
        "rank": {
          "type": "number",
          "description": "The rank k of `low`, from 1. The interval is from x_(k) to x_(n + 1 - k) of the sorted values."
        },
        "coverage": {
          "type": "number",
          "description": "The chance that the interval holds the median of the population: 1 - 2 P(X <= k - 1), for X ~ Binomial(n, 1/2)."
        }
      },
      "required": [
        "low",
        "high",
        "rank",
        "coverage"
      ]
    },
    "ModeOptions": {
      "type": "object",
      "properties": {
        "minShare": {
          "type": "number",
          "description": "The smallest share of the mass that makes a mode. The default is `0.1`. Half of the mass of the largest mode also makes a mode, so many equal modes each count."
        },
        "valleyRatio": {
          "type": "number",
          "description": "The valley between two peaks of the kernel is under this share of the lower peak. The default is `0.5`."
        }
      }
    },
    "NoiseOptions": {
      "type": "object",
      "properties": {
        "k": {
          "type": "number",
          "description": "The number of standard deviations. The default is 2."
        },
        "minimum": {
          "type": "number",
          "description": "The fewest values (seeds or folds) that give a floor. The default is 5, the 5-seed rule."
        },
        "margin": {
          "type": "number",
          "description": "The margin of practical effect, in the units of the values. A difference that is real but smaller than the margin is too small to matter, so it is not a result. Give the reason of the margin from the problem of the user. The default is 0: no margin."
        }
      }
    },
    "NoiseState": {
      "enum": [
        "gain",
        "loss",
        "no-spread",
        "noise"
      ]
    },
    "NoiseVerdict": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The number of values."
        },
        "mean": {
          "type": "number"
        },
        "sd": {
          "type": "number",
          "description": "The sample standard deviation of the values."
        },
        "spread": {
          "type": "number",
          "description": "k times the standard deviation."
        },
        "margin": {
          "type": "number"
        },
        "threshold": {
          "type": "number",
          "description": "The larger of `spread` and `margin`. The absolute mean must be above it."
        },
        "state": {
          "$ref": "#/$defs/NoiseState"
        }
      },
      "required": [
        "n",
        "mean",
        "sd",
        "spread",
        "margin",
        "threshold",
        "state"
      ]
    },
    "OptionFloorOptions": {
      "type": "object",
      "properties": {
        "sigma": {
          "type": "number",
          "description": "The standard deviation of one value about the mean of its option. All options have the same value."
        },
        "delta": {
          "type": "number",
          "description": "The smallest difference between the means of two options that the comparison finds."
        },
        "tests": {
          "type": "number",
          "description": "The count of tests in the family. The level of each test is `alpha / tests`."
        },
        "alpha": {
          "type": "number",
          "description": "The two-sided level of the family. The default is 0.05."
        },
        "power": {
          "type": "number",
          "description": "The share of comparisons that find a difference of `delta`. The default is 0.8."
        }
      },
      "required": [
        "sigma",
        "delta",
        "tests"
      ]
    },
    "OrdinalDimension": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "ordinal"
        },
        "levels": {
          "anyOf": [
            {
              "type": "array",
              "items": {
                "type": "number"
              }
            },
            {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          ]
        },
        "log": {
          "type": "boolean",
          "description": "When true, a model uses the base-10 logarithm of the level. The levels are numbers above 0."
        },
        "id": {
          "type": "string",
          "description": "The key of the dimension in the values of a point."
        },
        "label": {
          "type": "string",
          "description": "The name that a view shows."
        },
        "unit": {
          "type": "string",
          "description": "The unit. An empty string means that the dimension has no unit."
        },
        "when": {
          "$ref": "#/$defs/ResponseWhen",
          "description": "With this field, a point has a value only at the stated levels of the parent. Each other point has `null`."
        }
      },
      "required": [
        "kind",
        "levels",
        "id",
        "label",
        "unit"
      ]
    },
    "PairChoice": {
      "type": "object",
      "properties": {
        "a": {
          "type": "string"
        },
        "b": {
          "type": "string"
        },
        "information": {
          "type": "number",
          "description": "The information of the pair."
        }
      },
      "required": [
        "a",
        "b",
        "information"
      ]
    },
    "PairChoiceOptions_T": {
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
          ],
          "description": "The seed of the draws."
        },
        "recent": {
          "type": "array",
          "items": {
            "type": "array",
            "prefixItems": [
              {
                "type": "string"
              },
              {
                "type": "string"
              }
            ],
            "minItems": 2,
            "maxItems": 2
          },
          "description": "The pairs of the last duels, by key, in each order. The choice takes a recent pair only when there is no other pair."
        },
        "candidates": {
          "type": "number",
          "description": "The number of second items to examine for the first item. It is a whole number of 1 or more. The default is 24."
        },
        "information": {
          "type": "object",
          "description": "This function gives the information of a pick between two items, or `undefined` when the pair is not permitted. The value is a finite number. The default is `pairInformation` with the default scale, and it permits each pair.",
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
              "a",
              "b"
            ],
            "inputs": [
              {
                "$ref": "#/$defs/RatedItem"
              },
              {
                "$ref": "#/$defs/RatedItem"
              }
            ],
            "output": {
              "type": "number"
            },
            "undefinedForNull": true
          }
        }
      },
      "required": [
        "seed"
      ]
    },
    "PairComparison": {
      "type": "object",
      "properties": {
        "a": {
          "type": "number"
        },
        "b": {
          "type": "number"
        },
        "outcome": {
          "$ref": "#/$defs/PairOutcome"
        },
        "weight": {
          "type": "number",
          "description": "The weight of the comparison. The default is 1. A weight of 2 counts as two equal comparisons."
        }
      },
      "required": [
        "a",
        "b",
        "outcome"
      ]
    },
    "PairOutcome": {
      "enum": [
        "a",
        "b",
        "tie"
      ]
    },
    "PairProbabilities": {
      "type": "object",
      "properties": {
        "a": {
          "type": "number",
          "description": "The probability that the first item wins."
        },
        "b": {
          "type": "number",
          "description": "The probability that the second item wins."
        },
        "tie": {
          "type": "number",
          "description": "The probability of a tie. It is 0 when the tie parameter is 0."
        }
      },
      "required": [
        "a",
        "b",
        "tie"
      ]
    },
    "ParsedResponseRecord": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "ok": {
              "const": false
            },
            "faults": {
              "type": "array",
              "items": {
                "$ref": "#/$defs/ResponseFault"
              }
            }
          },
          "required": [
            "ok",
            "faults"
          ]
        },
        {
          "type": "object",
          "properties": {
            "ok": {
              "const": true
            },
            "record": {
              "$ref": "#/$defs/ResponseRecord"
            }
          },
          "required": [
            "ok",
            "record"
          ]
        }
      ]
    },
    "PermutationOptions": {
      "type": "object",
      "properties": {
        "runs": {
          "type": "number",
          "description": "The number of random sign flips. The default is 10 000."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The default is 1."
        },
        "statistic": {
          "type": "object",
          "description": "The statistic of the differences. The default is the mean.",
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
              "differences"
            ],
            "inputs": [
              {
                "type": "array",
                "items": {
                  "type": "number"
                }
              }
            ],
            "output": {
              "type": "number"
            }
          }
        }
      }
    },
    "PermutationResult": {
      "type": "object",
      "properties": {
        "observed": {
          "type": "number",
          "description": "The statistic of the observed differences `candidate[i] - baseline[i]`."
        },
        "p": {
          "type": "number",
          "description": "The two-sided p: (1 + the flips with a statistic as far from 0 or farther) / (1 + runs)."
        },
        "runs": {
          "type": "number"
        }
      },
      "required": [
        "observed",
        "p",
        "runs"
      ]
    },
    "Proportion": {
      "type": "object",
      "properties": {
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        }
      },
      "required": [
        "low",
        "high"
      ]
    },
    "QuantileInterval": {
      "type": "object",
      "properties": {
        "low": {
          "type": "number",
          "description": "The value x_(lowRank), or `-Infinity` when the sample has no rank for a lower bound."
        },
        "high": {
          "type": "number",
          "description": "The value x_(highRank), or `Infinity` when the sample has no rank for an upper bound."
        },
        "lowRank": {
          "type": "number",
          "description": "The rank of `low`, from 1, or 0 when `low` is `-Infinity`."
        },
        "highRank": {
          "type": "number",
          "description": "The rank of `high`, from 1, or n + 1 when `high` is `Infinity`."
        },
        "coverage": {
          "type": "number",
          "description": "The chance that the interval holds the quantile of the population."
        }
      },
      "required": [
        "low",
        "high",
        "lowRank",
        "highRank",
        "coverage"
      ]
    },
    "RatedItem": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "The key of the item. Each key occurs one time in a pool. A second item with the same key does not count."
        },
        "rating": {
          "type": "number",
          "description": "The rating, on the Elo scale of the options."
        },
        "se": {
          "type": "number",
          "description": "The standard error of the rating, in rating points, or `undefined` when the model gives none."
        },
        "picks": {
          "type": "number",
          "description": "The number of picks of the item."
        }
      },
      "required": [
        "id",
        "rating",
        "picks"
      ]
    },
    "RatingFit": {
      "type": "object",
      "properties": {
        "strengths": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The log-strength of each item. `strengthToRating` gives the rating."
        },
        "se": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The standard error of each log-strength. Elo has no standard error, so each value is `undefined`. For Glicko-2, it is the RD as a log-strength."
        },
        "tie": {
          "type": "number",
          "description": "The Davidson tie parameter of the Bradley-Terry fit, or 0 for the other models."
        }
      },
      "required": [
        "strengths",
        "se",
        "tie"
      ]
    },
    "RatingFitOptions": {
      "type": "object",
      "properties": {
        "bradleyTerry": {
          "$ref": "#/$defs/BradleyTerryOptions",
          "description": "The options of the Bradley-Terry fit. They go to `bradleyTerry` and to `bradleyTerrySparse`."
        },
        "denseLimit": {
          "type": "number",
          "description": "The largest number of items for the dense fit `bradleyTerry`. A larger log uses `bradleyTerrySparse`. The default is 200."
        },
        "elo": {
          "$ref": "#/$defs/EloReplayOptions",
          "description": "The options of the Elo replay. Its scale also converts the ratings to log-strengths."
        },
        "glicko2": {
          "$ref": "#/$defs/Glicko2ReplayOptions",
          "description": "The options of the Glicko-2 replay."
        }
      }
    },
    "RatingModel": {
      "enum": [
        "bradley-terry",
        "elo",
        "glicko2"
      ]
    },
    "RatingModelChoice": {
      "type": "object",
      "properties": {
        "model": {
          "$ref": "#/$defs/RatingModel",
          "description": "The model with the lowest log-loss, or `\"bradley-terry\"` when the log has too few picks for a test."
        },
        "scores": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RatingModelScore"
          },
          "description": "The score of each model, from the best to the worst. It is empty when the log has too few picks for a test."
        },
        "trained": {
          "type": "number",
          "description": "The number of picks that the models learn from."
        },
        "tested": {
          "type": "number",
          "description": "The number of held-out picks."
        }
      },
      "required": [
        "model",
        "scores",
        "trained",
        "tested"
      ]
    },
    "RatingModelOptions": {
      "type": "object",
      "properties": {
        "holdout": {
          "type": "number",
          "description": "The part of the picks, at the end of the log, that the test uses. It is above 0 and below 1. The default is 0.2."
        },
        "minimum": {
          "type": "number",
          "description": "The fewest picks for a test. With fewer picks, the choice is `\"bradley-terry\"`. The default is 30."
        },
        "models": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RatingModel"
          },
          "description": "The models to compare. The default is all three, in the order `\"bradley-terry\"`, `\"elo\"` and `\"glicko2\"`."
        },
        "bradleyTerry": {
          "$ref": "#/$defs/BradleyTerryOptions",
          "description": "The options of the Bradley-Terry fit. They go to `bradleyTerry` and to `bradleyTerrySparse`."
        },
        "denseLimit": {
          "type": "number",
          "description": "The largest number of items for the dense fit `bradleyTerry`. A larger log uses `bradleyTerrySparse`. The default is 200."
        },
        "elo": {
          "$ref": "#/$defs/EloReplayOptions",
          "description": "The options of the Elo replay. Its scale also converts the ratings to log-strengths."
        },
        "glicko2": {
          "$ref": "#/$defs/Glicko2ReplayOptions",
          "description": "The options of the Glicko-2 replay."
        }
      }
    },
    "RatingModelScore": {
      "type": "object",
      "properties": {
        "model": {
          "$ref": "#/$defs/RatingModel"
        },
        "logLoss": {
          "type": "number",
          "description": "The mean of `-ln(p)` over the held-out picks, with `p` the forecast of the outcome of the pick. Lower is better."
        }
      },
      "required": [
        "model",
        "logLoss"
      ]
    },
    "RatingScale": {
      "type": "object",
      "properties": {
        "center": {
          "type": "number",
          "description": "The rating of the log-strength 0. The default is 1500. Elo uses only differences, so it does not read it."
        },
        "scale": {
          "type": "number",
          "description": "The number of points that gives odds of `base` to 1. The default is 400."
        },
        "base": {
          "type": "number",
          "description": "The base of the odds. The default is 10."
        }
      }
    },
    "ResponseAbsentPoint": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "at": {
          "$ref": "#/$defs/ResponseValue",
          "description": "The value of the varied dimension."
        },
        "reason": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "type": "string"
            }
          ],
          "description": "The id of the declared reason. The value `null` means that the point states no reason."
        },
        "group": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "at",
        "reason"
      ]
    },
    "ResponseBand": {
      "type": "object",
      "properties": {
        "value": {
          "type": "number"
        },
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        },
        "nearest": {
          "type": "number",
          "description": "The distance from this place to the nearest measured point with a value of the measure, from 0 to 1. The value 0 means that a point was measured here. A number or rank dimension counts as its share of the axis. A different categorical level counts 1, and an absent value against a present value counts 1. The distance is the largest count over the dimensions."
        },
        "clipped": {
          "const": true,
          "description": "This field is true when the measure has a `range` and the view moved `value`, `low` or `high` into it."
        }
      },
      "required": [
        "value",
        "low",
        "high",
        "nearest"
      ]
    },
    "ResponseCurvePoint": {
      "type": "object",
      "properties": {
        "at": {
          "$ref": "#/$defs/ResponseValue",
          "description": "The value of the varied dimension."
        },
        "value": {
          "type": "number"
        },
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        },
        "nearest": {
          "type": "number",
          "description": "The distance from this place to the nearest measured point with a value of the measure, from 0 to 1. The value 0 means that a point was measured here. A number or rank dimension counts as its share of the axis. A different categorical level counts 1, and an absent value against a present value counts 1. The distance is the largest count over the dimensions."
        },
        "clipped": {
          "const": true,
          "description": "This field is true when the measure has a `range` and the view moved `value`, `low` or `high` into it."
        }
      },
      "required": [
        "at",
        "value",
        "low",
        "high",
        "nearest"
      ]
    },
    "ResponseData": {
      "type": "object",
      "properties": {
        "schema": {
          "const": "response-records/1"
        },
        "name": {
          "type": "string"
        },
        "dimensions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseDimension"
          }
        },
        "measures": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseMeasure"
          }
        },
        "reasons": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseReason"
          },
          "description": "The reasons that a measure of a point can be absent. Each id in the field `absent` of a point is in this list."
        },
        "points": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponsePoint"
          }
        }
      },
      "required": [
        "schema",
        "name",
        "dimensions",
        "measures",
        "points"
      ]
    },
    "ResponseDimension": {
      "anyOf": [
        {
          "$ref": "#/$defs/CategoricalDimension"
        },
        {
          "$ref": "#/$defs/ContinuousDimension"
        },
        {
          "$ref": "#/$defs/OrdinalDimension"
        }
      ]
    },
    "ResponseFactor": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "dimension": {
              "type": "string"
            },
            "level": {
              "$ref": "#/$defs/ResponseValue"
            }
          },
          "required": [
            "dimension",
            "level"
          ]
        },
        {
          "type": "object",
          "properties": {
            "dimension": {
              "type": "string"
            },
            "power": {
              "type": "number"
            }
          },
          "required": [
            "dimension",
            "power"
          ]
        }
      ]
    },
    "ResponseFault": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "The place of the fault, for example `points[3].values.size`. An empty string is the record itself."
        },
        "message": {
          "type": "string",
          "description": "What is wrong, and what the format needs."
        }
      },
      "required": [
        "path",
        "message"
      ]
    },
    "ResponseFitOptions": {
      "type": "object",
      "properties": {
        "folds": {
          "type": "number",
          "description": "The number of folds, 3 or more. With fewer groups, each group is one fold. The default is 5."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The seed of the split. The default is 1."
        },
        "model": {
          "enum": [
            "auto",
            "ridge",
            "table"
          ],
          "description": "The kind of model. The default `auto` gives a table when each dimension is categorical, and a ridge fit otherwise."
        },
        "degree": {
          "type": "number",
          "description": "The largest total power of a term of a ridge fit, from 1 to 8. The default is 2."
        },
        "interactions": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "const": "seen"
            }
          ],
          "description": "When true, a ridge fit also has the products of two dimensions, up to `degree`. The default is true. The value false also removes the products of a conditional dimension with the levels of its parent. Thus this option is the way out of the limit `RESPONSE_MAX_TERMS`."
        },
        "terms": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/ResponseFactor"
            }
          },
          "description": "The stated terms of a ridge fit, in place of `degree` and `interactions`."
        },
        "lambdas": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The penalties that a ridge fit chooses from, each above 0. The default is `RESPONSE_LAMBDAS`."
        },
        "log": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The ids of the measures to fit on a log scale."
        },
        "logFloor": {
          "type": "number",
          "description": "On a log scale, each smaller value takes this value. With no floor, a value of 0 or less is an error."
        },
        "outOfFold": {
          "type": "boolean",
          "description": "When true, each fold stores the prediction of each held-out point with a value. Then `heldOutErrorAt` gives the error of a chosen set of points. The default is false, and the record then has no field `predictions`."
        }
      }
    },
    "ResponseFold": {
      "type": "object",
      "properties": {
        "heldOut": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The ids of the held-out points."
        },
        "errors": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/ResponseFoldError"
          },
          "description": "The error of each measure. A measure with no held-out point or no training point has no entry."
        },
        "predictions": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "object",
            "properties": {},
            "additionalProperties": {
              "type": "number"
            }
          },
          "description": "The prediction of each held-out point with a value, on the scale of the model. The keys are the id of the measure, then the id of the point. The model of this fold gave them. Only the option `outOfFold` of `fitResponse` writes this field."
        }
      },
      "required": [
        "heldOut",
        "errors"
      ]
    },
    "ResponseFoldError": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The number of held-out points with a value of the measure."
        },
        "mae": {
          "type": "number",
          "description": "The mean absolute error."
        },
        "rmse": {
          "type": "number",
          "description": "The root mean square error."
        },
        "baselineMae": {
          "type": "number",
          "description": "The mean absolute error of the mean of the training points, used as the prediction."
        }
      },
      "required": [
        "n",
        "mae",
        "rmse",
        "baselineMae"
      ]
    },
    "ResponseHeldOutError": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The number of held-out points."
        },
        "folds": {
          "type": "number",
          "description": "The number of folds with this measure."
        },
        "mae": {
          "type": "number",
          "description": "The mean absolute error of all the held-out points."
        },
        "rmse": {
          "type": "number",
          "description": "The root mean square error of all the held-out points."
        },
        "baselineMae": {
          "type": "number",
          "description": "The mean absolute error of the baseline."
        },
        "skill": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "type": "number"
            }
          ],
          "description": "The value `1 - mae / baselineMae`. The value 0 is no better than the mean. A baseline of 0 gives `null`."
        }
      },
      "required": [
        "n",
        "folds",
        "mae",
        "rmse",
        "baselineMae",
        "skill"
      ]
    },
    "ResponseInputValue": {
      "anyOf": [
        {
          "type": "null"
        },
        {
          "type": "string"
        },
        {
          "type": "number"
        }
      ]
    },
    "ResponseMeasure": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "The key of the measure in the measures of a point."
        },
        "label": {
          "type": "string"
        },
        "unit": {
          "type": "string",
          "description": "The unit. An empty string means that the measure has no unit."
        },
        "direction": {
          "enum": [
            "higher",
            "lower",
            "none"
          ],
          "description": "The better direction of the value. The value `none` means that no direction is better."
        },
        "range": {
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
          "maxItems": 2,
          "description": "The low and the high end of the possible values, for example `[0, 1]` for a share. Each measured value is in this range. A view clips its fitted values to it, and a fit does not use it."
        }
      },
      "required": [
        "id",
        "label",
        "unit",
        "direction"
      ]
    },
    "ResponseModel": {
      "anyOf": [
        {
          "$ref": "#/$defs/RidgeResponseModel"
        },
        {
          "$ref": "#/$defs/TableResponseModel"
        }
      ]
    },
    "ResponsePoint": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "values": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/ResponseInputValue"
          },
          "description": "The value of each dimension."
        },
        "measures": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "anyOf": [
              {
                "type": "null"
              },
              {
                "type": "number"
              }
            ]
          },
          "description": "The value of each measure. The value `null` means that the run did not give the measure at this point."
        },
        "group": {
          "type": "string",
          "description": "The points of one group stay on one side of each split, for example the repeats of one seed."
        },
        "absent": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "type": "string"
          },
          "description": "The reason of a measure with `null`: a map from the id of the measure to the id of a declared reason."
        }
      },
      "required": [
        "id",
        "values",
        "measures"
      ]
    },
    "ResponseReason": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "description": "The key of the reason in the field `absent` of a point."
        },
        "label": {
          "type": "string",
          "description": "The name that a view shows."
        }
      },
      "required": [
        "id",
        "label"
      ]
    },
    "ResponseRecord": {
      "type": "object",
      "properties": {
        "models": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseModel"
          }
        },
        "folds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseFold"
          }
        },
        "schema": {
          "const": "response-records/1"
        },
        "name": {
          "type": "string"
        },
        "dimensions": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseDimension"
          }
        },
        "measures": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseMeasure"
          }
        },
        "reasons": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseReason"
          },
          "description": "The reasons that a measure of a point can be absent. Each id in the field `absent` of a point is in this list."
        },
        "points": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponsePoint"
          }
        }
      },
      "required": [
        "models",
        "folds",
        "schema",
        "name",
        "dimensions",
        "measures",
        "points"
      ]
    },
    "ResponseSlice": {
      "type": "object",
      "properties": {
        "measure": {
          "type": "string"
        },
        "vary": {
          "type": "string"
        },
        "held": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/ResponseInputValue"
          },
          "description": "The value of each other dimension."
        },
        "curve": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseCurvePoint"
          }
        },
        "points": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseSlicePoint"
          }
        },
        "absent": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseAbsentPoint"
          },
          "description": "The points that match the held values and have no value of the measure, each with its reason."
        },
        "error": {
          "$ref": "#/$defs/ResponseHeldOutError"
        },
        "clipped": {
          "type": "number",
          "description": "The number of places of `curve` with the field `clipped`."
        }
      },
      "required": [
        "measure",
        "vary",
        "held",
        "curve",
        "points",
        "absent",
        "error",
        "clipped"
      ]
    },
    "ResponseSliceOptions": {
      "type": "object",
      "properties": {
        "vary": {
          "type": "string",
          "description": "The id of the dimension of the curve."
        },
        "hold": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/ResponseInputValue"
          },
          "description": "The value of each held dimension. Each other dimension takes its usual value, as `sliceResponse` tells."
        },
        "steps": {
          "type": "number",
          "description": "The number of values on a continuous axis, 2 or more. The default is 33."
        },
        "tolerance": {
          "type": "number",
          "description": "The share of the range of a held number dimension in which a point matches. A log dimension uses the log scale. The default is 0: only an equal value matches."
        },
        "width": {
          "type": "number",
          "description": "The half width of the band, as a multiple of the held-out root mean square error. The default is 1."
        }
      },
      "required": [
        "vary"
      ]
    },
    "ResponseSlicePoint": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "at": {
          "$ref": "#/$defs/ResponseValue",
          "description": "The value of the varied dimension."
        },
        "value": {
          "type": "number"
        },
        "group": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "at",
        "value"
      ]
    },
    "ResponseSurface": {
      "type": "object",
      "properties": {
        "measure": {
          "type": "string"
        },
        "vary": {
          "type": "array",
          "prefixItems": [
            {
              "type": "string"
            },
            {
              "type": "string"
            }
          ],
          "minItems": 2,
          "maxItems": 2
        },
        "held": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/ResponseInputValue"
          },
          "description": "The value of each other dimension."
        },
        "x": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseValue"
          }
        },
        "y": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseValue"
          }
        },
        "cells": {
          "type": "array",
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/ResponseBand"
            }
          },
          "description": "One row for each value of `y`. Each row has one cell for each value of `x`."
        },
        "points": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseSurfacePoint"
          }
        },
        "absent": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseSurfaceAbsentPoint"
          },
          "description": "The points that match the held values and have no value of the measure, each with its reason."
        },
        "error": {
          "$ref": "#/$defs/ResponseHeldOutError"
        },
        "clipped": {
          "type": "number",
          "description": "The number of places of `cells` with the field `clipped`."
        }
      },
      "required": [
        "measure",
        "vary",
        "held",
        "x",
        "y",
        "cells",
        "points",
        "absent",
        "error",
        "clipped"
      ]
    },
    "ResponseSurfaceAbsentPoint": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "at": {
          "type": "array",
          "prefixItems": [
            {
              "$ref": "#/$defs/ResponseValue"
            },
            {
              "$ref": "#/$defs/ResponseValue"
            }
          ],
          "minItems": 2,
          "maxItems": 2,
          "description": "The values of the two varied dimensions."
        },
        "reason": {
          "anyOf": [
            {
              "type": "null"
            },
            {
              "type": "string"
            }
          ],
          "description": "The id of the declared reason. The value `null` means that the point states no reason."
        },
        "group": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "at",
        "reason"
      ]
    },
    "ResponseSurfaceOptions": {
      "type": "object",
      "properties": {
        "vary": {
          "type": "array",
          "prefixItems": [
            {
              "type": "string"
            },
            {
              "type": "string"
            }
          ],
          "minItems": 2,
          "maxItems": 2,
          "description": "The ids of the two dimensions of the surface: first the x axis, then the y axis."
        },
        "hold": {
          "type": "object",
          "properties": {},
          "additionalProperties": {
            "$ref": "#/$defs/ResponseInputValue"
          },
          "description": "The value of each held dimension. Each other dimension takes its usual value, as `sliceResponse` tells."
        },
        "steps": {
          "type": "number",
          "description": "The number of values on a continuous axis, 2 or more. The default is 33."
        },
        "tolerance": {
          "type": "number",
          "description": "The share of the range of a held number dimension in which a point matches. A log dimension uses the log scale. The default is 0: only an equal value matches."
        },
        "width": {
          "type": "number",
          "description": "The half width of the band, as a multiple of the held-out root mean square error. The default is 1."
        }
      },
      "required": [
        "vary"
      ]
    },
    "ResponseSurfacePoint": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "at": {
          "type": "array",
          "prefixItems": [
            {
              "$ref": "#/$defs/ResponseValue"
            },
            {
              "$ref": "#/$defs/ResponseValue"
            }
          ],
          "minItems": 2,
          "maxItems": 2,
          "description": "The values of the two varied dimensions."
        },
        "value": {
          "type": "number"
        },
        "group": {
          "type": "string"
        }
      },
      "required": [
        "id",
        "at",
        "value"
      ]
    },
    "ResponseTableCell": {
      "type": "object",
      "properties": {
        "at": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseInputValue"
          },
          "description": "The value of each dimension of the table, in the order of its `dimensions`. An absent dimension has `null`."
        },
        "value": {
          "type": "number",
          "description": "The mean of the measured values of the cell, on the scale of the model."
        },
        "n": {
          "type": "number",
          "description": "The number of points of the cell."
        }
      },
      "required": [
        "at",
        "value",
        "n"
      ]
    },
    "ResponseValue": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        }
      ]
    },
    "ResponseWhen": {
      "type": "object",
      "properties": {
        "dimension": {
          "type": "string",
          "description": "The id of the parent: a categorical or ordinal dimension with no condition."
        },
        "levels": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseValue"
          }
        }
      },
      "required": [
        "dimension",
        "levels"
      ]
    },
    "RidgeInput": {
      "anyOf": [
        {
          "$ref": "#/$defs/RidgeLevelInput"
        },
        {
          "$ref": "#/$defs/RidgeNumberInput"
        },
        {
          "$ref": "#/$defs/RidgeRankInput"
        }
      ]
    },
    "RidgeLevelInput": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "level"
        },
        "levels": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "dimension": {
          "type": "string"
        },
        "conditional": {
          "type": "boolean",
          "description": "When true, the dimension is conditional, so `null` is a good value. Each term of an absent dimension is 0."
        }
      },
      "required": [
        "kind",
        "levels",
        "dimension"
      ]
    },
    "RidgeNumberInput": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "number"
        },
        "center": {
          "type": "number"
        },
        "spread": {
          "type": "number"
        },
        "log": {
          "type": "boolean"
        },
        "dimension": {
          "type": "string"
        },
        "conditional": {
          "type": "boolean",
          "description": "When true, the dimension is conditional, so `null` is a good value. Each term of an absent dimension is 0."
        }
      },
      "required": [
        "kind",
        "center",
        "spread",
        "dimension"
      ]
    },
    "RidgeOptions": {
      "type": "object",
      "properties": {
        "free": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "description": "The indexes of the coefficients with no penalty, for example 0 for an intercept. The default is none."
        }
      }
    },
    "RidgeRankInput": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "rank"
        },
        "levels": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "center": {
          "type": "number"
        },
        "spread": {
          "type": "number"
        },
        "dimension": {
          "type": "string"
        },
        "conditional": {
          "type": "boolean",
          "description": "When true, the dimension is conditional, so `null` is a good value. Each term of an absent dimension is 0."
        }
      },
      "required": [
        "kind",
        "levels",
        "center",
        "spread",
        "dimension"
      ]
    },
    "RidgeResponseModel": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "ridge"
        },
        "lambda": {
          "type": "number",
          "description": "The penalty of the fit."
        },
        "inputs": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RidgeInput"
          }
        },
        "intercept": {
          "type": "number"
        },
        "terms": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/RidgeTerm"
          }
        },
        "measure": {
          "type": "string",
          "description": "The id of the measure of the model."
        },
        "scale": {
          "enum": [
            "linear",
            "log"
          ],
          "description": "With `log`, the model and the held-out errors use the base-10 logarithm of the measure."
        },
        "floor": {
          "type": "number",
          "description": "With the scale `log`, the fit gave this value to each smaller measured value."
        }
      },
      "required": [
        "kind",
        "lambda",
        "inputs",
        "intercept",
        "terms",
        "measure",
        "scale"
      ]
    },
    "RidgeTerm": {
      "type": "object",
      "properties": {
        "factors": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseFactor"
          }
        },
        "weight": {
          "type": "number"
        }
      },
      "required": [
        "factors",
        "weight"
      ]
    },
    "RunningSummary": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The count of the values."
        },
        "sum": {
          "type": "number",
          "description": "The sum of the values, added in their order."
        },
        "min": {
          "type": "number",
          "description": "The smallest value, or `Infinity` for no value."
        },
        "max": {
          "type": "number",
          "description": "The largest value, or `-Infinity` for no value."
        },
        "m2": {
          "type": "number",
          "description": "The sum of the squares of the differences from the mean (Welford). `runningSd` reads it."
        }
      },
      "required": [
        "n",
        "sum",
        "min",
        "max",
        "m2"
      ]
    },
    "SampleTotalOptions": {
      "type": "object",
      "properties": {
        "population": {
          "type": "number",
          "description": "The number of items in the whole population, `n`. It is a whole number, and it is not less than the sample."
        },
        "scale": {
          "type": "number",
          "description": "The factor from the sum of the sample to the total of the population. The default is `population / values.length`."
        },
        "runs": {
          "type": "number",
          "description": "The number of samples. The default is 10 000."
        },
        "level": {
          "type": "number",
          "description": "The level of the interval. The default is 0.95."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The seed of the draws. The default is 1."
        },
        "method": {
          "enum": [
            "higher",
            "linear",
            "nearest-rank"
          ],
          "description": "The quantile method of the two ends of the interval. The default is linear."
        },
        "ends": {
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
          "maxItems": 2,
          "description": "The quantiles of the two ends, in place of `level`, for example [0.025, 0.975] or an interval with one side. The default is from the level: (1 - level) / 2 and 1 - (1 - level) / 2. In floating point, (1 - 0.95) / 2 is not 0.025, so a copy that writes 0.025 needs this option to give the same numbers."
        },
        "against": {
          "type": "number",
          "description": "The value of a claim to test, for example 0 for \"no difference\". With this option, the interval also gives `pAbove` and `pBelow` from the same draws, so the ends do not change. The default is no value and no p."
        }
      },
      "required": [
        "population"
      ]
    },
    "SignFlipOptions": {
      "type": "object",
      "properties": {
        "exactMax": {
          "type": "number",
          "description": "The largest count of terms for which the test reads each of the `2^n` sign sets. The default is 16. The most is 24."
        },
        "runs": {
          "type": "number",
          "description": "The count of random sign sets above `exactMax`. The default is 10 000."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The default is 1."
        }
      }
    },
    "SignFlipResult": {
      "type": "object",
      "properties": {
        "observed": {
          "type": "number",
          "description": "The absolute value of the sum of the terms."
        },
        "p": {
          "type": "number",
          "description": "The two-sided p."
        },
        "exact": {
          "type": "boolean",
          "description": "This field is true when the test read each sign set, so the p has no noise from the draws."
        },
        "runs": {
          "type": "number",
          "description": "The count of the sign sets that the test read: `2^n` when it is exact, otherwise the count of the draws."
        }
      },
      "required": [
        "observed",
        "p",
        "exact",
        "runs"
      ]
    },
    "SmoothLaw": {
      "enum": [
        "exponential",
        "log-normal",
        "normal",
        "pareto",
        "uniform"
      ]
    },
    "SmoothLawScore": {
      "type": "object",
      "properties": {
        "law": {
          "$ref": "#/$defs/SmoothLaw"
        },
        "meanLogDensity": {
          "type": "number",
          "description": "The mean log density of the values at the fit of the law. A larger value is a better fit."
        }
      },
      "required": [
        "law",
        "meanLogDensity"
      ]
    },
    "SobolIndex": {
      "type": "object",
      "properties": {
        "dimension": {
          "type": "string",
          "description": "The id of the dimension."
        },
        "first": {
          "type": "number",
          "description": "The first-order index S_i: the estimator of Saltelli (2010)."
        },
        "total": {
          "type": "number",
          "description": "The total index ST_i: the estimator of Jansen (1999)."
        },
        "firstInterval": {
          "$ref": "#/$defs/Interval",
          "description": "The bootstrap interval of `first`. Only the option `interval` writes this field."
        },
        "totalInterval": {
          "$ref": "#/$defs/Interval",
          "description": "The bootstrap interval of `total`. Only the option `interval` writes this field."
        }
      },
      "required": [
        "dimension",
        "first",
        "total"
      ]
    },
    "SobolIndices": {
      "type": "object",
      "properties": {
        "measure": {
          "type": "string",
          "description": "The id of the measure."
        },
        "scale": {
          "enum": [
            "measure",
            "model"
          ],
          "description": "The scale of the output."
        },
        "n": {
          "type": "number",
          "description": "The number N of rows of each base matrix."
        },
        "evaluations": {
          "type": "number",
          "description": "The number of model evaluations: N * (d + 2)."
        },
        "seed": {
          "type": "number",
          "description": "The seed as a 32-bit number."
        },
        "mean": {
          "type": "number",
          "description": "The mean of the outputs of A and B."
        },
        "variance": {
          "type": "number",
          "description": "The variance of the outputs of A and B, with the divisor 2N."
        },
        "indices": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/SobolIndex"
          },
          "description": "The indices of each dimension of the record, in the order of the record."
        }
      },
      "required": [
        "measure",
        "scale",
        "n",
        "evaluations",
        "seed",
        "mean",
        "variance",
        "indices"
      ]
    },
    "SobolOptions": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number",
          "description": "The number N of rows of each base matrix. The default is 4096."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The seed of the draws. The default is 1."
        },
        "scale": {
          "enum": [
            "measure",
            "model"
          ],
          "description": "The scale of the output. The value `measure` uses `predictResponse`. The value `model` uses the scale of the model, so a model with a log scale gives the indices of the logarithm. The default is `measure`."
        },
        "interval": {
          "$ref": "#/$defs/BootstrapOptions",
          "description": "With this option, each index also gets a percentile bootstrap interval over the N rows. Each run draws N rows with replacement, and it calculates all the indices from these rows. The default is no interval."
        }
      }
    },
    "Summary": {
      "type": "object",
      "properties": {
        "n": {
          "type": "number"
        },
        "mean": {
          "type": "number"
        },
        "sd": {
          "type": "number",
          "description": "The sample standard deviation, or NaN for one value."
        },
        "min": {
          "type": "number"
        },
        "q1": {
          "type": "number",
          "description": "The 0.25 quantile."
        },
        "median": {
          "type": "number"
        },
        "q3": {
          "type": "number",
          "description": "The 0.75 quantile."
        },
        "max": {
          "type": "number"
        },
        "iqr": {
          "type": "number",
          "description": "The interquartile range: q3 - q1."
        }
      },
      "required": [
        "n",
        "mean",
        "sd",
        "min",
        "q1",
        "median",
        "q3",
        "max",
        "iqr"
      ]
    },
    "TableResponseModel": {
      "type": "object",
      "properties": {
        "kind": {
          "const": "table"
        },
        "dimensions": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "conditional": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "The ids of the dimensions of the table with a condition. Only these dimensions take `null`."
        },
        "cells": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/ResponseTableCell"
          }
        },
        "fallback": {
          "type": "number",
          "description": "The value of a combination with no cell: the mean of all the fitted points, on the scale of the model."
        },
        "measure": {
          "type": "string",
          "description": "The id of the measure of the model."
        },
        "scale": {
          "enum": [
            "linear",
            "log"
          ],
          "description": "With `log`, the model and the held-out errors use the base-10 logarithm of the measure."
        },
        "floor": {
          "type": "number",
          "description": "With the scale `log`, the fit gave this value to each smaller measured value."
        }
      },
      "required": [
        "kind",
        "dimensions",
        "cells",
        "fallback",
        "measure",
        "scale"
      ]
    },
    "TwoSamplePermutationOptions": {
      "type": "object",
      "properties": {
        "runs": {
          "type": "number",
          "description": "The largest number of splits that the test reads. The default is 10 000."
        },
        "seed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "number"
            }
          ],
          "description": "The default is 1."
        },
        "statistic": {
          "type": "object",
          "description": "The statistic of the two groups. The default is the median of `a` minus the median of `b`.",
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
              "a",
              "b"
            ],
            "inputs": [
              {
                "type": "array",
                "items": {
                  "type": "number"
                }
              },
              {
                "type": "array",
                "items": {
                  "type": "number"
                }
              }
            ],
            "output": {
              "type": "number"
            }
          }
        }
      }
    },
    "TwoSamplePermutationResult": {
      "type": "object",
      "properties": {
        "exact": {
          "type": "boolean",
          "description": "This field is true when the test read each split, so the p has no noise from the draws."
        },
        "observed": {
          "type": "number",
          "description": "The statistic of the observed differences `candidate[i] - baseline[i]`."
        },
        "p": {
          "type": "number",
          "description": "The two-sided p: (1 + the flips with a statistic as far from 0 or farther) / (1 + runs)."
        },
        "runs": {
          "type": "number"
        }
      },
      "required": [
        "exact",
        "observed",
        "p",
        "runs"
      ]
    },
    "UStatisticInterval": {
      "type": "object",
      "properties": {
        "estimate": {
          "type": "number",
          "description": "The estimate of the total of the population: `S * C(n, r) / C(m, r)`, with `S` the total of the sample."
        },
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        },
        "level": {
          "type": "number"
        },
        "method": {
          "enum": [
            "conservative",
            "tight"
          ],
          "description": "The method that made the interval. It is not `requested` after a fallback or a choice of the method `\"auto\"`."
        },
        "requested": {
          "$ref": "#/$defs/UStatisticMethod",
          "description": "The method of the options."
        },
        "mean": {
          "$ref": "#/$defs/UStatisticMean",
          "description": "The mean of the kernel, with its interval."
        },
        "subsets": {
          "type": "number",
          "description": "The number of sets of `r` units in the population, `C(n, r)`."
        },
        "standardError": {
          "type": "number",
          "description": "The standard error of the total. Only an interval of the method `\"tight\"` has it."
        },
        "df": {
          "type": "number",
          "description": "The degrees of freedom of the t quantile, `m - 1`. Only an interval of the method `\"tight\"` has it."
        }
      },
      "required": [
        "estimate",
        "low",
        "high",
        "level",
        "method",
        "requested",
        "mean",
        "subsets"
      ]
    },
    "UStatisticMean": {
      "type": "object",
      "properties": {
        "estimate": {
          "type": "number",
          "description": "The U-statistic: the mean of the kernel over the sets of `r` units of the sample."
        },
        "low": {
          "type": "number"
        },
        "high": {
          "type": "number"
        }
      },
      "required": [
        "estimate",
        "low",
        "high"
      ]
    },
    "UStatisticMethod": {
      "enum": [
        "auto",
        "conservative",
        "tight"
      ]
    },
    "UStatisticOptions": {
      "type": "object",
      "properties": {
        "order": {
          "type": "number",
          "description": "The order `r` of the kernel: the number of units in each set. It is a whole number of 1 or more."
        },
        "population": {
          "type": "number",
          "description": "The number of units in the whole population, `n`. It is a whole number, and it is not less than the sample."
        },
        "method": {
          "$ref": "#/$defs/UStatisticMethod",
          "description": "The method of the interval. The methods `\"conservative\"` and `\"auto\"` need `range`."
        },
        "level": {
          "type": "number",
          "description": "The level of the interval. The default is 0.95."
        },
        "range": {
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
          "maxItems": 2,
          "description": "The smallest and the largest value of the kernel. With it, the interval stays in this range."
        }
      },
      "required": [
        "order",
        "population",
        "method"
      ]
    }
  },
  "procedures": [
    {
      "name": "addToRunning",
      "path": [
        "statistics",
        "addToRunning"
      ],
      "description": "This function gives the summary with one more value. It throws a RangeError for NaN, as the functions of a list do. The mean of each step is `sum / n`, so the mean of the fold is the mean of the list.",
      "params": [
        "s",
        "value"
      ],
      "input": {
        "type": "object",
        "properties": {
          "s": {
            "$ref": "#/$defs/RunningSummary"
          },
          "value": {
            "type": "number"
          }
        },
        "required": [
          "s",
          "value"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RunningSummary"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bestSmoothLaw",
      "path": [
        "statistics",
        "bestSmoothLaw"
      ],
      "description": "This function gives the smooth law with the highest likelihood. Under 300 values the result is not reliable: the normal and the log-normal law lose to the laws with a fitted end. The README gives the measured shares of correct results. The function throws as `smoothLawScores` does.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SmoothLaw"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "binomialInterval",
      "path": [
        "statistics",
        "binomialInterval"
      ],
      "description": "The central interval of a count X ~ Binomial(n, p). `low` is the smallest k with P(X <= k) > (1 - level) / 2. `high` is the largest k with P(X >= k) > (1 - level) / 2. Each tail outside the interval holds (1 - level) / 2 or less. The two tails are separate sums, so that a small upper tail keeps its digits.",
      "params": [
        "n",
        "p",
        "level"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "number"
          },
          "p": {
            "type": "number"
          },
          "level": {
            "type": "number"
          }
        },
        "required": [
          "n",
          "p"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/CountInterval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "binomialTest",
      "path": [
        "statistics",
        "binomialTest"
      ],
      "description": "This function gives the p of the exact one-sided binomial test of `k` successes in `n` trials, with X ~ Binomial(n, p). The side `\"less\"` gives `P(X <= k)`. A small value rejects the claim \"the chance is `p` or more\". The side `\"greater\"` gives `P(X >= k)`. A small value rejects the claim \"the chance is `p` or less\".",
      "params": [
        "k",
        "n",
        "p",
        "side"
      ],
      "input": {
        "type": "object",
        "properties": {
          "k": {
            "type": "number",
            "description": "The count of successes, a whole number from 0 to `n`."
          },
          "n": {
            "type": "number",
            "description": "The count of trials, a whole number of 0 or more."
          },
          "p": {
            "type": "number",
            "description": "The chance of a success under the claim, from 0 to 1."
          },
          "side": {
            "$ref": "#/$defs/BinomialSide",
            "description": "The side of the tail."
          }
        },
        "required": [
          "k",
          "n",
          "p",
          "side"
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
      "name": "bootstrap",
      "path": [
        "statistics",
        "bootstrap"
      ],
      "description": "A percentile bootstrap interval of `statistic` over `data`. A run whose statistic is not finite (NaN or an infinity) does not count. When no run is finite, low and high are equal to the estimate.",
      "params": [
        "data",
        "statistic",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "data": {
            "type": "array",
            "items": {}
          },
          "statistic": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (sample: readonly T[]) => number. It reads each parameter as {\"$ref\": \"<name>\"}: sample.",
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
                "sample"
              ],
              "inputs": [
                {
                  "type": "array",
                  "items": {}
                }
              ],
              "output": {
                "type": "number"
              }
            }
          },
          "options": {
            "$ref": "#/$defs/BootstrapOptions"
          }
        },
        "required": [
          "data",
          "statistic"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
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
      "name": "bootstrapClusters",
      "path": [
        "statistics",
        "bootstrapClusters"
      ],
      "description": "A cluster bootstrap: each run draws whole clusters with replacement, and the statistic reads the rows of the drawn clusters. Use it when the rows of one cluster (one board, one seed, one site) are not independent. The clusters are in the order of their first row.",
      "params": [
        "rows",
        "cluster",
        "statistic",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "rows": {
            "type": "array",
            "items": {}
          },
          "cluster": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (row: T) => string. It reads each parameter as {\"$ref\": \"<name>\"}: row.",
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
                "row"
              ],
              "inputs": [
                {}
              ],
              "output": {
                "type": "string"
              }
            }
          },
          "statistic": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (rows: readonly T[]) => number. It reads each parameter as {\"$ref\": \"<name>\"}: rows.",
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
                "rows"
              ],
              "inputs": [
                {
                  "type": "array",
                  "items": {}
                }
              ],
              "output": {
                "type": "number"
              }
            }
          },
          "options": {
            "$ref": "#/$defs/BootstrapOptions"
          }
        },
        "required": [
          "rows",
          "cluster",
          "statistic"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
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
      "name": "bootstrapLeastSquares",
      "path": [
        "statistics",
        "bootstrapLeastSquares"
      ],
      "description": "A percentile bootstrap interval of each coefficient of the least-squares fit of `y` on the rows of `x`. Each run draws `n` row indexes with replacement, and fits the drawn rows and their `y` values. All the intervals come from the same draws. The estimate of each interval is the coefficient of the fit of all the data. A run with a singular design gives NaN coefficients, so it does not count. The shape errors are the errors of `leastSquares`.",
      "params": [
        "x",
        "y",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "x": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "number"
              }
            }
          },
          "y": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "type": "object",
            "properties": {
              "runs": {
                "type": "number",
                "description": "The number of samples. The default is 10 000."
              },
              "level": {
                "type": "number",
                "description": "The level of the interval. The default is 0.95."
              },
              "seed": {
                "anyOf": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "number"
                  }
                ],
                "description": "The seed of the draws. The default is 1."
              },
              "method": {
                "enum": [
                  "higher",
                  "linear",
                  "nearest-rank"
                ],
                "description": "The quantile method of the two ends of the interval. The default is linear."
              },
              "ends": {
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
                "maxItems": 2,
                "description": "The quantiles of the two ends, in place of `level`, for example [0.025, 0.975] or an interval with one side. The default is from the level: (1 - level) / 2 and 1 - (1 - level) / 2. In floating point, (1 - 0.95) / 2 is not 0.025, so a copy that writes 0.025 needs this option to give the same numbers."
              },
              "against": {
                "type": "number",
                "description": "The value of a claim to test, for example 0 for \"no difference\". With this option, the interval also gives `pAbove` and `pBelow` from the same draws, so the ends do not change. The default is no value and no p."
              },
              "intercept": {
                "type": "boolean",
                "description": "When true, the fit adds an intercept as coefficient 0. The default is true."
              }
            }
          }
        },
        "required": [
          "x",
          "y"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/Interval"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bootstrapMedian",
      "path": [
        "statistics",
        "bootstrapMedian"
      ],
      "description": "A bootstrap interval of the median.",
      "params": [
        "values",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/BootstrapOptions"
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bootstrapMedianRatio",
      "path": [
        "statistics",
        "bootstrapMedianRatio"
      ],
      "description": "A bootstrap interval of the ratio `median(numerator) / median(denominator)` of two independent samples. The interval is the uncertainty of the ratio of the two medians. It is not the spread of the samples. A run whose denominator median is 0 is not finite, so it does not count.",
      "params": [
        "numerator",
        "denominator",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "numerator": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "denominator": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/BootstrapOptions"
          }
        },
        "required": [
          "numerator",
          "denominator"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bootstrapStrata",
      "path": [
        "statistics",
        "bootstrapStrata"
      ],
      "description": "A stratified bootstrap: each run draws, inside each stratum, as many items as the stratum has, with replacement. So each sample keeps the size of each stratum. Use it when the strata are fixed by the design, for example the families of the inputs of a benchmark. The draws of one run go through the strata in the order of the list. With one stratum, the draws are equal to the draws of `bootstrap` with the same seed. The estimate is the statistic of all the strata. A run whose statistic is not finite does not count.",
      "params": [
        "strata",
        "statistic",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "strata": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {}
            }
          },
          "statistic": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (samples: readonly (readonly T[])[]) => number. It reads each parameter as {\"$ref\": \"<name>\"}: samples.",
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
                "samples"
              ],
              "inputs": [
                {
                  "type": "array",
                  "items": {
                    "type": "array",
                    "items": {}
                  }
                }
              ],
              "output": {
                "type": "number"
              }
            }
          },
          "options": {
            "$ref": "#/$defs/BootstrapOptions"
          }
        },
        "required": [
          "strata",
          "statistic"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
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
      "name": "bootstrapTwo",
      "path": [
        "statistics",
        "bootstrapTwo"
      ],
      "description": "A percentile bootstrap interval of `statistic` over two independent samples `a` and `b`. Use it when the two samples are not paired, for example two arms of a benchmark. Each run draws `a.length` items of `a` with replacement, and then `b.length` items of `b` with replacement. All the draws come from one stream of `random(seed)`. The statistic reads the two drawn samples. The estimate is the statistic of all of `a` and `b`. A run whose statistic is not finite does not count. When no run is finite, low and high are equal to the estimate.",
      "params": [
        "a",
        "b",
        "statistic",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "array",
            "items": {}
          },
          "b": {
            "type": "array",
            "items": {}
          },
          "statistic": {
            "type": "object",
            "description": "One call of a pure procedure, as data, for the function (a: readonly A[], b: readonly B[]) => number. It reads each parameter as {\"$ref\": \"<name>\"}: a, b.",
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
                "a",
                "b"
              ],
              "inputs": [
                {
                  "type": "array",
                  "items": {}
                },
                {
                  "type": "array",
                  "items": {}
                }
              ],
              "output": {
                "type": "number"
              }
            }
          },
          "options": {
            "$ref": "#/$defs/BootstrapOptions"
          }
        },
        "required": [
          "a",
          "b",
          "statistic"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
      },
      "generics": [
        "A",
        "B"
      ],
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bradleyTerry",
      "path": [
        "statistics",
        "bradleyTerry"
      ],
      "description": "The Bradley-Terry fit of `comparisons` among `items` items. The function does not sort or change its inputs. An empty list of comparisons gives the prior for each item. The function throws a RangeError for a bad index, a bad outcome, a bad weight and a bad option.",
      "params": [
        "items",
        "comparisons",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "items": {
            "type": "number"
          },
          "comparisons": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/PairComparison"
            }
          },
          "options": {
            "$ref": "#/$defs/BradleyTerryOptions"
          }
        },
        "required": [
          "items",
          "comparisons"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/BradleyTerryFit"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "bradleyTerrySparse",
      "path": [
        "statistics",
        "bradleyTerrySparse"
      ],
      "description": "The sparse Bradley-Terry fit of `comparisons` among `items` items. It has the model, the options and the checks of `bradleyTerry`, and its memory is in proportion to `items` plus the distinct pairs. The function does not sort or change its inputs. It throws a RangeError for a bad index, a bad outcome, a bad weight and a bad option.",
      "params": [
        "items",
        "comparisons",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "items": {
            "type": "number"
          },
          "comparisons": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/PairComparison"
            }
          },
          "options": {
            "$ref": "#/$defs/BradleyTerrySparseOptions"
          }
        },
        "required": [
          "items",
          "comparisons"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/BradleyTerrySparseFit"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "brier",
      "path": [
        "statistics",
        "brier"
      ],
      "description": "The Brier score: the mean of (p - outcome)^2. 0 is perfect, and 0.25 is a constant 0.5. Lower is better.",
      "params": [
        "forecasts"
      ],
      "input": {
        "type": "object",
        "properties": {
          "forecasts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Forecast"
            }
          }
        },
        "required": [
          "forecasts"
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
      "name": "calibration",
      "path": [
        "statistics",
        "calibration"
      ],
      "description": "The hit rate of each stated level, from the lowest level.",
      "params": [
        "forecasts"
      ],
      "input": {
        "type": "object",
        "properties": {
          "forecasts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Forecast"
            }
          }
        },
        "required": [
          "forecasts"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/CalibrationLevel"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "choosePair",
      "path": [
        "statistics",
        "choosePair"
      ],
      "description": "The choice of the next pair of a duel from a pool of rated items. The pool goes in the order of the ratings, from the highest. These are the steps:",
      "params": [
        "items",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "items": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/RatedItem"
            }
          },
          "options": {
            "$ref": "#/$defs/PairChoiceOptions_T"
          }
        },
        "required": [
          "items",
          "options"
        ],
        "additionalProperties": false
      },
      "output": {
        "anyOf": [
          {
            "$ref": "#/$defs/PairChoice"
          },
          {
            "type": "null"
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
      "name": "cohenKappa",
      "path": [
        "statistics",
        "cohenKappa"
      ],
      "description": "Cohen's kappa of two raters (Cohen, 1960). Item `i` has the category `a[i]` from one rater and `b[i]` from the other. Two categories are the same when they are `===`. A kappa of 1 is full agreement, and 0 is the agreement of chance.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "array",
            "items": {}
          },
          "b": {
            "type": "array",
            "items": {}
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Kappa"
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
      "name": "compareRatios",
      "path": [
        "statistics",
        "compareRatios"
      ],
      "description": "The comparison of a candidate with a baseline, from the ratio candidate / baseline of each input. It answers the three questions of a promotion. How often is the candidate better? By how much? How often is it worse beyond the noise? A promotion reads `gains` against `drops` and `effect`, not `signP` alone, because a sign test counts a win of any size.",
      "params": [
        "ratios",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ratios": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/CompareOptions"
          }
        },
        "required": [
          "ratios"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Comparison"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "coverageMinSample",
      "path": [
        "statistics",
        "coverageMinSample"
      ],
      "description": "This function applies a fixed bar of coverage to the cells of a study. It gives the smallest sample size `m` from which an interval method keeps its level. The method qualifies at `m` when the cells with a sample of `m` or more pass two tests:",
      "params": [
        "cells",
        "bar"
      ],
      "input": {
        "type": "object",
        "properties": {
          "cells": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/CoverageCell"
            },
            "description": "The hits and the draws of each cell. Each cell has its own sample size."
          },
          "bar": {
            "$ref": "#/$defs/CoverageBar",
            "description": "The level, the alpha of the Holm family and the pooled lower end."
          }
        },
        "required": [
          "cells",
          "bar"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/CoverageMinSample"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "eloExpected",
      "path": [
        "statistics",
        "eloExpected"
      ],
      "description": "The expected score of the first item against the second item: `1 / (1 + base ** ((rb - ra) / scale))`. A win counts 1, a tie 0.5 and a loss 0. The expected score of the second item is 1 minus this value.",
      "params": [
        "ra",
        "rb",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ra": {
            "type": "number"
          },
          "rb": {
            "type": "number"
          },
          "options": {
            "$ref": "#/$defs/RatingScale"
          }
        },
        "required": [
          "ra",
          "rb"
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
      "name": "eloReplay",
      "path": [
        "statistics",
        "eloReplay"
      ],
      "description": "The Elo ratings of `items` items after each pick of `comparisons`, in the order of the list. Each item starts at `start`. The update of each pick is `eloUpdate` with the options. The order of the picks changes the result.",
      "params": [
        "items",
        "comparisons",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "items": {
            "type": "number"
          },
          "comparisons": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/PairComparison"
            }
          },
          "options": {
            "$ref": "#/$defs/EloReplayOptions"
          }
        },
        "required": [
          "items",
          "comparisons"
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
      "name": "eloUpdate",
      "path": [
        "statistics",
        "eloUpdate"
      ],
      "description": "The Elo update of a pair after one result. The `score` is the score of the first item: 1 for a win, 0.5 for a tie and 0 for a loss. Each rating moves by `k` times the difference between the score and the expected score. Thus the sum of the two ratings does not change.",
      "params": [
        "ra",
        "rb",
        "score",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "ra": {
            "type": "number"
          },
          "rb": {
            "type": "number"
          },
          "score": {
            "type": "number"
          },
          "options": {
            "$ref": "#/$defs/EloOptions"
          }
        },
        "required": [
          "ra",
          "rb",
          "score"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/EloUpdate"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fitRatings",
      "path": [
        "statistics",
        "fitRatings"
      ],
      "description": "The log-strengths of `items` items with one rating model. The model `\"bradley-terry\"` uses `bradleyTerry`, or `bradleyTerrySparse` above `denseLimit` items. The models `\"elo\"` and `\"glicko2\"` use `eloReplay` and `glicko2Replay`, and they refuse a weight other than 1. A log of 0 items gives empty lists.",
      "params": [
        "model",
        "items",
        "comparisons",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "model": {
            "$ref": "#/$defs/RatingModel"
          },
          "items": {
            "type": "number"
          },
          "comparisons": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/PairComparison"
            }
          },
          "options": {
            "$ref": "#/$defs/RatingFitOptions"
          }
        },
        "required": [
          "model",
          "items",
          "comparisons"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RatingFit"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "fitResponse",
      "path": [
        "statistics",
        "fitResponse"
      ],
      "description": "This function fits each measure of `data`, and it gives a record with the models and the folds.",
      "params": [
        "data",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "data": {
            "$ref": "#/$defs/ResponseData"
          },
          "options": {
            "$ref": "#/$defs/ResponseFitOptions"
          }
        },
        "required": [
          "data"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/ResponseRecord"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "glicko2Idle",
      "path": [
        "statistics",
        "glicko2Idle"
      ],
      "description": "The Glicko-2 rating of a player after a rating period with no games. The rating and the volatility stay the same. The RD grows to `sqrt(RD^2 + (173.7178 * volatility)^2)`.",
      "params": [
        "player"
      ],
      "input": {
        "type": "object",
        "properties": {
          "player": {
            "$ref": "#/$defs/Glicko2Rating"
          }
        },
        "required": [
          "player"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Glicko2Rating"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "glicko2Replay",
      "path": [
        "statistics",
        "glicko2Replay"
      ],
      "description": "The Glicko-2 ratings of `items` items after each pick of `comparisons`, in the order of the list. Each pick is one rating period of its two items. Each item of a pick gets `glicko2Update` against the rating of the other item before the pick. An item that is not in a pick does not change in that period. The order of the picks changes the result.",
      "params": [
        "items",
        "comparisons",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "items": {
            "type": "number"
          },
          "comparisons": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/PairComparison"
            }
          },
          "options": {
            "$ref": "#/$defs/Glicko2ReplayOptions"
          }
        },
        "required": [
          "items",
          "comparisons"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/Glicko2Rating"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "glicko2Update",
      "path": [
        "statistics",
        "glicko2Update"
      ],
      "description": "The Glicko-2 update of one player after one rating period (Glickman, \"Example of the Glicko-2 system\", 2012). The function uses the Illinois algorithm for the new volatility. The games use the ratings of the opponents from the start of the period. An empty list of games gives `glicko2Idle(player)`.",
      "params": [
        "player",
        "games",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "player": {
            "$ref": "#/$defs/Glicko2Rating"
          },
          "games": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Glicko2Game"
            }
          },
          "options": {
            "$ref": "#/$defs/Glicko2Options"
          }
        },
        "required": [
          "player",
          "games"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Glicko2Rating"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "heldOutError",
      "path": [
        "statistics",
        "heldOutError"
      ],
      "description": "This function gives the held-out error of a measure over all the folds. Each point has the same weight, so a small fold has a small effect. The function throws a RangeError when no fold has the measure.",
      "params": [
        "record",
        "measure"
      ],
      "input": {
        "type": "object",
        "properties": {
          "record": {
            "type": "object",
            "properties": {
              "folds": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/ResponseFold"
                }
              }
            },
            "required": [
              "folds"
            ]
          },
          "measure": {
            "type": "string"
          }
        },
        "required": [
          "record",
          "measure"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/ResponseHeldOutError"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "heldOutErrorAt",
      "path": [
        "statistics",
        "heldOutErrorAt"
      ],
      "description": "This function gives the held-out error of a chosen set of points, on the scale of the model. It uses the stored predictions of the option `outOfFold`. Thus a reader can get the error of one cell. The result has the fields of `heldOutError`, and the set of all the points gives the same values to the rounding of the sums.",
      "params": [
        "record",
        "measure",
        "ids"
      ],
      "input": {
        "type": "object",
        "properties": {
          "record": {
            "$ref": "#/$defs/ResponseRecord"
          },
          "measure": {
            "type": "string"
          },
          "ids": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        },
        "required": [
          "record",
          "measure",
          "ids"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/ResponseHeldOutError"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "holm",
      "path": [
        "statistics",
        "holm"
      ],
      "description": "The Holm step-down correction of a family of tests (Holm, 1979). It keeps the chance of one false claim or more in the family at most `level`. It has no condition on how the tests depend on each other. The result is in the order of the input.",
      "params": [
        "pValues",
        "level"
      ],
      "input": {
        "type": "object",
        "properties": {
          "pValues": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "level": {
            "type": "number"
          }
        },
        "required": [
          "pValues"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/Corrected"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "kendallTau",
      "path": [
        "statistics",
        "kendallTau"
      ],
      "description": "The Kendall tau-b of two lists (Kendall, 1938). The value is from -1 to 1. A pair with a tie in both lists does not count. When the lists have fewer than 2 values, or no pair counts, the value is 1. Above `KENDALL_EXACT` values, a seeded sample of 200 000 pairs gives an estimate. It is equal to the copy in highways.",
      "params": [
        "a",
        "b",
        "seed"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "b": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
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
      "name": "leastSquares",
      "path": [
        "statistics",
        "leastSquares"
      ],
      "description": "The ordinary least-squares fit of `y` on the rows of `x`, with `k` coefficients. Each row has the same number of predictors. The fit solves the problem with a Householder QR decomposition. When the design does not have full rank, or when `n <= k`, the coefficients, `residualSd` and `r2` are NaN. When the total sum of squares is 0, `r2` is NaN.",
      "params": [
        "x",
        "y",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "x": {
            "type": "array",
            "items": {
              "type": "array",
              "items": {
                "type": "number"
              }
            }
          },
          "y": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/LeastSquaresOptions"
          }
        },
        "required": [
          "x",
          "y"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/LeastSquaresFit"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "logLoss",
      "path": [
        "statistics",
        "logLoss"
      ],
      "description": "The log-loss of predictions: the mean of `-ln(p)` for a hit and `-ln(1 - p)` for a miss. 0 is perfect, and `ln(2)` is a constant 0.5. Lower is better. A p of 0 for a hit gives Infinity. For an outcome of three values, give the probability of the observed outcome as `p`, with `hit` true.",
      "params": [
        "forecasts"
      ],
      "input": {
        "type": "object",
        "properties": {
          "forecasts": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/Forecast"
            }
          }
        },
        "required": [
          "forecasts"
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
      "name": "mean",
      "path": [
        "statistics",
        "mean"
      ],
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
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
      "name": "median",
      "path": [
        "statistics",
        "median"
      ],
      "description": "The median: the middle value, or the midpoint `(a + b) / 2` of the two middle values. The midpoint is correctly rounded. `quantile(values, 0.5)` computes `a + 0.5 * (b - a)`, which can differ from it in the last bit.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
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
      "name": "medianInterval",
      "path": [
        "statistics",
        "medianInterval"
      ],
      "description": "The distribution-free interval of the median of a sample. It needs no assumption about the shape of the distribution. It is x_(k) to x_(n + 1 - k), for the largest k whose two tails each hold (1 - level) / 2 or less. For 11 values at the level 0.95, it is x_(2) to x_(10), with the coverage 0.988.",
      "params": [
        "values",
        "level"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "level": {
            "type": "number"
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/MedianInterval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "mergeRunning",
      "path": [
        "statistics",
        "mergeRunning"
      ],
      "description": "This function gives the summary of the values of two summaries (Chan, Golub and LeVeque, 1979). Thus parallel jobs can each summarize a part. The sum of the merge adds the two sums, so it can differ from the fold in the last bits.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/RunningSummary"
          },
          "b": {
            "$ref": "#/$defs/RunningSummary"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RunningSummary"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "modeCount",
      "path": [
        "statistics",
        "modeCount"
      ],
      "description": "This function counts the modes of a sample. A mode counts when it holds `minShare` of the mass. The default counts the modes that hold 10 percent, and a caller who needs all modes passes a smaller value. The result is at least 1. The result is the same for `x` and `-x`.",
      "params": [
        "values",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/ModeOptions"
          }
        },
        "required": [
          "values"
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
      "name": "negativeBinomialInterval",
      "path": [
        "statistics",
        "negativeBinomialInterval"
      ],
      "description": "The central interval of a negative binomial count. X is the count of failures before `successes` successes, and `p` is the chance of a success at each try. `low` is the smallest k with P(X <= k) > (1 - level) / 2. `high` is the smallest k with P(X <= k) >= 1 - (1 - level) / 2.",
      "params": [
        "successes",
        "p",
        "level"
      ],
      "input": {
        "type": "object",
        "properties": {
          "successes": {
            "type": "number"
          },
          "p": {
            "type": "number"
          },
          "level": {
            "type": "number"
          }
        },
        "required": [
          "successes",
          "p"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/CountInterval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "noiseFloor",
      "path": [
        "statistics",
        "noiseFloor"
      ],
      "description": "The noise floor of a measure: k sample standard deviations of its value over independent seeds or folds. When the margin of practical effect is larger, the floor is the margin. A difference smaller than the floor is not a result.",
      "params": [
        "values",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/NoiseOptions"
          }
        },
        "required": [
          "values"
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
      "name": "noiseVerdict",
      "path": [
        "statistics",
        "noiseVerdict"
      ],
      "description": "The noise rule of a difference (candidate minus baseline) over independent seeds or folds: the mean against max(k standard deviations, margin). With `better: \"lower\"`, a negative mean is the gain. When each value is equal, the state is \"no-spread\" and not a result, also when the mean is beyond the margin. Find out why the seeds do not change the value before you read the difference.",
      "params": [
        "values",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "type": "object",
            "properties": {
              "k": {
                "type": "number",
                "description": "The number of standard deviations. The default is 2."
              },
              "minimum": {
                "type": "number",
                "description": "The fewest values (seeds or folds) that give a floor. The default is 5, the 5-seed rule."
              },
              "margin": {
                "type": "number",
                "description": "The margin of practical effect, in the units of the values. A difference that is real but smaller than the margin is too small to matter, so it is not a result. Give the reason of the margin from the problem of the user. The default is 0: no margin."
              },
              "better": {
                "enum": [
                  "higher",
                  "lower"
                ]
              }
            }
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/NoiseVerdict"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "normalCdf",
      "path": [
        "statistics",
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
        "statistics",
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
      "name": "optionFloor",
      "path": [
        "statistics",
        "optionFloor"
      ],
      "description": "This function gives the smallest count of values for each of two options. With it, one test finds a difference of `delta` with the stated power. The form is `n = 2 ((t(1 - alpha / (2 tests), df) + t(power, df)) sigma / delta)^2`, with `df = 2 n - 2`. The count is on both sides of that form, so the function takes the first count that meets it.",
      "params": [
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "options": {
            "$ref": "#/$defs/OptionFloorOptions",
            "description": "The spread, the difference, the family and the targets."
          }
        },
        "required": [
          "options"
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
      "name": "pairInformation",
      "path": [
        "statistics",
        "pairInformation"
      ],
      "description": "The expected information of a pick between two items: `p * (1 - p) * (ua^2 + ub^2)`. Here `p` is `eloExpected` of the two ratings, and `ua` and `ub` are the uncertainties. The value is high when the result is not sure (a `p` near 0.5) and the two ratings are not sure.",
      "params": [
        "a",
        "b",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "$ref": "#/$defs/RatedItem"
          },
          "b": {
            "$ref": "#/$defs/RatedItem"
          },
          "options": {
            "$ref": "#/$defs/RatingScale"
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
      "name": "pairProbabilities",
      "path": [
        "statistics",
        "pairProbabilities"
      ],
      "description": "The probabilities of a pair under the Bradley-Terry model with Davidson (1970) ties. The inputs are the log-strengths of the two items and the tie parameter `tie` of `bradleyTerry`. With `tie` 0, the probability that the first item wins is `1 / (1 + exp(sb - sa))`. A constant added to the two strengths changes no probability.",
      "params": [
        "sa",
        "sb",
        "tie"
      ],
      "input": {
        "type": "object",
        "properties": {
          "sa": {
            "type": "number"
          },
          "sb": {
            "type": "number"
          },
          "tie": {
            "type": "number"
          }
        },
        "required": [
          "sa",
          "sb"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/PairProbabilities"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "pairedPermutation",
      "path": [
        "statistics",
        "pairedPermutation"
      ],
      "description": "The paired permutation test (a random sign flip of each difference). It needs no normal distribution and uses the size of each difference, which the sign test does not. A pair with a difference of 0 adds nothing.",
      "params": [
        "candidate",
        "baseline",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "candidate": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "baseline": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/PermutationOptions"
          }
        },
        "required": [
          "candidate",
          "baseline"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/PermutationResult"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "parseResponseRecord",
      "path": [
        "statistics",
        "parseResponseRecord"
      ],
      "description": "This function examines unknown data, for example the result of `JSON.parse`, against `response-records/1`. It gives `{ ok: true, record }`, with the same object as the record, or `{ ok: false, faults }`. Each fault has the path of the bad field and a message. The function does not throw. Data that the checks cannot read, for example an object with a loop, gives one fault.",
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
        "$ref": "#/$defs/ParsedResponseRecord"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "partialConjunction",
      "path": [
        "statistics",
        "partialConjunction"
      ],
      "description": "The p of the claim \"at least `need` of these tests have a real effect\" (Benjamini and Heller, 2008). The value is `(m - need + 1)` times the `need`-th smallest p, at most 1. It has no condition on how the tests depend on each other. With 2 tests and `need` 2, the value is the larger p.",
      "params": [
        "pValues",
        "need"
      ],
      "input": {
        "type": "object",
        "properties": {
          "pValues": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "need": {
            "type": "number"
          }
        },
        "required": [
          "pValues",
          "need"
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
      "name": "predictResponse",
      "path": [
        "statistics",
        "predictResponse"
      ],
      "description": "This function gives the value of a model at `inputs`, on the scale of the measure. The inputs have a value for each dimension that the model reads. An absent conditional dimension has `null`. A table model gives its `fallback` for a combination with no cell.",
      "params": [
        "model",
        "inputs"
      ],
      "input": {
        "type": "object",
        "properties": {
          "model": {
            "$ref": "#/$defs/ResponseModel"
          },
          "inputs": {
            "type": "object",
            "properties": {},
            "additionalProperties": {
              "$ref": "#/$defs/ResponseInputValue"
            }
          }
        },
        "required": [
          "model",
          "inputs"
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
      "name": "quantile",
      "path": [
        "statistics",
        "quantile"
      ],
      "description": "The `p` quantile of a list.",
      "params": [
        "values",
        "p",
        "method"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "p": {
            "type": "number"
          },
          "method": {
            "enum": [
              "higher",
              "linear",
              "nearest-rank"
            ]
          }
        },
        "required": [
          "values",
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
      "name": "quantileInterval",
      "path": [
        "statistics",
        "quantileInterval"
      ],
      "description": "This function gives the distribution-free interval of the quantile `p` of a sample. Each tail outside the interval holds (1 - level) / 2 or less. Let X ~ Binomial(n, p). The lower rank is the largest l with P(X <= l - 1) in the tail. The upper rank is the smallest u with P(X >= u) in the tail. The values must be independent draws, or the coverage is false.",
      "params": [
        "values",
        "p",
        "level"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "p": {
            "type": "number"
          },
          "level": {
            "type": "number"
          }
        },
        "required": [
          "values",
          "p"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/QuantileInterval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "quantileSamples",
      "path": [
        "statistics",
        "quantileSamples"
      ],
      "description": "This function gives the fewest independent values that give the quantile `p` an upper bound at `level`: the smallest n with p^n <= (1 - level) / 2. With that n, the upper bound is the largest value. At the level 0.95, p95 needs 72 values, p99 needs 368 values and p99.9 needs 3,688 values.",
      "params": [
        "p",
        "level"
      ],
      "input": {
        "type": "object",
        "properties": {
          "p": {
            "type": "number"
          },
          "level": {
            "type": "number"
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
      "name": "quantileSorted",
      "path": [
        "statistics",
        "quantileSorted"
      ],
      "description": "The `p` quantile of a list that is already sorted. Use it when you take several quantiles of one list. The linear method gives the same numbers as the copies in highways, packing and layout-contract. The nearest-rank method gives the same numbers as the copies in lag, lag-hud and the backtest of highways. The higher method gives the upper median of the copies in highways with `p = 0.5`.",
      "params": [
        "sortedValues",
        "p",
        "method"
      ],
      "input": {
        "type": "object",
        "properties": {
          "sortedValues": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "p": {
            "type": "number"
          },
          "method": {
            "enum": [
              "higher",
              "linear",
              "nearest-rank"
            ]
          }
        },
        "required": [
          "sortedValues",
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
      "name": "ranks",
      "path": [
        "statistics",
        "ranks"
      ],
      "description": "The ranks of the values, from 1. Equal values get the mean of their ranks.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
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
      "name": "ratingToStrength",
      "path": [
        "statistics",
        "ratingToStrength"
      ],
      "description": "The log-strength of a rating. It is the inverse of `strengthToRating` with the same options.",
      "params": [
        "rating",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "rating": {
            "type": "number"
          },
          "options": {
            "$ref": "#/$defs/RatingScale"
          }
        },
        "required": [
          "rating"
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
      "name": "ratingUncertainty",
      "path": [
        "statistics",
        "ratingUncertainty"
      ],
      "description": "The uncertainty of a rating, in rating points: its standard error, or `RATING_START_UNCERTAINTY / sqrt(1 + picks)`.",
      "params": [
        "item"
      ],
      "input": {
        "type": "object",
        "properties": {
          "item": {
            "type": "object",
            "properties": {
              "se": {
                "type": "number",
                "description": "The standard error of the rating, in rating points, or `undefined` when the model gives none."
              },
              "picks": {
                "type": "number",
                "description": "The number of picks of the item."
              }
            },
            "required": [
              "picks"
            ]
          }
        },
        "required": [
          "item"
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
      "name": "responseCells",
      "path": [
        "statistics",
        "responseCells"
      ],
      "description": "This function gives the number of fitted places of a view before the view starts: the product of the lengths of its axes. A level axis counts its levels, and a continuous axis counts `steps`. The field `nearest` reads each point at each place, so the reads of a view are this count times the number of points. The default of `steps` is the default of a view. The function throws a RangeError for an unknown dimension, for one dimension named two times, and for a bad `steps`.",
      "params": [
        "record",
        "vary",
        "steps"
      ],
      "input": {
        "type": "object",
        "properties": {
          "record": {
            "type": "object",
            "properties": {
              "dimensions": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/ResponseDimension"
                }
              }
            },
            "required": [
              "dimensions"
            ]
          },
          "vary": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "array",
                "prefixItems": [
                  {
                    "type": "string"
                  },
                  {
                    "type": "string"
                  }
                ],
                "minItems": 2,
                "maxItems": 2
              }
            ]
          },
          "steps": {
            "type": "number"
          }
        },
        "required": [
          "record",
          "vary"
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
      "name": "ridgeSolve",
      "path": [
        "statistics",
        "ridgeSolve"
      ],
      "description": "This function gives the coefficients `beta` that solve `(gram + lambda * P) beta = moment`. - `gram` is the symmetric matrix `X'X` of size `k`, in row order. The function reads only its lower triangle. - `moment` is the vector `X'y` of length `k`. - With `lambda` 0, the result is the ordinary least-squares fit.",
      "params": [
        "gram",
        "moment",
        "lambda",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "gram": {
            "type": "object",
            "properties": {
              "length": {
                "type": "number"
              }
            },
            "required": [
              "length"
            ]
          },
          "moment": {
            "type": "object",
            "properties": {
              "length": {
                "type": "number"
              }
            },
            "required": [
              "length"
            ]
          },
          "lambda": {
            "type": "number"
          },
          "options": {
            "$ref": "#/$defs/RidgeOptions"
          }
        },
        "required": [
          "gram",
          "moment",
          "lambda"
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
      "name": "runningMean",
      "path": [
        "statistics",
        "runningMean"
      ],
      "description": "This function gives the mean of the values: `sum / n`. It throws a RangeError for the empty summary.",
      "params": [
        "s"
      ],
      "input": {
        "type": "object",
        "properties": {
          "s": {
            "$ref": "#/$defs/RunningSummary"
          }
        },
        "required": [
          "s"
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
      "name": "runningOf",
      "path": [
        "statistics",
        "runningOf"
      ],
      "description": "This function gives the summary of the values of a list or another iterable, in their order.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "x-procedures-codec": "iterable"
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RunningSummary"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "runningSd",
      "path": [
        "statistics",
        "runningSd"
      ],
      "description": "This function gives the sample standard deviation of the values (the divisor is n - 1). It needs 2 values or more. Equal values give exactly 0, as `sd` gives. A rounding error cannot make the result NaN.",
      "params": [
        "s"
      ],
      "input": {
        "type": "object",
        "properties": {
          "s": {
            "$ref": "#/$defs/RunningSummary"
          }
        },
        "required": [
          "s"
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
      "name": "sampleTotalInterval",
      "path": [
        "statistics",
        "sampleTotalInterval"
      ],
      "description": "A bootstrap interval of the total of a population from a uniform sample of `m` of its `n` items, drawn without replacement. The estimate is `scale * sum(values)`. Each run draws `m` values with replacement, as `bootstrap` does. The deviation of each run from the sum of the sample gets the factor `scale * sqrt(1 - m / n)`, the finite population correction. When `m` is `n`, the interval is the estimate.",
      "params": [
        "values",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/SampleTotalOptions"
          }
        },
        "required": [
          "values",
          "options"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Interval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sd",
      "path": [
        "statistics",
        "sd"
      ],
      "description": "The sample standard deviation (the divisor is n - 1). It needs 2 values or more. Equal values give exactly 0. The rounding of the mean gives a small number that is not 0 for some equal values, so the function examines them first.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
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
      "name": "selectRatingModel",
      "path": [
        "statistics",
        "selectRatingModel"
      ],
      "description": "The choice of a rating model by the log-loss on held-out picks. Each model learns from the first picks of the log and forecasts the last `holdout` part. All models use the tie parameter of the Bradley-Terry fit of the first picks. Thus the strengths are the only difference. Two equal scores keep the order of `models`. Each pick has the weight 1.",
      "params": [
        "items",
        "comparisons",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "items": {
            "type": "number"
          },
          "comparisons": {
            "type": "array",
            "items": {
              "$ref": "#/$defs/PairComparison"
            }
          },
          "options": {
            "$ref": "#/$defs/RatingModelOptions"
          }
        },
        "required": [
          "items",
          "comparisons"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/RatingModelChoice"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "signFlipTest",
      "path": [
        "statistics",
        "signFlipTest"
      ],
      "description": "The sign-flip test of a sum of terms. Under the null, each term has the sign + or - with equal chance. The statistic is the absolute value of the sum. A weighted mean of paired differences is such a sum: give the terms `w[i] * d[i]`.",
      "params": [
        "terms",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "terms": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/SignFlipOptions"
          }
        },
        "required": [
          "terms"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SignFlipResult"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "signTest",
      "path": [
        "statistics",
        "signTest"
      ],
      "description": "The sign test of paired results: `better` inputs where the candidate wins and `worse` where it loses. The ties do not count. One-sided (the default), it is the p of `better` wins or more if the two are equal. Two-sided, it is two times the tail of the larger count, at most 1. The one-sided p is equal to `signTestP` of packing.",
      "params": [
        "better",
        "worse",
        "sides"
      ],
      "input": {
        "type": "object",
        "properties": {
          "better": {
            "type": "number"
          },
          "worse": {
            "type": "number"
          },
          "sides": {
            "enum": [
              1,
              2
            ]
          }
        },
        "required": [
          "better",
          "worse"
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
      "name": "signTestPower",
      "path": [
        "statistics",
        "signTestPower"
      ],
      "description": "The smallest number of wins out of `n` that the sign test calls significant at `level`. It is undefined when even n wins out of n are not enough. Use it before a run, to know how many inputs a claim needs.",
      "params": [
        "n",
        "level",
        "sides"
      ],
      "input": {
        "type": "object",
        "properties": {
          "n": {
            "type": "number"
          },
          "level": {
            "type": "number"
          },
          "sides": {
            "enum": [
              1,
              2
            ]
          }
        },
        "required": [
          "n"
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
      "name": "sliceResponse",
      "path": [
        "statistics",
        "sliceResponse"
      ],
      "description": "This function gives a view of a measure over one dimension of a parsed record: - `curve`: the fitted value at each level, or at `steps` values of a continuous dimension, with its band. - `points`: the measured points that match the held values. This list is empty when no point matches them. - `absent`: the points that match the held values and have no value of the measure, each with its reason. A chart can draw each reason apart. - `held`: the value of each other dimension. - `error`: the held-out error.",
      "params": [
        "record",
        "measure",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "record": {
            "$ref": "#/$defs/ResponseRecord"
          },
          "measure": {
            "type": "string"
          },
          "options": {
            "$ref": "#/$defs/ResponseSliceOptions"
          }
        },
        "required": [
          "record",
          "measure",
          "options"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/ResponseSlice"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "smoothLawScores",
      "path": [
        "statistics",
        "smoothLawScores"
      ],
      "description": "This function gives the mean log density of the values under each smooth law, at the closed-form fit of that law. Each law has 2 fitted numbers, so the function adds no penalty. The uniform, the shifted exponential and the Pareto law take the smallest value as their lower limit. This fitted end helps them at small sizes. All values are exact maximum likelihoods. The function throws a RangeError for an empty list, for a value that is not positive and finite, or for equal values.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "type": "array",
        "items": {
          "$ref": "#/$defs/SmoothLawScore"
        }
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sobolIndices",
      "path": [
        "statistics",
        "sobolIndices"
      ],
      "description": "This function gives the first-order and the total Sobol index of each dimension of a record, for the model of `measure`. The indices are of the prediction of the model, not of the measured points.",
      "params": [
        "record",
        "measure",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "record": {
            "type": "object",
            "properties": {
              "dimensions": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/ResponseDimension"
                }
              },
              "models": {
                "type": "array",
                "items": {
                  "$ref": "#/$defs/ResponseModel"
                }
              }
            },
            "required": [
              "dimensions",
              "models"
            ]
          },
          "measure": {
            "type": "string"
          },
          "options": {
            "$ref": "#/$defs/SobolOptions"
          }
        },
        "required": [
          "record",
          "measure"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/SobolIndices"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "sorted",
      "path": [
        "statistics",
        "sorted"
      ],
      "description": "A new list with the values from the smallest to the largest.",
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
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
      "name": "spearman",
      "path": [
        "statistics",
        "spearman"
      ],
      "description": "The Spearman rank correlation: the Pearson correlation of the ranks, with mean ranks for ties. The value is from -1 to 1. When one list has no spread, the value is 0. It is equal to the copy in the backtest of highways.",
      "params": [
        "a",
        "b"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "b": {
            "type": "array",
            "items": {
              "type": "number"
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
        "type": "number"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "strengthToRating",
      "path": [
        "statistics",
        "strengthToRating"
      ],
      "description": "The rating of a log-strength: `center + scale * strength / ln(base)`. The defaults give `1500 + 400 * log10(e) * strength`. Thus `eloExpected` of two ratings is the Bradley-Terry win probability.",
      "params": [
        "strength",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "strength": {
            "type": "number"
          },
          "options": {
            "$ref": "#/$defs/RatingScale"
          }
        },
        "required": [
          "strength"
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
      "name": "summarize",
      "path": [
        "statistics",
        "summarize"
      ],
      "params": [
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "values": {
            "type": "array",
            "items": {
              "type": "number"
            }
          }
        },
        "required": [
          "values"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Summary"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "surfaceResponse",
      "path": [
        "statistics",
        "surfaceResponse"
      ],
      "description": "This function gives the view of `sliceResponse` over two dimensions. The fields `x` and `y` are the two axes, and `cells` has one row for each value of `y`. The rules of the held values, of the matching points and of the band are the rules of `sliceResponse`. The function also throws a RangeError when the two varied dimensions are one dimension. It throws when a conditional dimension varies with its parent, and when two varied dimensions need no common level.",
      "params": [
        "record",
        "measure",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "record": {
            "$ref": "#/$defs/ResponseRecord"
          },
          "measure": {
            "type": "string"
          },
          "options": {
            "$ref": "#/$defs/ResponseSurfaceOptions"
          }
        },
        "required": [
          "record",
          "measure",
          "options"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/ResponseSurface"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "tQuantile",
      "path": [
        "statistics",
        "tQuantile"
      ],
      "description": "This function gives the quantile of the Student t law, from a bisection of its distribution function.",
      "params": [
        "p",
        "df"
      ],
      "input": {
        "type": "object",
        "properties": {
          "p": {
            "type": "number",
            "description": "The share of the law below the result, above 0 and below 1."
          },
          "df": {
            "type": "number",
            "description": "The degrees of freedom, above 0."
          }
        },
        "required": [
          "p",
          "df"
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
      "name": "twoSamplePermutation",
      "path": [
        "statistics",
        "twoSamplePermutation"
      ],
      "description": "The two-sample permutation test (a split of the pooled values). It needs no normal distribution and no pairs, so it compares groups of different sizes. The p holds only if the values of the two groups can change places under the null.",
      "params": [
        "a",
        "b",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "a": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "b": {
            "type": "array",
            "items": {
              "type": "number"
            }
          },
          "options": {
            "$ref": "#/$defs/TwoSamplePermutationOptions"
          }
        },
        "required": [
          "a",
          "b"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/TwoSamplePermutationResult"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "uStatisticInterval",
      "path": [
        "statistics",
        "uStatisticInterval"
      ],
      "description": "This function gives the interval of a total over all the sets of `r` units of a population. The data is a uniform sample of `m` of the `n` units, without replacement. An example is the count of crossings between all pairs of routes. The input is the total of each sampled unit: the sum of the kernel over the sets of `r` sampled units that hold the unit. Thus the sum of the totals is `r * S`, with `S` the total of the sample. The kernel is symmetric.",
      "params": [
        "totals",
        "options"
      ],
      "input": {
        "type": "object",
        "properties": {
          "totals": {
            "type": "array",
            "items": {
              "type": "number"
            },
            "description": "The total of each unit of the sample. The sample has more units than `r`."
          },
          "options": {
            "$ref": "#/$defs/UStatisticOptions",
            "description": "The order, the population, the method, the level and the range of the kernel."
          }
        },
        "required": [
          "totals",
          "options"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/UStatisticInterval"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "whenHolds",
      "path": [
        "statistics",
        "whenHolds"
      ],
      "description": "This function gives true when a place has the condition of a dimension. A dimension with no condition is present.",
      "params": [
        "dimension",
        "values"
      ],
      "input": {
        "type": "object",
        "properties": {
          "dimension": {
            "$ref": "#/$defs/ResponseDimension"
          },
          "values": {
            "type": "object",
            "properties": {},
            "additionalProperties": {}
          }
        },
        "required": [
          "dimension",
          "values"
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
      "name": "wilson",
      "path": [
        "statistics",
        "wilson"
      ],
      "description": "The Wilson score interval of `k` successes in `n` trials (Wilson, 1927). It keeps its level for a small n and for a proportion near 0 or 1, where the normal interval does not. For n = 0 the interval is 0 to 1.",
      "params": [
        "k",
        "n",
        "z"
      ],
      "input": {
        "type": "object",
        "properties": {
          "k": {
            "type": "number"
          },
          "n": {
            "type": "number"
          },
          "z": {
            "type": "number"
          }
        },
        "required": [
          "k",
          "n"
        ],
        "additionalProperties": false
      },
      "output": {
        "$ref": "#/$defs/Proportion"
      },
      "effects": {
        "reads": [],
        "writes": []
      }
    },
    {
      "name": "wilsonSampleSize",
      "path": [
        "statistics",
        "wilsonSampleSize"
      ],
      "description": "The smallest number of trials `n` at which the Wilson lower end reaches `target`, when the true proportion is `expected`. Each `n` takes `round(expected × n)` successes. The function gives `undefined` when `expected` is not above `target`, or when no `n` up to `max` reaches it. An audit of an agreement uses it to fix its size.",
      "params": [
        "target",
        "expected",
        "z",
        "max"
      ],
      "input": {
        "type": "object",
        "properties": {
          "target": {
            "type": "number"
          },
          "expected": {
            "type": "number"
          },
          "z": {
            "type": "number"
          },
          "max": {
            "type": "number"
          }
        },
        "required": [
          "target",
          "expected"
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
    }
  ],
  "exempt": [],
  "others": {
    "classes": [],
    "values": 13,
    "types": 114
  }
};
